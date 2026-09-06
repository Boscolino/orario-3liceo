// Da WeekDiff a testo: titolo/corpo per la notifica e blocco dettagliato per il log.

import type { Lesson } from "./types.ts";
import type { WeekDiff, ModifiedLesson } from "./diff.ts";
import { hasChanges } from "./diff.ts";
import { humanDate } from "./dates.ts";
import { config } from "./config.ts";
import { activityLabel } from "./render.ts";
import { subjectFor } from "./subjects.ts";

// Inizio ora di lezione (minuti da mezzanotte) -> numero dell'ora.
const ORA_SLOTS = new Map<number, number>([
  [490, 1], [540, 2], [605, 3], [655, 4], [720, 5], [770, 6], [820, 7], [870, 8],
]);

function oraLabel(l: Lesson): string {
  const n = ORA_SLOTS.get(l.startMinute);
  const time = `${l.start}–${l.end}`;
  return n ? `${n}ª ora (${time})` : time;
}

function who(l: Lesson): string {
  const subject = subjectFor(l);
  const teachers = l.teachers.join(", ");
  if (subject) return teachers ? `${subject} (${teachers})` : subject;
  return teachers || "docente n.d.";
}

function where(l: Lesson): string {
  return l.room ? ` · ${l.room}` : "";
}

function kind(l: Lesson): string {
  return l.activityType !== "lesson" ? ` [${activityLabel(l.activityType)}]` : "";
}

function modLine(m: ModifiedLesson): string {
  const day = humanDate(m.after.date);
  const subjBefore = subjectFor(m.before);
  const subjAfter = subjectFor(m.after);
  const parts = m.changes.map((c) => {
    if (c.field === "docente") {
      // se cambia il docente e con lui la materia, il dato utile è la materia
      if (subjBefore && subjAfter && subjBefore !== subjAfter) {
        return `${subjBefore} → ${subjAfter} (${c.before} → ${c.after})`;
      }
      return `docente ${c.before} → ${c.after}`;
    }
    if (c.field === "aula") return `aula ${c.before} → ${c.after}`;
    if (c.field === "orario") return `orario ${c.before} → ${c.after}`;
    if (c.field === "giorno") return `spostata ${c.before} → ${c.after}`;
    if (c.field === "tipo") return `tipo ${c.before} → ${c.after}`;
    return `nota: ${c.after}`;
  });
  const prefix = subjAfter && !m.changes.some((c) => c.field === "docente") ? `${subjAfter} — ` : "";
  return `🔄 ${day}, ${oraLabel(m.after)}: ${prefix}${parts.join("; ")}`;
}

function addLine(l: Lesson): string {
  return `➕ ${humanDate(l.date)}, ${oraLabel(l)}: ${who(l)}${where(l)}${kind(l)}`;
}

function remLine(l: Lesson): string {
  return `➖ ${humanDate(l.date)}, ${oraLabel(l)}: ${who(l)}${where(l)}${kind(l)}`;
}

export function countChanges(diffs: WeekDiff[]): number {
  return diffs.reduce(
    (n, d) => n + d.added.length + d.removed.length + d.modified.length,
    0,
  );
}

/** Righe di dettaglio (una per variazione), già ordinate per settimana/giorno. */
export function detailLines(diffs: WeekDiff[]): string[] {
  const lines: string[] = [];
  for (const d of diffs) {
    if (!hasChanges(d)) continue;
    for (const m of d.modified) lines.push(modLine(m));
    for (const l of d.added) lines.push(addLine(l));
    for (const l of d.removed) lines.push(remLine(l));
  }
  return lines;
}

export interface NotificationText {
  title: string;
  body: string;
}

export function buildNotification(diffs: WeekDiff[], calendarUpdated: boolean): NotificationText {
  const n = countChanges(diffs);
  const plural = n === 1 ? "variazione" : "variazioni";
  const lines = detailLines(diffs);
  const tail = calendarUpdated
    ? "\nIl calendario è stato aggiornato automaticamente."
    : "";
  return {
    title: "📚 Orario aggiornato",
    body: `Trovate ${n} ${plural} (${config.className}):\n${lines.join("\n")}${tail}`,
  };
}
