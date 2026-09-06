// Prova end-to-end del confronto e della notifica su dati simulati,
// senza toccare né il sito né lo stato salvato.

import type { Lesson, StoredState } from "./types.ts";
import { diffWeek, hasChanges } from "./diff.ts";
import { buildIcs } from "./ics.ts";
import { buildNotification, countChanges, detailLines } from "./summary.ts";
import { fmtMinutes } from "./dates.ts";

function L(
  uid: string,
  date: string,
  startMinute: number,
  endMinute: number,
  teachers: string[],
  room: string | null,
  extra: Partial<Lesson> = {},
): Lesson {
  return {
    uid,
    date,
    startMinute,
    endMinute,
    start: fmtMinutes(startMinute),
    end: fmtMinutes(endMinute),
    title: "Lezione",
    activityType: "lesson",
    teachers,
    room,
    notes: null,
    occurrenceIds: [uid],
    baselineStatus: "base",
    isVariation: false,
    hasSubstitution: false,
    ...extra,
  };
}

const WK = "2026-09-14";

const before: Lesson[] = [
  L("a1", "2026-09-14", 490, 590, ["Francesca Dasti"], "3LSA"),
  L("a2", "2026-09-14", 605, 655, ["Francesco Carraro"], "3LSA"),
  L("a3", "2026-09-15", 490, 540, ["Giulia Pontalti"], "3LSA"),
  L("a4", "2026-09-15", 720, 820, ["Giorgia Modonese"], "3LSA"),
  L("a5", "2026-09-16", 605, 705, ["Andrea Telloli"], "Palestra"),
];

const after: Lesson[] = [
  // invariata
  L("a1", "2026-09-14", 490, 590, ["Francesca Dasti"], "3LSA"),
  // cambio docente
  L("a2", "2026-09-14", 605, 655, ["Chiara Bianchi"], "3LSA"),
  // cambio aula + orario (spostata di un'ora)
  L("a3", "2026-09-15", 540, 590, ["Giulia Pontalti"], "Aula 204"),
  // a4 rimossa
  // a5 diventa "uscita didattica"
  L("a5", "2026-09-16", 605, 705, ["Andrea Telloli"], "Palestra", {
    activityType: "educational_trip",
  }),
  // lezione aggiunta
  L("a6", "2026-09-16", 720, 770, ["Kevin Delugan"], "3LSA", { isVariation: true }),
];

export function runSelftest(): void {
  const d = diffWeek(WK, before, after);
  console.log("=== DIFF ===");
  console.log(JSON.stringify(d, null, 2));

  console.log("\n=== DETTAGLIO ===");
  for (const line of detailLines([d])) console.log(line);

  console.log("\n=== NOTIFICA ===");
  const msg = buildNotification([d], true);
  console.log(msg.title);
  console.log(msg.body);

  const state: StoredState = {
    classSlug: "3liceo",
    updatedAt: new Date().toISOString(),
    weeks: {
      [WK]: {
        weekStart: WK,
        publication: { id: "test", version: 4, publishedAt: "2026-09-13T18:00:00.000Z", weekStart: WK },
        lessons: after,
      },
    },
  };
  const ics = buildIcs(state);
  console.log("\n=== ICS (" + ics.eventCount + " eventi) ===");
  console.log(ics.content);

  // Verifiche
  const problems: string[] = [];
  if (!hasChanges(d)) problems.push("il diff dovrebbe rilevare modifiche");
  if (d.added.length !== 1) problems.push(`added attesi 1, trovati ${d.added.length}`);
  if (d.removed.length !== 1) problems.push(`removed attesi 1, trovati ${d.removed.length}`);
  if (d.modified.length !== 3) problems.push(`modified attesi 3, trovati ${d.modified.length}`);
  if (countChanges([d]) !== 5) problems.push(`totale variazioni atteso 5, trovato ${countChanges([d])}`);
  if (!ics.content.includes("BEGIN:VEVENT")) problems.push("ics senza eventi");
  if (!/UID:a6@orario-3liceo/.test(ics.content)) problems.push("ics: manca l'evento aggiunto");
  if (/\r\n\r\n/.test(ics.content.trim())) problems.push("ics: righe vuote di troppo");
  for (const line of ics.content.split("\r\n")) {
    if (Buffer.byteLength(line, "utf8") > 75) problems.push(`ics: riga troppo lunga (${line.slice(0, 30)}…)`);
  }

  console.log("\n=== ESITO ===");
  if (problems.length) {
    for (const p of problems) console.log("❌ " + p);
    process.exitCode = 1;
  } else {
    console.log("✅ tutte le verifiche superate");
  }
}
