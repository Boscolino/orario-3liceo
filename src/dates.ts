// Utilità di date. Lavoriamo con stringhe "YYYY-MM-DD" e facciamo i calcoli
// a mezzogiorno UTC per non incappare mai in problemi di fuso/ora legale.

const DAY_MS = 86_400_000;

function atNoonUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function toDateStr(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function addDays(dateStr: string, n: number): string {
  return toDateStr(new Date(atNoonUTC(dateStr).getTime() + n * DAY_MS));
}

/** Lunedì della settimana che contiene `dateStr`. */
export function mondayOf(dateStr: string): string {
  const d = atNoonUTC(dateStr);
  const dow = d.getUTCDay(); // 0=dom, 1=lun, ... 6=sab
  const delta = dow === 0 ? -6 : 1 - dow;
  return toDateStr(new Date(d.getTime() + delta * DAY_MS));
}

/** "Oggi" nel fuso indicato, come stringa YYYY-MM-DD. */
export function todayStr(timeZone: string): string {
  // en-CA => formato YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Lunedì della settimana corrente nel fuso indicato. */
export function currentMonday(timeZone: string): string {
  return mondayOf(todayStr(timeZone));
}

/** Elenco dei lunedì da controllare: corrente + (count-1) successivi. */
export function weeksToCheck(timeZone: string, count: number): string[] {
  const start = currentMonday(timeZone);
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(addDays(start, i * 7));
  return out;
}

/** Venerdì della settimana (weekStart = lunedì). */
export function weekEnd(weekStart: string): string {
  return addDays(weekStart, 4);
}

/** 570 -> "09:30" */
export function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

const GIORNI = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const MESI = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];

/** "2026-09-08" -> "Martedì 8 settembre" */
export function humanDate(dateStr: string, withYear = false): string {
  const d = atNoonUTC(dateStr);
  const base = `${GIORNI[d.getUTCDay()]} ${d.getUTCDate()} ${MESI[d.getUTCMonth()]}`;
  return withYear ? `${base} ${d.getUTCFullYear()}` : base;
}

/** "2026-09-07" + "2026-09-13" -> "7–13 set 2026" (per i log) */
export function humanRange(startStr: string, endStr: string): string {
  const a = atNoonUTC(startStr);
  const b = atNoonUTC(endStr);
  const abbr = (d: Date) => MESI[d.getUTCMonth()].slice(0, 3);
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()}–${b.getUTCDate()} ${abbr(a)} ${a.getUTCFullYear()}`;
  }
  return `${a.getUTCDate()} ${abbr(a)} – ${b.getUTCDate()} ${abbr(b)} ${b.getUTCFullYear()}`;
}
