// Configurazione da variabili d'ambiente (.env in locale, Secrets/Variables su GitHub Actions).
// Nessun dato personale nel codice.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Carica un eventuale file .env senza dipendenze esterne.
function loadDotEnv(): void {
  const path = join(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}
loadDotEnv();

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

export const config = {
  /** Slug della classe sul sito, es. "3liceo". */
  classSlug: env("CLASS_SLUG", "3liceo"),
  /** Etichetta leggibile della classe (solo per log/notifiche). */
  className: env("CLASS_NAME", "3 Liceo"),
  /** Host del sito. In futuro potrebbe diventare orario.rainerum.it. */
  siteHost: env("SITE_HOST", "orario.rainerum.delugan.net"),
  /** Quante settimane controllare a partire da quella corrente (1 = solo corrente, 2 = corrente + successiva). */
  checkWeeks: Math.max(1, parseInt(env("CHECK_WEEKS", "2"), 10) || 2),
  /** Fuso orario delle lezioni. */
  timezone: env("TIMEZONE", "Europe/Rome"),
  /** Nome del calendario prodotto (X-WR-CALNAME dell'.ics). */
  calendarName: env("CALENDAR_NAME", "📚 Scuola"),
  /** Topic ntfy per le notifiche. Vuoto = notifiche disattivate (solo log). */
  ntfyTopic: env("NTFY_TOPIC", ""),
  /** Server ntfy. */
  ntfyServer: env("NTFY_SERVER", "https://ntfy.sh"),
  /** User-Agent usato nelle richieste al sito (identificabile, con contatto). */
  userAgent: env(
    "USER_AGENT",
    "orario-3liceo-sync/1.0 (uso personale; https://github.com/Boscolino/orario-3liceo)",
  ),
  get baseUrl(): string {
    return `https://${this.siteHost}`;
  },
};

export type Config = typeof config;
