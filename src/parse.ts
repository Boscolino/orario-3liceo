// Normalizzazione dei dati grezzi del sito nel nostro modello.

import type { RawEntry, Lesson, Publication } from "./types.ts";
import { fmtMinutes } from "./dates.ts";

interface SiteEntry {
  date: string;
  title?: string | null;
  activityType?: string | null;
  teachers?: Array<{ name?: string; normalizedLastName?: string }> | null;
  locations?: Array<{ label?: string; code?: string }> | null;
  publicNotes?: string | null;
  startMinute: number;
  endMinute: number;
  occurrenceId: string;
  baselineStatus?: string | null;
  isVariation?: boolean | null;
  substitutions?: unknown[] | null;
}

/** "Marica Ottavia Rizzo" -> "rizzo" (accenti rimossi, minuscolo). */
export function lastNameKey(name: string): string {
  const w = name.trim().split(/\s+/).pop() ?? "";
  return w.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function normalizeEntry(e: SiteEntry): RawEntry {
  const rawTeachers = e.teachers ?? [];
  const teachers = rawTeachers.map((t) => (t?.name ?? "").trim()).filter(Boolean);
  const teacherKeys = rawTeachers
    .map((t) => (t?.normalizedLastName || lastNameKey(t?.name ?? "")).trim().toLowerCase())
    .filter(Boolean);
  const loc = (e.locations ?? [])[0];
  const room = (loc?.label ?? loc?.code ?? "").trim() || null;
  return {
    date: e.date,
    startMinute: e.startMinute,
    endMinute: e.endMinute,
    title: (e.title ?? "Lezione").trim() || "Lezione",
    activityType: (e.activityType ?? "lesson").trim() || "lesson",
    teachers,
    teacherKeys,
    room,
    notes: (e.publicNotes ?? "").trim() || null,
    occurrenceId: e.occurrenceId,
    baselineStatus: (e.baselineStatus ?? "base").trim() || "base",
    isVariation: Boolean(e.isVariation),
    hasSubstitution: Array.isArray(e.substitutions) && e.substitutions.length > 0,
  };
}

/** Chiave di raggruppamento: due blocchi adiacenti "uguali" diventano una lezione. */
function mergeKey(e: RawEntry): string {
  return [
    e.date,
    e.activityType,
    e.title,
    e.teachers.join("|"),
    e.room ?? "",
  ].join("§");
}

/**
 * Unisce i blocchi da ~50' contigui (stesso giorno, docente, aula, tipo) in
 * un'unica lezione, come fa la vista del sito. L'UID stabile è il primo
 * occurrenceId del gruppo, in ordine di orario.
 */
export function mergeEntries(entries: RawEntry[]): Lesson[] {
  const sorted = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute,
  );
  const groups: RawEntry[][] = [];
  for (const e of sorted) {
    const g = groups[groups.length - 1];
    const last = g?.[g.length - 1];
    if (g && last && mergeKey(last) === mergeKey(e) && last.endMinute === e.startMinute) {
      g.push(e);
    } else {
      groups.push([e]);
    }
  }

  const lessons: Lesson[] = [];
  for (const g of groups) {
    const first = g[0];
    const last = g[g.length - 1];
    lessons.push({
      uid: g[0].occurrenceId,
      date: first.date,
      startMinute: first.startMinute,
      endMinute: last.endMinute,
      start: fmtMinutes(first.startMinute),
      end: fmtMinutes(last.endMinute),
      title: first.title,
      activityType: first.activityType,
      teachers: first.teachers,
      teacherKeys: first.teacherKeys,
      room: first.room,
      notes: g.map((e) => e.notes).find((n) => n) ?? null,
      occurrenceIds: g.map((e) => e.occurrenceId),
      baselineStatus: g.some((e) => e.baselineStatus === "modified") ? "modified" : "base",
      isVariation: g.some((e) => e.isVariation),
      hasSubstitution: g.some((e) => e.hasSubstitution),
    });
  }
  lessons.sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute);
  return lessons;
}

/** Estrae il publicationId dall'HTML della pagina settimana (link PDF/JSON/ICS). */
export function extractPublicationId(html: string): string | null {
  const m = html.match(/publications\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1] : null;
}

/** Legge il payload JSON dell'endpoint /api/publications/{id}/json?class=... */
export function parsePublicationJson(raw: string): {
  publication: Publication | null;
  entries: RawEntry[];
} {
  const data = JSON.parse(raw) as {
    publication?: { id: string; version: number; publishedAt: string; weekStart: string };
    entries?: SiteEntry[];
  };
  const publication = data.publication
    ? {
        id: data.publication.id,
        version: data.publication.version,
        publishedAt: data.publication.publishedAt,
        weekStart: data.publication.weekStart,
      }
    : null;
  const entries = (data.entries ?? []).map(normalizeEntry);
  return { publication, entries };
}

/**
 * Fallback: se l'endpoint JSON non è disponibile, i blocchi lezione sono
 * comunque incorporati nell'HTML come oggetti  "block":{...}  dentro i
 * payload React Server Components (script  self.__next_f.push([1,"…"])  ).
 */
export function parseEntriesFromHtml(html: string): RawEntry[] {
  const payload = decodeNextPayload(html);
  const blocks: RawEntry[] = [];
  const seen = new Set<string>();
  const re = /"block":\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(payload))) {
    const obj = readBalancedObject(payload, m.index + m[0].length - 1);
    if (!obj) continue;
    let parsed: SiteEntry;
    try {
      parsed = JSON.parse(obj) as SiteEntry;
    } catch {
      continue;
    }
    if (!parsed || typeof parsed.startMinute !== "number" || !parsed.occurrenceId) continue;
    if (!Array.isArray(parsed.teachers) && parsed.teachers != null) continue; // scarta i riferimenti RSC
    if (seen.has(parsed.occurrenceId)) continue;
    seen.add(parsed.occurrenceId);
    blocks.push(normalizeEntry(parsed));
  }
  return blocks;
}

/** Concatena le stringhe dei push  self.__next_f.push([1,"…"])  già de-escappate da JSON.parse. */
function decodeNextPayload(html: string): string {
  const re = /self\.__next_f\.push\((\[1,"(?:[^"\\]|\\.)*"\])\)/g;
  let out = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const arr = JSON.parse(m[1]) as [number, string];
      if (typeof arr[1] === "string") out += arr[1];
    } catch {
      /* salta il push non parsabile */
    }
  }
  return out;
}

function readBalancedObject(s: string, openBraceIdx: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = openBraceIdx; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(openBraceIdx, i + 1);
    }
  }
  return null;
}
