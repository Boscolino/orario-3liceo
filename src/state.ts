// Stato persistente tra un run e l'altro: copia dell'ultimo orario noto
// e metadati per le richieste condizionali. Vengono committati nel repo
// dal workflow, così il confronto sopravvive tra le esecuzioni cloud.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "./config.ts";
import type { HttpCacheMeta, StoredState, StoredWeek, WeekSchedule } from "./types.ts";

const STATE_DIR = join(process.cwd(), "state");
const statePath = () => join(STATE_DIR, `${config.classSlug}.json`);
const cachePath = () => join(STATE_DIR, `${config.classSlug}.http-cache.json`);

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function loadState(): StoredState {
  return readJson<StoredState>(statePath(), {
    classSlug: config.classSlug,
    updatedAt: "",
    weeks: {},
  });
}

export function saveState(state: StoredState): void {
  state.classSlug = config.classSlug;
  state.updatedAt = new Date().toISOString();
  writeJson(statePath(), state);
}

/**
 * Scrive un timestamp a ogni run. Serve a garantire almeno un commit al
 * giorno sul repo: senza attività per 60 giorni GitHub disabilita i cron.
 */
export function writeHeartbeat(): void {
  const path = join(STATE_DIR, "last-run.txt");
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(path, new Date().toISOString() + "\n", "utf8");
}

export function loadCache(): HttpCacheMeta {
  return readJson<HttpCacheMeta>(cachePath(), {});
}

export function saveCache(cache: HttpCacheMeta): void {
  writeJson(cachePath(), cache);
}

export function storedWeek(state: StoredState, weekStart: string): StoredWeek | null {
  return state.weeks[weekStart] ?? null;
}

/** Aggiorna nello stato la settimana con i dati appena scaricati. */
export function putWeek(state: StoredState, w: WeekSchedule): void {
  if (!w.publication) return; // non pubblicata o 304: non toccare quello che c'è
  state.weeks[w.weekStart] = {
    weekStart: w.weekStart,
    publication: w.publication,
    lessons: w.lessons,
  };
}

/** Rimuove dallo stato le settimane troppo vecchie (prima di `keepFrom`). */
export function pruneWeeks(state: StoredState, keepFrom: string): void {
  for (const k of Object.keys(state.weeks)) {
    if (k < keepFrom) delete state.weeks[k];
  }
}
