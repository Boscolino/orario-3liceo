// Punto di ingresso.
//
//   node src/main.ts print               recupera e stampa l'orario (nessuna scrittura)
//   node src/main.ts check [modo]        il controllo: confronto, .ics, notifica
//     modo = morning (default)  -> notifica sempre (variazioni, o "invariato")
//            daytime            -> notifica SOLO se ci sono variazioni
//            auto               -> decide da solo in base all'ora locale
//                                  (06 -> morning, 07-13 -> daytime, altrimenti non fa nulla)
//   node src/main.ts selftest            prova il confronto/notifica su dati simulati
//
import { config } from "./config.ts";
import { log } from "./log.ts";
import { fetchWeek } from "./fetch.ts";
import { renderWeek } from "./render.ts";
import { weeksToCheck, humanRange, weekEnd, currentMonday, addDays, todayStr, localHour } from "./dates.ts";
import { weekFullyHoliday, termBounds } from "./holidays.ts";
import {
  loadState,
  saveState,
  loadCache,
  saveCache,
  storedWeek,
  putWeek,
  pruneWeeksOutsideTerm,
  writeHeartbeat,
} from "./state.ts";
import { diffWeek, hasChanges, type WeekDiff } from "./diff.ts";
import { writeIcs } from "./ics.ts";
import { buildNoChangeNotification, buildNotification, countChanges, detailLines } from "./summary.ts";
import { sendNotification } from "./notify.ts";
import { runSelftest } from "./selftest.ts";
import type { HttpCacheMeta, WeekSchedule } from "./types.ts";

async function cmdPrint(): Promise<void> {
  log.info(`Controllo orario ${config.className} (${config.classSlug}) su ${config.siteHost}…`);
  const cache: HttpCacheMeta = {};
  for (const wk of weeksToCheck(config.timezone, config.checkWeeks)) {
    const schedule = await fetchWeek(wk, cache);
    console.log("\n" + renderWeek(schedule));
  }
  console.log("");
}

type CheckMode = "morning" | "daytime";

/**
 * In modalità "auto" (usata dal cron), decide da sola cosa fare in base
 * all'ora locale: a `config.morningHour` è il controllo del mattino
 * (notifica sempre), alle ore in `config.daytimeHours` è un controllo che
 * notifica solo se ci sono variazioni, fuori da queste ore non fa nulla —
 * il cron gira più spesso del necessario apposta, per restare corretto
 * col cambio d'ora legale.
 */
function resolveMode(arg: string | undefined): CheckMode | null {
  if (arg === "daytime") return "daytime";
  if (arg === "morning" || arg === undefined) return "morning";
  if (arg === "auto") {
    const h = localHour(config.timezone);
    if (h === config.morningHour) return "morning";
    if (config.daytimeHours.has(h)) return "daytime";
    return null;
  }
  throw new Error(`Modo sconosciuto: ${arg} (usa morning, daytime o auto)`);
}

async function cmdCheck(modeArg: string | undefined): Promise<void> {
  const mode = resolveMode(modeArg);
  if (!mode) {
    log.info(`Fuori dalla finestra di controllo (ora locale ${localHour(config.timezone)}): non faccio nulla.`);
    return;
  }
  log.info(`Modalità: ${mode === "morning" ? "mattina (notifica sempre)" : "pomeriggio (notifica solo variazioni)"}.`);

  const state = loadState();
  const cache = loadCache();
  const bootstrap = state.updatedAt === "";
  const firstMonday = currentMonday(config.timezone);

  log.info(`Controllo orario ${config.className}…`);
  if (bootstrap) log.info("Primo avvio: inizializzo lo stato, nessuna notifica in questo run.");

  // Le settimane passate restano in calendario per sempre: se una manca
  // dallo stato (es. un vecchio bug, o un run saltato) e il sito la serve
  // ancora, la recuperiamo qui — senza generare variazioni/notifiche,
  // è solo un ripristino silenzioso.
  const term = termBounds();
  const backfillFrom = term.start && term.start > firstMonday ? null : term.start;
  if (backfillFrom) {
    for (let wk = backfillFrom; wk < firstMonday; wk = addDays(wk, 7)) {
      if (state.weeks[wk] || weekFullyHoliday(wk)) continue;
      try {
        const s = await fetchWeek(wk, cache);
        if (s.publication) {
          putWeek(state, s);
          log.info(`Settimana ${humanRange(wk, weekEnd(wk))}: ripristinata (mancava dallo stato).`);
        }
      } catch (err) {
        log.warn(`Ripristino settimana ${wk}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Si guarda avanti finché il sito ha settimane pubblicate: così, appena
  // esce l'orario definitivo (settimane pubblicate in blocco), finiscono
  // tutte in calendario. Ci si ferma dopo 3 settimane consecutive non
  // pubblicate (le vacanze non contano), comunque entro `maxWeeks`.
  const fresh: WeekSchedule[] = [];
  let misses = 0;
  for (let i = 0; i < config.maxWeeks; i++) {
    const wk = addDays(firstMonday, i * 7);
    if (i >= config.checkWeeks && misses >= 3) break;
    if (weekFullyHoliday(wk)) continue; // settimana di sola vacanza: salta, non conta come "miss"
    try {
      const s = await fetchWeek(wk, cache);
      if (s.publication) {
        misses = 0;
        log.info(
          `Settimana ${humanRange(wk, weekEnd(wk))}: pubblicazione v${s.publication.version} ` +
            `(${new Date(s.publication.publishedAt).toLocaleString("it-IT", { timeZone: config.timezone })}), ` +
            `${s.lessons.length} lezioni.`,
        );
        fresh.push(s);
      } else if (!s.notModified) {
        misses++;
      }
    } catch (err) {
      log.warn(`Settimana ${wk}: ${err instanceof Error ? err.message : String(err)}`);
      misses++;
    }
  }

  const diffs: WeekDiff[] = [];
  for (const s of fresh) {
    const before = storedWeek(state, s.weekStart)?.lessons ?? [];
    const d = diffWeek(s.weekStart, before, s.lessons);
    if (hasChanges(d)) diffs.push(d);
    putWeek(state, s);
  }
  // Le settimane passate NON vengono tolte dal calendario: restano per
  // sempre una volta pubblicate. Puliamo solo eventuali avanzi fuori
  // dall'anno scolastico configurato (config/vacanze.json).
  pruneWeeksOutsideTerm(state, term.start, term.end);
  // Settimane di sola vacanza: nessuna lezione in stato (i marker 🏖️ vengono da config).
  for (const k of Object.keys(state.weeks)) {
    if (weekFullyHoliday(k)) delete state.weeks[k];
  }

  const changed = diffs.length > 0;

  // Riscriviamo sempre l'.ics: è deterministico, quindi cambia (e viene
  // committato) solo se cambia l'orario o il generatore.
  const ics = writeIcs(state);
  if (bootstrap || changed) log.info(`scuola.ics rigenerato: ${ics.eventCount} eventi.`);

  // Notifica di ogni giorno: variazioni se ce ne sono, altrimenti conferma
  // "nessun cambiamento". Il workflow può girare più volte nella stessa
  // mattina (per l'ora legale): una variazione si notifica sempre, ma la
  // conferma "nessun cambiamento" al massimo una volta al giorno.
  // L'unica eccezione è il primo avvio in assoluto, che serve solo a
  // costruire lo stato di partenza.
  if (!bootstrap) {
    const today = todayStr(config.timezone);
    const alreadyNotifiedToday = state.lastNotification?.date === today;

    if (changed) {
      log.info("Confronto con la versione precedente:");
      for (const line of detailLines(diffs)) log.info(`  ${line}`);
      log.info(`Trovate ${countChanges(diffs)} variazioni.`);

      const outcome = await sendNotification(buildNotification(diffs, true));
      if (outcome.sent) log.info("Notifica inviata.");
      else log.warn(`Notifica NON inviata (${outcome.reason}).`);
      state.lastNotification = { date: today, kind: "changes" };
    } else {
      log.info("Nessuna variazione.");
      if (mode === "daytime") {
        log.info("Modalità pomeriggio: nessuna notifica quando non ci sono variazioni.");
      } else if (alreadyNotifiedToday) {
        log.info("Notifica già inviata oggi: non ripeto.");
      } else {
        const outcome = await sendNotification(buildNoChangeNotification());
        if (outcome.sent) log.info("Notifica inviata (nessun cambiamento).");
        else log.warn(`Notifica NON inviata (${outcome.reason}).`);
        state.lastNotification = { date: today, kind: "none" };
      }
    }
  }

  saveState(state);
  saveCache(cache);
  writeHeartbeat();
}

async function cmdTestNotify(): Promise<void> {
  const outcome = await sendNotification({
    title: "📚 Test orario-3liceo",
    body:
      "Notifica di prova: il canale funziona.\n" +
      "Ogni mattina ne ricevi una: con le variazioni, o \"Orario invariato\" se non cambia nulla.",
  });
  if (outcome.sent) log.info("Notifica di prova inviata.");
  else {
    log.error(`Notifica di prova NON inviata (${outcome.reason}).`);
    process.exitCode = 1;
  }
}

const commands: Record<string, () => Promise<void>> = {
  print: cmdPrint,
  check: () => cmdCheck(process.argv[3]),
  selftest: async () => runSelftest(),
  "test-notify": cmdTestNotify,
};

const cmd = process.argv[2] ?? "print";
const run = commands[cmd];
if (!run) {
  log.error(`Comando sconosciuto: ${cmd}. Disponibili: ${Object.keys(commands).join(", ")}`);
  process.exit(2);
}
run().catch((err) => {
  log.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exit(1);
});
