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
/** Regola per il blocco del pomeriggio (attività a scelta con più docenti). */
interface PomeriggioRule {
  titolo?: string; // titolo fisso dell'evento, es. "FLL"
  docente?: string; // cognome del docente che segue Leonardo: materia e docente mostrati sono i suoi
}
interface MaterieConfig {
  titleTemplate: string;
  byLastName: Record<string, string>;
  biweekly: Record<string, Biweekly>;
  pomeriggioDalle: number; // minuti da mezzanotte
  pomeriggio: Record<number, PomeriggioRule>; // chiave = giorno della settimana (1=lun … 5=ven)
}

const GIORNI: Record<string, number> = { lunedi: 1, martedi: 2, mercoledi: 3, giovedi: 4, venerdi: 5 };

let cache: MaterieConfig | null = null;

function load(): MaterieConfig {
  if (cache) return cache;
  const path = join(process.cwd(), "config", "materie.json");
  const empty: MaterieConfig = {
    titleTemplate: "{materia}",
    byLastName: {},
    biweekly: {},
    pomeriggioDalle: 14 * 60,
    pomeriggio: {},
  };
  if (!existsSync(path)) {
    cache = empty;
    return cache;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<MaterieConfig> & {
      pomeriggio?: Record<string, unknown>;
    };
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
    let pomeriggioDalle = 14 * 60;
    const pomeriggio: Record<number, PomeriggioRule> = {};
    for (const [k, v] of Object.entries(raw.pomeriggio ?? {})) {
      if (k === "dalle" && typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v)) {
        const [h, m] = v.split(":").map(Number);
        pomeriggioDalle = h * 60 + m;
        continue;
      }
      const day = GIORNI[k.toLowerCase()];
      if (!day || typeof v !== "object" || v === null) continue;
      const r = v as PomeriggioRule;
      pomeriggio[day] = {
        titolo: typeof r.titolo === "string" ? r.titolo : undefined,
        docente: typeof r.docente === "string" ? r.docente.toLowerCase() : undefined,
      };
    }
    cache = {
      titleTemplate: typeof raw.titleTemplate === "string" ? raw.titleTemplate : "{materia}",
      byLastName,
      biweekly,
      pomeriggioDalle,
      pomeriggio,
    };
  } catch {
    cache = empty;
  }
  return cache;
}

/** Regola del pomeriggio che vale per questa lezione, se c'è. Con `docente`
 *  vale solo se quel docente è effettivamente nel blocco (altrimenti è un
 *  cambio d'orario e si torna alla mappa normale). */
function afternoonRule(l: Lesson): PomeriggioRule | null {
  const cfg = load();
  if (l.startMinute < cfg.pomeriggioDalle) return null;
  const rule = cfg.pomeriggio[new Date(l.date + "T12:00:00Z").getUTCDay()];
  if (!rule) return null;
  if (rule.docente && !l.teacherKeys.includes(rule.docente)) return null;
  return rule;
}

/** Docenti da mostrare: nel blocco a scelta del pomeriggio solo quello di Leonardo. */
export function shownTeachers(l: Lesson): string[] {
  const rule = afternoonRule(l);
  if (!rule?.docente) return l.teachers;
  const i = l.teacherKeys.indexOf(rule.docente);
  return i >= 0 && l.teachers[i] ? [l.teachers[i]] : l.teachers;
}

/** Materia della lezione, se nota. `null` = sconosciuta (si terrà il cognome). */
export function subjectFor(l: Lesson): string | null {
  const cfg = load();
  const week = mondayOf(l.date);
  const rule = afternoonRule(l);
  if (rule?.titolo) return rule.titolo;
  const keys = rule?.docente ? [rule.docente] : l.teacherKeys;
  for (const key of keys) {
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
  const rule = afternoonRule(l);
  if (rule?.titolo) return rule.titolo;
  const subject = subjectFor(l);
  if (subject) return load().titleTemplate.replace("{materia}", subject);
  const surnames = l.teacherKeys.map((k) => k.charAt(0).toUpperCase() + k.slice(1));
  return surnames.join(" / ") || l.teachers.join(" / ") || l.title;
}
