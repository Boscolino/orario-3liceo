// Filtro per parole chiave (config/filtri.json): esclude dal calendario le
// lezioni che contengono certe parole (es. attività musicali non volute).

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { RawEntry } from "./types.ts";
import { activityLabel } from "./render.ts";

let keywords: string[] | null = null;

function load(): string[] {
  if (keywords) return keywords;
  const path = join(process.cwd(), "config", "filtri.json");
  keywords = [];
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as { escludiSeContiene?: unknown };
      if (Array.isArray(raw.escludiSeContiene)) {
        keywords = raw.escludiSeContiene
          .filter((k): k is string => typeof k === "string")
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean);
      }
    } catch {
      keywords = [];
    }
  }
  return keywords;
}

/** true se la lezione va esclusa per una parola chiave. */
export function isExcluded(e: RawEntry): boolean {
  const kws = load();
  if (kws.length === 0) return false;
  const hay = [
    e.title,
    e.notes ?? "",
    e.room ?? "",
    activityLabel(e.activityType),
    ...e.teachers,
  ]
    .join(" ")
    .toLowerCase();
  return kws.some((k) => hay.includes(k));
}
