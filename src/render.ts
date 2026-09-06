// Resa testuale dell'orario, per il terminale.

import type { Lesson, WeekSchedule } from "./types.ts";
import { humanDate, humanRange, weekEnd } from "./dates.ts";
import { config } from "./config.ts";
import { subjectFor } from "./subjects.ts";

const ACTIVITY_LABEL: Record<string, string> = {
  lesson: "Lezione",
  schedule_change: "Cambio ora",
  extra_hours: "Supplenza extra orario",
  educational_trip: "Uscita didattica",
  activity: "Attività",
  laboratory: "Laboratorio",
  seminar: "Seminario",
  mixed: "Attività/cambi vari",
};

export function activityLabel(type: string): string {
  return ACTIVITY_LABEL[type] ?? type;
}

/** Riga compatta di una lezione. */
export function lessonLine(l: Lesson): string {
  const subject = subjectFor(l);
  const teachers = l.teachers.join(", ");
  const who = subject
    ? `${subject}${teachers ? ` (${teachers})` : ""}`
    : teachers || "—";
  const where = l.room ? ` · ${l.room}` : "";
  const kind = l.activityType !== "lesson" ? ` [${activityLabel(l.activityType)}]` : "";
  const flags: string[] = [];
  if (l.isVariation) flags.push("variazione");
  else if (l.baselineStatus === "modified") flags.push("modificata");
  if (l.hasSubstitution) flags.push("supplenza");
  const flag = flags.length ? `  (${flags.join(", ")})` : "";
  const note = l.notes ? `  — ${l.notes}` : "";
  return `  ${l.start}–${l.end}  ${who}${where}${kind}${flag}${note}`;
}

export function renderWeek(w: WeekSchedule): string {
  const out: string[] = [];
  const range = humanRange(w.weekStart, weekEnd(w.weekStart));
  out.push(`━━━ ${config.className} · settimana ${range} ━━━`);
  if (!w.publication) {
    out.push(w.notModified ? "  (nessuna modifica dall'ultimo controllo)" : "  (settimana non ancora pubblicata)");
    return out.join("\n");
  }
  const pubDate = new Date(w.publication.publishedAt).toLocaleString("it-IT", {
    timeZone: config.timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  out.push(`  pubblicazione v${w.publication.version} · ${pubDate}`);

  const byDay = new Map<string, Lesson[]>();
  for (const l of w.lessons) {
    const g = byDay.get(l.date) ?? [];
    g.push(l);
    byDay.set(l.date, g);
  }
  for (const [date, lessons] of [...byDay.entries()].sort()) {
    out.push("");
    out.push(`  ${humanDate(date)}`);
    for (const l of lessons) out.push(lessonLine(l));
  }
  return out.join("\n");
}
