// Vacanze scolastiche (config/vacanze.json). Le lezioni che cadono in un
// periodo di vacanza non finiscono in calendario; opzionalmente si aggiungono
// eventi "tutto il giorno" che segnano le vacanze.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { addDays } from "./dates.ts";

export interface Break {
  name: string;
  from: string; // YYYY-MM-DD incluso
  to: string; // YYYY-MM-DD incluso
}
interface VacanzeConfig {
  addAllDayMarkers: boolean;
  breaks: Break[];
  termStart: string | null;
  termEnd: string | null;
}

let cache: VacanzeConfig | null = null;

function load(): VacanzeConfig {
  if (cache) return cache;
  const path = join(process.cwd(), "config", "vacanze.json");
  const empty: VacanzeConfig = { addAllDayMarkers: false, breaks: [], termStart: null, termEnd: null };
  if (!existsSync(path)) {
    cache = empty;
    return cache;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<VacanzeConfig>;
    const breaks = (raw.breaks ?? [])
      .filter((b): b is Break => Boolean(b && b.name && b.from && b.to))
      .map((b) => ({ name: b.name, from: b.from, to: b.to }))
      .sort((a, b) => a.from.localeCompare(b.from));
    cache = {
      addAllDayMarkers: raw.addAllDayMarkers === true,
      breaks,
      termStart: typeof raw.termStart === "string" ? raw.termStart : null,
      termEnd: typeof raw.termEnd === "string" ? raw.termEnd : null,
    };
  } catch {
    cache = empty;
  }
  return cache;
}

/** Inizio/fine dell'anno scolastico (per non buttare via, per errore, settimane fuori range). */
export function termBounds(): { start: string | null; end: string | null } {
  const c = load();
  return { start: c.termStart, end: c.termEnd };
}

/** Il giorno `date` è in vacanza? Ritorna il periodo, oppure null. */
export function holidayOn(date: string): Break | null {
  for (const b of load().breaks) {
    if (date >= b.from && date <= b.to) return b;
  }
  return null;
}

export function allDayMarkersEnabled(): boolean {
  return load().addAllDayMarkers;
}

/** Tutti i giorni feriali (lun–ven) della settimana sono in vacanza? */
export function weekFullyHoliday(weekStart: string): boolean {
  for (let i = 0; i < 5; i++) {
    if (!holidayOn(addDays(weekStart, i))) return false;
  }
  return true;
}

/** Righe VEVENT (già pronte) per i periodi di vacanza, come eventi tutto-il-giorno. */
export function holidayMarkerVEvents(escape: (s: string) => string, dtstamp: string): string[] {
  if (!load().addAllDayMarkers) return [];
  const lines: string[] = [];
  for (const b of load().breaks) {
    const endExclusive = addDays(b.to, 1).replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:vacanza-${b.from}@orario-3liceo`,
      `DTSTAMP:${dtstamp}`,
      `SUMMARY:${escape("🏖️ " + b.name)}`,
      `DTSTART;VALUE=DATE:${b.from.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${endExclusive}`,
      "TRANSP:TRANSPARENT",
      "X-MICROSOFT-CDO-BUSYSTATUS:FREE",
      "END:VEVENT",
    );
  }
  return lines;
}
