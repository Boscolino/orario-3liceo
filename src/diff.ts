// Confronto tra l'orario precedente e quello attuale di una settimana.

import type { Lesson } from "./types.ts";
import { humanDate } from "./dates.ts";
import { activityLabel } from "./render.ts";

export interface FieldChange {
  field: "docente" | "aula" | "orario" | "giorno" | "tipo" | "nota";
  before: string;
  after: string;
}

export interface ModifiedLesson {
  before: Lesson;
  after: Lesson;
  changes: FieldChange[];
}

export interface WeekDiff {
  weekStart: string;
  added: Lesson[];
  removed: Lesson[];
  modified: ModifiedLesson[];
}

export function hasChanges(d: WeekDiff): boolean {
  return d.added.length > 0 || d.removed.length > 0 || d.modified.length > 0;
}

function slot(l: Lesson): string {
  return `${l.date}#${l.startMinute}-${l.endMinute}`;
}

function teachersStr(l: Lesson): string {
  return l.teachers.join(", ") || "—";
}

function fieldChanges(a: Lesson, b: Lesson): FieldChange[] {
  const c: FieldChange[] = [];
  if (a.date !== b.date) {
    c.push({ field: "giorno", before: humanDate(a.date), after: humanDate(b.date) });
  }
  if (a.start !== b.start || a.end !== b.end) {
    c.push({ field: "orario", before: `${a.start}–${a.end}`, after: `${b.start}–${b.end}` });
  }
  if (teachersStr(a) !== teachersStr(b)) {
    c.push({ field: "docente", before: teachersStr(a), after: teachersStr(b) });
  }
  if ((a.room ?? "—") !== (b.room ?? "—")) {
    c.push({ field: "aula", before: a.room ?? "—", after: b.room ?? "—" });
  }
  if (a.activityType !== b.activityType) {
    c.push({
      field: "tipo",
      before: activityLabel(a.activityType),
      after: activityLabel(b.activityType),
    });
  }
  if ((a.notes ?? "") !== (b.notes ?? "")) {
    c.push({ field: "nota", before: a.notes ?? "—", after: b.notes ?? "—" });
  }
  return c;
}

/**
 * Abbina le lezioni vecchie e nuove:
 *  1. per UID (occurrenceId stabile);
 *  2. gli avanzi, per slot identico giorno+orario (UID riassegnato a monte);
 * il resto è aggiunto / rimosso.
 */
export function diffWeek(weekStart: string, before: Lesson[], after: Lesson[]): WeekDiff {
  const oldByUid = new Map(before.map((l) => [l.uid, l]));
  const newByUid = new Map(after.map((l) => [l.uid, l]));

  const usedOld = new Set<string>();
  const usedNew = new Set<string>();
  const modified: ModifiedLesson[] = [];

  // 1) match per UID
  for (const [uid, a] of oldByUid) {
    const b = newByUid.get(uid);
    if (!b) continue;
    usedOld.add(uid);
    usedNew.add(uid);
    const changes = fieldChanges(a, b);
    if (changes.length) modified.push({ before: a, after: b, changes });
  }

  // 2) match per slot (giorno+orario) tra gli avanzi
  const leftoverOld = before.filter((l) => !usedOld.has(l.uid));
  const leftoverNew = after.filter((l) => !usedNew.has(l.uid));
  const newBySlot = new Map<string, Lesson>();
  for (const l of leftoverNew) newBySlot.set(slot(l), l);

  for (const a of leftoverOld) {
    const b = newBySlot.get(slot(a));
    if (!b || usedNew.has(b.uid)) continue;
    usedOld.add(a.uid);
    usedNew.add(b.uid);
    const changes = fieldChanges(a, b);
    if (changes.length) modified.push({ before: a, after: b, changes });
  }

  const removed = before
    .filter((l) => !usedOld.has(l.uid))
    .sort((x, y) => x.date.localeCompare(y.date) || x.startMinute - y.startMinute);
  const added = after
    .filter((l) => !usedNew.has(l.uid))
    .sort((x, y) => x.date.localeCompare(y.date) || x.startMinute - y.startMinute);

  modified.sort(
    (x, y) =>
      x.after.date.localeCompare(y.after.date) || x.after.startMinute - y.after.startMinute,
  );

  return { weekStart, added, removed, modified };
}
