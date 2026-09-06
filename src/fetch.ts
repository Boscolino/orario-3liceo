// Recupero dati dal sito. Solo la classe configurata, richieste condizionali,
// un piccolo ritardo tra una chiamata e l'altra: nessuna estrazione massiva.

import { config } from "./config.ts";
import { log } from "./log.ts";
import type { HttpCacheMeta, WeekSchedule } from "./types.ts";
import {
  extractPublicationId,
  mergeEntries,
  parseEntriesFromHtml,
  parsePublicationJson,
} from "./parse.ts";

const TIMEOUT_MS = 20_000;
const POLITE_DELAY_MS = 1_200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GetResult {
  status: number;
  body: string;
  etag?: string;
  lastModified?: string;
  notModified: boolean;
}

async function conditionalGet(url: string, cache: HttpCacheMeta): Promise<GetResult> {
  const prev = cache[url];
  const headers: Record<string, string> = {
    "User-Agent": config.userAgent,
    Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
  };
  if (prev?.etag) headers["If-None-Match"] = prev.etag;
  if (prev?.lastModified) headers["If-Modified-Since"] = prev.lastModified;

  const ctrl = AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetch(url, { headers, redirect: "follow", signal: ctrl });
  const etag = res.headers.get("etag") ?? undefined;
  const lastModified = res.headers.get("last-modified") ?? undefined;

  if (res.status === 304) {
    return { status: 304, body: "", etag: prev?.etag, lastModified: prev?.lastModified, notModified: true };
  }
  const body = await res.text();
  if (res.ok) {
    cache[url] = { etag, lastModified, fetchedAt: new Date().toISOString() };
  }
  return { status: res.status, body, etag, lastModified, notModified: false };
}

/**
 * Recupera l'orario di una settimana (lunedì = weekStart).
 * Ritorna publication=null se la settimana non è ancora pubblicata.
 */
export async function fetchWeek(weekStart: string, cache: HttpCacheMeta): Promise<WeekSchedule> {
  const { classSlug } = config;
  const pageUrl =
    `${config.baseUrl}/orario/${weekStart}/classi/${classSlug}` +
    `?giorno=${weekStart}&scuola=media`;

  const page = await conditionalGet(pageUrl, cache);
  if (page.status !== 200 && !page.notModified) {
    throw new Error(`Pagina settimana ${weekStart}: HTTP ${page.status}`);
  }
  // La pagina HTML non ha un ETag affidabile: la rileggiamo sempre.
  const html = page.body;
  const pubId = extractPublicationId(html);

  if (!pubId) {
    log.info(`Settimana ${weekStart}: non ancora pubblicata.`);
    return { weekStart, publication: null, entries: [], lessons: [] };
  }

  await sleep(POLITE_DELAY_MS);

  const jsonUrl = `${config.baseUrl}/api/publications/${pubId}/json?class=${classSlug}`;
  let publication: WeekSchedule["publication"] = null;
  let rawEntries;

  const jr = await conditionalGet(jsonUrl, cache);
  if (jr.notModified) {
    // Nessuna modifica dall'ultimo run: il chiamante riuserà lo stato salvato.
    log.info(`Settimana ${weekStart}: pubblicazione invariata (HTTP 304).`);
    return { weekStart, publication: null, entries: [], lessons: [], notModified: true };
  }
  if (jr.status === 200) {
    const parsed = parsePublicationJson(jr.body);
    publication = parsed.publication;
    rawEntries = parsed.entries;
  } else {
    log.warn(`Endpoint JSON HTTP ${jr.status}: uso il fallback dall'HTML.`);
    rawEntries = parseEntriesFromHtml(html);
    publication = {
      id: pubId,
      version: parseVersionFromHtml(html),
      publishedAt: parsePublishedAtFromHtml(html) ?? new Date().toISOString(),
      weekStart,
    };
  }

  const lessons = mergeEntries(rawEntries);
  return { weekStart, publication, entries: rawEntries, lessons };
}

function parseVersionFromHtml(html: string): number {
  // forma RSC:  "Versione ",3,"  ·  "   |   forma testo:  Versione 3
  const m = html.match(/Versione\s*\\?"?\s*,?\s*(\d+)/i) ?? html.match(/Versione\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : 0;
}

function parsePublishedAtFromHtml(html: string): string | null {
  // "orario-2026-09-07-v3.json" o testo "4 set 2026, 19:41" — non affidabile,
  // meglio null e lasciare che sia l'endpoint JSON a dare il dato preciso.
  const m = html.match(/"publishedAt":"([^"]+)"/);
  return m ? m[1] : null;
}
