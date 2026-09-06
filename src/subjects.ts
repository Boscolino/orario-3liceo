// Mappa docente -> materia (config/materie.json), con supporto ai docenti
// che alternano due materie a settimane alterne.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Lesson } from "./types.ts";
import { mondayOf } from "./dates.ts";

interface Biweekly {
  default: string;
  alt: string;
  altWeeks: string[]; // lunedì YYYY-MM-DD in cui vale `alt`
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
    if (bw) return bw.altWeeks.includes(week) ? bw.alt : bw.default;
    if (cfg.byLastName[key]) return cfg.byLastName[key];
  }
  return null;
}

/** Titolo dell'evento: "Lezione di Fisica" se la materia è nota, altrimenti il cognome/e. */
export function lessonTitle(l: Lesson): string {
  const subject = subjectFor(l);
  if (subject) return load().titleTemplate.replace("{materia}", subject);
  const surnames = l.teacherKeys.map((k) => k.charAt(0).toUpperCase() + k.slice(1));
  return surnames.join(" / ") || l.teachers.join(" / ") || l.title;
}
