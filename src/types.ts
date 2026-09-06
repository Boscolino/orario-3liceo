// Modello dati normalizzato dell'orario.

/** Una lezione "atomica" come pubblicata dal sito (blocco da ~50 minuti). */
export interface RawEntry {
  date: string; // YYYY-MM-DD
  startMinute: number; // minuti dalla mezzanotte, ora locale Europe/Rome
  endMinute: number;
  title: string; // di norma sempre "Lezione" (il sito non pubblica la materia)
  activityType: string; // lesson | schedule_change | extra_hours | educational_trip | activity | laboratory | seminar | mixed
  teachers: string[]; // nomi completi, es. "Gualtiero Giovanazzi"
  teacherKeys: string[]; // cognomi normalizzati, es. "giovanazzi" (per la mappa materie)
  room: string | null; // etichetta aula, es. "3LSA" oppure "Palestra"
  notes: string | null; // publicNotes
  occurrenceId: string; // id stabile del blocco lato sorgente
  baselineStatus: string; // "base" | "modified"
  isVariation: boolean;
  hasSubstitution: boolean;
}

/** Una lezione "visibile": blocchi adiacenti con stesso docente/aula/tipo uniti. */
export interface Lesson {
  uid: string; // id stabile (dal primo occurrenceId del gruppo)
  date: string; // YYYY-MM-DD
  startMinute: number;
  endMinute: number;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  title: string;
  activityType: string;
  teachers: string[];
  teacherKeys: string[]; // cognomi normalizzati
  room: string | null;
  notes: string | null;
  occurrenceIds: string[]; // tutti i blocchi che compongono la lezione
  baselineStatus: string; // "modified" se almeno un blocco è modified
  isVariation: boolean; // true se almeno un blocco è variazione
  hasSubstitution: boolean;
}

export interface Publication {
  id: string;
  version: number;
  publishedAt: string; // ISO
  weekStart: string; // YYYY-MM-DD (lunedì)
}

/** Orario di una settimana. */
export interface WeekSchedule {
  weekStart: string; // lunedì YYYY-MM-DD
  publication: Publication | null; // null = settimana non ancora pubblicata
  entries: RawEntry[];
  lessons: Lesson[];
  /** true se l'endpoint JSON ha risposto 304: dati invariati dall'ultimo run. */
  notModified?: boolean;
}

/** Stato persistente salvato nel repo tra un run e l'altro. */
export interface StoredState {
  classSlug: string;
  updatedAt: string; // ISO dell'ultimo run che ha scritto
  weeks: Record<string, StoredWeek>; // chiave = weekStart
}

export interface StoredWeek {
  weekStart: string;
  publication: Publication | null;
  lessons: Lesson[];
}

/** Metadati per le richieste condizionali (ETag / Last-Modified). */
export interface HttpCacheMeta {
  [url: string]: { etag?: string; lastModified?: string; fetchedAt: string };
}
