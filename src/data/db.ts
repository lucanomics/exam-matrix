/**
 * Local-first storage.
 *
 * IndexedDB, opened through `idb` for its promise wrapper and transaction
 * safety. There is no server: everything a learner types stays in their
 * browser until they export it, which is what makes the app usable on a train
 * with no signal and without an account.
 *
 * Two version numbers, and they are not the same thing:
 *
 *   DB_VERSION      the IndexedDB object-store layout. Bumping it runs
 *                   `upgrade()` below.
 *   SCHEMA_VERSION  the shape of the *records*, and of a backup file. Bumping
 *                   it means writing a migration in data/migrations/.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  CellStat, ConfusionRelation, Exam, ID, Matrix, Meta, ReviewEvent,
  Settings, StudyItem, Subject, Topic,
} from '../domain/models.ts';

export const DB_NAME = 'exam-matrix';
export const DB_VERSION = 1;

/** Record shape version. v1 was the YAML/editor era; v2 is the learning model. */
export const SCHEMA_VERSION = 2;

export interface ExamMatrixDB extends DBSchema {
  meta: { key: string; value: Meta };
  settings: { key: string; value: Settings };
  exams: { key: ID; value: Exam };
  subjects: { key: ID; value: Subject; indexes: { byExam: ID } };
  topics: { key: ID; value: Topic; indexes: { byExam: ID; bySubject: ID } };
  items: {
    key: ID;
    value: StudyItem;
    indexes: { byExam: ID; byTopic: ID; bySubject: ID; byNextReview: string; byStatus: string };
  };
  relations: { key: ID; value: ConfusionRelation; indexes: { byExam: ID; byA: ID; byB: ID } };
  matrices: { key: ID; value: Matrix; indexes: { byExam: ID; byTopic: ID } };
  reviews: {
    key: ID;
    value: ReviewEvent;
    indexes: { byExam: ID; byItem: ID; byReviewedAt: string };
  };
  cellStats: { key: string; value: CellStat; indexes: { byExam: ID; byMatrix: ID } };
}

export type DB = IDBPDatabase<ExamMatrixDB>;

let dbPromise: Promise<DB> | null = null;

export function getDB(): Promise<DB> {
  if (!dbPromise) {
    dbPromise = openDB<ExamMatrixDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('meta', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'id' });
        db.createObjectStore('exams', { keyPath: 'id' });

        const subjects = db.createObjectStore('subjects', { keyPath: 'id' });
        subjects.createIndex('byExam', 'examId');

        const topics = db.createObjectStore('topics', { keyPath: 'id' });
        topics.createIndex('byExam', 'examId');
        topics.createIndex('bySubject', 'subjectId');

        const items = db.createObjectStore('items', { keyPath: 'id' });
        items.createIndex('byExam', 'examId');
        items.createIndex('byTopic', 'topicId');
        items.createIndex('bySubject', 'subjectId');
        items.createIndex('byNextReview', 'nextReviewAt');
        items.createIndex('byStatus', 'status');

        const relations = db.createObjectStore('relations', { keyPath: 'id' });
        relations.createIndex('byExam', 'examId');
        relations.createIndex('byA', 'aId');
        relations.createIndex('byB', 'bId');

        const matrices = db.createObjectStore('matrices', { keyPath: 'id' });
        matrices.createIndex('byExam', 'examId');
        matrices.createIndex('byTopic', 'topicId');

        const reviews = db.createObjectStore('reviews', { keyPath: 'id' });
        reviews.createIndex('byExam', 'examId');
        reviews.createIndex('byItem', 'itemId');
        reviews.createIndex('byReviewedAt', 'reviewedAt');

        const cellStats = db.createObjectStore('cellStats', { keyPath: 'id' });
        cellStats.createIndex('byExam', 'examId');
        cellStats.createIndex('byMatrix', 'matrixId');
      },
    });
  }
  return dbPromise;
}

/** Test seam: drop the memoised connection so a fresh database can be opened. */
export function resetDBConnection(): void {
  dbPromise = null;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  sessionSize: 20,
  slowAnswerMs: 25_000,
  resurfaceMastered: false,
  onboarded: false,
  theme: 'system',
};

export async function readSettings(db?: DB): Promise<Settings> {
  const d = db ?? (await getDB());
  const stored = await d.get('settings', 'settings');
  return { ...DEFAULT_SETTINGS, ...stored, id: 'settings' };
}

export async function writeSettings(patch: Partial<Settings>, db?: DB): Promise<Settings> {
  const d = db ?? (await getDB());
  const next = { ...(await readSettings(d)), ...patch, id: 'settings' as const };
  await d.put('settings', next);
  return next;
}

export async function readMeta(db?: DB): Promise<Meta> {
  const d = db ?? (await getDB());
  const stored = await d.get('meta', 'meta');
  if (stored) return stored;
  const fresh: Meta = {
    id: 'meta',
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
  };
  await d.put('meta', fresh);
  return fresh;
}

export async function writeMeta(patch: Partial<Meta>, db?: DB): Promise<Meta> {
  const d = db ?? (await getDB());
  const next = { ...(await readMeta(d)), ...patch, id: 'meta' as const };
  await d.put('meta', next);
  return next;
}
