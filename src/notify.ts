// Invio notifica push via ntfy.sh. Chiamato SOLO quando ci sono variazioni.

import { config } from "./config.ts";
import { log } from "./log.ts";
import type { NotificationText } from "./summary.ts";

export interface NotifyOutcome {
  sent: boolean;
  reason?: string;
}

/**
 * ntfy accetta il testo come corpo della POST; titolo, tag e priorità
 * vanno negli header (devono essere ASCII: il titolo lo trasliteriamo).
 */
export async function sendNotification(msg: NotificationText): Promise<NotifyOutcome> {
  if (!config.ntfyTopic) {
    return { sent: false, reason: "NTFY_TOPIC non impostato" };
  }
  const url = `${config.ntfyServer.replace(/\/$/, "")}/${config.ntfyTopic}`;
  const headers: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    Title: asciiHeader(msg.title),
    Priority: "default",
    Tags: "books",
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: msg.body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      log.warn(`ntfy HTTP ${res.status} ${t.slice(0, 200)}`);
      return { sent: false, reason: `HTTP ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    log.warn(`ntfy errore: ${err instanceof Error ? err.message : String(err)}`);
    return { sent: false, reason: "eccezione di rete" };
  }
}

/** Gli header HTTP devono essere ASCII: rimuoviamo emoji/accenti dal titolo. */
function asciiHeader(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, "") // via accenti (già scomposti), emoji, simboli
      .replace(/\s+/g, " ")
      .trim() || "Orario aggiornato"
  );
}
