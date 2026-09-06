// Punto di ingresso.
//
//   node src/main.ts print     recupera e stampa l'orario (nessuna scrittura)
//   node src/main.ts check      il controllo delle 06:00: confronto, .ics, notifica
//   node src/main.ts selftest   prova il confronto/notifica su dati simulati
//
import { config } from "./config.ts";
import { log } from "./log.ts";
import { fetchWeek } from "./fetch.ts";
import { renderWeek } from "./render.ts";
import { weeksToCheck, humanRange, weekEnd } from "./dates.ts";
import {
  loadState,
  saveState,
  loadCache,
  saveCache,
  storedWeek,
  putWeek,
  pruneWeeks,
  writeHeartbeat,
} from "./state.ts";
import { diffWeek, hasChanges, type WeekDiff } from "./diff.ts";
import { writeIcs } from "./ics.ts";
import { buildNotification, countChanges, detailLines } from "./summary.ts";
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

async function cmdCheck(): Promise<void> {
  const state = loadState();
  const cache = loadCache();
  const bootstrap = state.updatedAt === "";
  const weeks = weeksToCheck(config.timezone, config.checkWeeks);

  log.info(`Controllo orario ${config.className}…`);
  if (bootstrap) log.info("Primo avvio: inizializzo lo stato, nessuna notifica in questo run.");

  const fresh: WeekSchedule[] = [];
  for (const wk of weeks) {
    try {
      const s = await fetchWeek(wk, cache);
      if (s.publication) {
        log.info(
          `Settimana ${humanRange(wk, weekEnd(wk))}: pubblicazione v${s.publication.version} ` +
            `(${new Date(s.publication.publishedAt).toLocaleString("it-IT", { timeZone: config.timezone })}), ` +
            `${s.lessons.length} lezioni.`,
        );
        fresh.push(s);
      }
    } catch (err) {
      log.warn(`Settimana ${wk}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const diffs: WeekDiff[] = [];
  for (const s of fresh) {
    const before = storedWeek(state, s.weekStart)?.lessons ?? [];
    const d = diffWeek(s.weekStart, before, s.lessons);
    if (hasChanges(d)) diffs.push(d);
    putWeek(state, s);
  }
  pruneWeeks(state, weeks[0]);

  const changed = diffs.length > 0;

  // Riscriviamo sempre l'.ics: è deterministico, quindi cambia (e viene
  // committato) solo se cambia l'orario o il generatore.
  const ics = writeIcs(state);
  if (bootstrap || changed) log.info(`scuola.ics rigenerato: ${ics.eventCount} eventi.`);

  if (!bootstrap && changed) {
    log.info("Confronto con la versione precedente:");
    for (const line of detailLines(diffs)) log.info(`  ${line}`);
    log.info(`Trovate ${countChanges(diffs)} variazioni.`);

    const msg = buildNotification(diffs, true);
    const outcome = await sendNotification(msg);
    if (outcome.sent) log.info("Notifica inviata.");
    else log.warn(`Notifica NON inviata (${outcome.reason}).`);
  } else if (!bootstrap) {
    log.info("Nessuna variazione.");
    log.info("Nessuna notifica necessaria.");
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
      "Riceverai un messaggio come questo solo quando l'orario cambia.",
  });
  if (outcome.sent) log.info("Notifica di prova inviata.");
  else {
    log.error(`Notifica di prova NON inviata (${outcome.reason}).`);
    process.exitCode = 1;
  }
}

const commands: Record<string, () => Promise<void>> = {
  print: cmdPrint,
  check: cmdCheck,
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
