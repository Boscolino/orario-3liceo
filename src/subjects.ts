// Mappa docente -> materia (config/materie.json), con supporto ai docenti
// che alternano due materie a settimane alterne.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Lesson } from "./types.ts";
import { mondayOf } from "./dates.ts";

interface Biweekly {
  default: string;
  alt: string;
  altWeeks: string[]; // lunedì YYYY-MM-DD in cui vale `alt` (lista esplicita)
  anchorWeek?: string; // in alternativa: lunedì di riferimento…
  anchorValue?: "alt" | "default"; // …e cosa si fa in quella settimana; poi alterna
}
interface MaterieConfig {
  titleTemplate: string;
  byLastName: Record<string, string>;
  biweekly: Record<string, Biweekly>;
}

let cache: MaterieConfig | null = null;

function load(): MaterieConfig {
  if (cache) return cache;
  const path = join(process.cwd(), "config", "materie.json");
  const empty: MaterieConfig = { titleTemplate: "{materia}", byLastName: {}, biweekly: {} };
  if (!existsSync(path)) {
    cache = empty;
    return cache;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<MaterieConfig>;
    const biweekly: Record<string, Biweekly> = {};
    for (const [k, v] of Object.entries(raw.biweekly ?? {})) {
      if (k.startsWith("_") || typeof v !== "object" || v === null) continue;
      const b = v as Partial<Biweekly>;
      if (b.default && b.alt) {
        biweekly[k.toLowerCase()] = {
          default: b.default,
          alt: b.alt,
          altWeeks: Array.isArray(b.altWeeks) ? b.altWeeks : [],
          anchorWeek: typeof b.anchorWeek === "string" ? b.anchorWeek : undefined,
          anchorValue: b.anchorValue === "alt" || b.anchorValue === "default" ? b.anchorValue : undefined,
        };
      }
    }
    const byLastName: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.byLastName ?? {})) {
      if (!k.startsWith("_") && typeof v === "string") byLastName[k.toLowerCase()] = v;
    }
    cache = {
      titleTemplate: typeof raw.titleTemplate === "string" ? raw.titleTemplate : "{materia}",
      byLastName,
      biweekly,
    };
  } catch {
    cache = empty;
  }
  return cache;
}

/** Materia della lezione, se nota. `null` = sconosciuta (si terrà il cognome). */
export function subjectFor(l: Lesson): string | null {
  const cfg = load();
  const week = mondayOf(l.date);
  for (const key of l.teacherKeys) {
    const bw = cfg.biweekly[key];
    if (bw) return biweeklyValue(bw, week);
    if (cfg.byLastName[key]) return cfg.byLastName[key];
  }
  return null;
}

function biweeklyValue(bw: Biweekly, week: string): string {
  if (bw.altWeeks.includes(week)) return bw.alt;
  if (bw.anchorWeek && bw.anchorValue) {
    const diff = Math.round(
      (Date.parse(week + "T12:00:00Z") - Date.parse(bw.anchorWeek + "T12:00:00Z")) / 604_800_000,
    );
    const sameParity = ((diff % 2) + 2) % 2 === 0;
    const onAnchor = bw.anchorValue === "alt";
    return sameParity === onAnchor ? bw.alt : bw.default;
  }
  return bw.default;
}

/** Titolo dell'evento: "Lezione di Fisica" se la materia è nota, altrimenti il cognome/e. */
export function lessonTitle(l: Lesson): string {
  const subject = subjectFor(l);
  if (subject) return load().titleTemplate.replace("{materia}", subject);
  const surnames = l.teacherKeys.map((k) => k.charAt(0).toUpperCase() + k.slice(1));
  return surnames.join(" / ") || l.teachers.join(" / ") || l.title;
}
