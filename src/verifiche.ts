// Verifiche del venerdì (config/verifiche.json): nel primo blocco di ogni
// venerdì elencato, al posto della lezione normale va mostrato il testo
// della verifica.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Lesson } from "./types.ts";
import { isFriday } from "./dates.ts";

let cache: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (cache) return cache;
  const path = join(process.cwd(), "config", "verifiche.json");
  cache = {};
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as { venerdi?: unknown };
      if (raw.venerdi && typeof raw.venerdi === "object") {
        for (const [date, text] of Object.entries(raw.venerdi as Record<string, unknown>)) {
          if (typeof text === "string" && text.trim()) cache[date] = text.trim();
        }
      }
    } catch {
      cache = {};
    }
  }
  return cache;
}

/**
 * Testo della verifica da sostituire alla lezione, se questo blocco è il
 * primo di un venerdì presente in config/verifiche.json. Altrimenti null
 * (si usa la materia/il docente normali).
 */
export function verificaOverride(l: Lesson): string | null {
  if (!l.isFirstOfDay || !isFriday(l.date)) return null;
  return load()[l.date] ?? null;
}
