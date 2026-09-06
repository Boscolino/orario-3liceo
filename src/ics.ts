// Generazione del file .ics da sottoscrivere sull'iPhone come calendario "📚 Scuola".
// Rigenerato per intero a ogni run: le lezioni rimosse spariscono dal feed
// e iOS le toglie dal calendario automaticamente.

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { config } from "./config.ts";
import type { Lesson, StoredState } from "./types.ts";
import { activityLabel } from "./render.ts";
import { lessonTitle } from "./subjects.ts";
import { holidayMarkerVEvents } from "./holidays.ts";

const ICS_PATH = join(process.cwd(), "docs", "scuola.ics");

// Blocco VTIMEZONE per Europe/Rome (CET/CEST). Sufficiente per i client comuni.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Rome",
  "X-LIC-LOCATION:Europe/Rome",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Piegatura righe a 75 ottetti (RFC 5545), senza spezzare i caratteri multibyte. */
function fold(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    const limit = out.length === 0 ? 75 : 74; // le righe di continuazione hanno 1 spazio iniziale
    if (curBytes + n > limit) {
      out.push(cur);
      cur = "";
      curBytes = 0;
    }
    cur += ch;
    curBytes += n;
  }
  if (cur) out.push(cur);
  return out.map((s, i) => (i === 0 ? s : " " + s)).join("\r\n");
}

function dtLocal(dateStr: string, minutes: number): string {
  const [y, m, d] = dateStr.split("-");
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${y}${m}${d}T${hh}${mm}00`;
}

function dtUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function summary(l: Lesson): string {
  if (l.activityType !== "lesson") {
    const who = l.teachers.join(" / ");
    return who ? `${activityLabel(l.activityType)} · ${who}` : activityLabel(l.activityType);
  }
  return lessonTitle(l); // "Lezione di Fisica" se nota, altrimenti il cognome
}

function description(l: Lesson): string {
  const rows: string[] = [];
  if (l.teachers.length) rows.push(`Docente: ${l.teachers.join(", ")}`);
  if (l.room) rows.push(`Aula: ${l.room}`);
  if (l.activityType !== "lesson") rows.push(`Tipo: ${activityLabel(l.activityType)}`);
  if (l.notes) rows.push(`Nota: ${l.notes}`);
  const marks: string[] = [];
  if (l.isVariation) marks.push("variazione rispetto all'orario standard");
  else if (l.baselineStatus === "modified") marks.push("orario modificato per questa settimana");
  if (l.hasSubstitution) marks.push("con supplenza");
  if (marks.length) rows.push(`⚠️ ${marks.join("; ")}`);
  return rows.join("\n");
}

export interface IcsResult {
  path: string;
  eventCount: number;
  content: string;
}

export function buildIcs(state: StoredState): IcsResult {
  // DTSTAMP deterministico: la data di pubblicazione più recente tra le
  // settimane note (fallback: epoch). Così l'.ics cambia SOLO quando cambia
  // l'orario o il generatore — niente commit inutili a ogni run.
  const stamps = Object.values(state.weeks)
    .map((w) => w.publication?.publishedAt)
    .filter((x): x is string => Boolean(x))
    .sort();
  const now = dtUtc(stamps[stamps.length - 1] ?? "1970-01-01T00:00:00.000Z");
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//orario-3liceo//sync//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(config.calendarName + " – " + config.className)}`,
    `X-WR-TIMEZONE:${config.timezone}`,
    `X-WR-CALDESC:${esc("Orario " + config.className + " · sincronizzato da orario-3liceo")}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    // arancione "scuola" (Apple Calendar lo legge alla prima iscrizione)
    "COLOR:orange",
    "X-APPLE-CALENDAR-COLOR:#FF9500",
    ...VTIMEZONE,
  ];

  const weeks = Object.values(state.weeks).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  let count = 0;
  for (const w of weeks) {
    const seq = w.publication?.version ?? 0;
    const stamp = w.publication ? dtUtc(w.publication.publishedAt) : now;
    for (const l of w.lessons) {
      count++;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${l.uid}@orario-3liceo`,
        `DTSTAMP:${now}`,
        `LAST-MODIFIED:${stamp}`,
        `SEQUENCE:${seq}`,
        `DTSTART;TZID=${config.timezone}:${dtLocal(l.date, l.startMinute)}`,
        `DTEND;TZID=${config.timezone}:${dtLocal(l.date, l.endMinute)}`,
        `SUMMARY:${esc(summary(l))}`,
        `DESCRIPTION:${esc(description(l))}`,
        "STATUS:CONFIRMED",
        "TRANSP:OPAQUE",
      );
      lines.push(`LOCATION:${esc(config.schoolVenue)}`); // solo la scuola; l'aula è nelle note
      lines.push("END:VEVENT");
    }
  }
  lines.push(...holidayMarkerVEvents(esc, now));
  lines.push("END:VCALENDAR");

  const content = lines.map(fold).join("\r\n") + "\r\n";
  return { path: ICS_PATH, eventCount: count, content };
}

export function writeIcs(state: StoredState): IcsResult {
  const res = buildIcs(state);
  mkdirSync(dirname(res.path), { recursive: true });
  writeFileSync(res.path, res.content, "utf8");
  return res;
}
