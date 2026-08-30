/**
 * Repositories.
 *
 * The only module allowed to touch IndexedDB directly. Everything above it —
 * hooks, screens, the drill runtime — goes through these functions, which is
 * what makes the storage engine replaceable and the domain layer testable
 * without a browser.
 *
 * Reads are whole-collection-for-one-exam. That is a deliberate simplification:
 * a learner's exam is a few thousand items at the very most, the whole set fits
 * comfortably in memory, and holding it there is what makes search, the
 * weakness report and the queue builder synchronous and instant.
 */

import type {
  BackupPayload, CellRef, CellStat, Confidence, ConfusionRelation, DrillMode, Exam,
  FailureReason, ID, Matrix, ReviewEvent, StudyItem, Subject, Topic,
} from '../domain/models.ts';
import { getDB, readSettings, SCHEMA_VERSION, type DB } from './db.ts';
import { newId, cellStatId } from '../domain/ids.ts';
import { schedule, type ScheduleResult } from '../domain/review/scheduler.ts';
import { applyCellOutcome } from '../domain/matrix.ts';

/** Everything the UI needs for one exam, read in a single pass. */
export interface ExamSnapshot {
  exam: Exam | undefined;
  subjects: Subject[];
  topics: Topic[];
  items: StudyItem[];
  relations: ConfusionRelation[];
  matrices: Matrix[];
  reviews: ReviewEvent[];
  cellStats: CellStat[];
  lastReviews: Map<ID, ReviewEvent>;
}

export const emptySnapshot = (): ExamSnapshot => ({
  exam: undefined,
  subjects: [], topics: [], items: [], relations: [], matrices: [],
  reviews: [], cellStats: [], lastReviews: new Map(),
});

export async function listExams(db?: DB): Promise<Exam[]> {
  const d = db ?? (await getDB());
  const all = await d.getAll('exams');
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function loadExamSnapshot(examId: ID | undefined, db?: DB): Promise<ExamSnapshot> {
  if (!examId) return emptySnapshot();
  const d = db ?? (await getDB());

  const [exam, subjects, topics, items, relations, matrices, reviews, cellStats] =
    await Promise.all([
      d.get('exams', examId),
      d.getAllFromIndex('subjects', 'byExam', examId),
      d.getAllFromIndex('topics', 'byExam', examId),
      d.getAllFromIndex('items', 'byExam', examId),
      d.getAllFromIndex('relations', 'byExam', examId),
      d.getAllFromIndex('matrices', 'byExam', examId),
      d.getAllFromIndex('reviews', 'byExam', examId),
      d.getAllFromIndex('cellStats', 'byExam', examId),
    ]);

  reviews.sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  const lastReviews = new Map<ID, ReviewEvent>();
  for (const r of reviews) lastReviews.set(r.itemId, r); // ascending: last wins

  return {
    exam,
    subjects: subjects.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    topics: topics.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    items,
    relations,
    matrices: matrices.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    reviews,
    cellStats,
    lastReviews,
  };
}

/* -------------------------------------------------------------- writes --- */

const now = () => new Date().toISOString();

export async function putExam(exam: Exam, db?: DB): Promise<Exam> {
  const d = db ?? (await getDB());
  const next = { ...exam, updatedAt: now() };
  await d.put('exams', next);
  return next;
}

export async function createExam(
  input: { title: string; examDate?: string; description?: string; isSample?: boolean },
  db?: DB,
): Promise<Exam> {
  const d = db ?? (await getDB());
  const stamp = now();
  const exam: Exam = {
    id: newId('exam_'),
    title: input.title,
    ...(input.examDate ? { examDate: input.examDate } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.isSample ? { isSample: true } : {}),
    createdAt: stamp,
    updatedAt: stamp,
  };
  await d.put('exams', exam);
  return exam;
}

/**
 * Deleting an exam deletes everything under it. Called only from a confirmed
 * destructive action in Settings, and the confirm dialog offers a backup first.
 */
export async function deleteExam(examId: ID, db?: DB): Promise<void> {
  const d = db ?? (await getDB());
  const tx = d.transaction(
    ['exams', 'subjects', 'topics', 'items', 'relations', 'matrices', 'reviews', 'cellStats'],
    'readwrite',
  );
  await tx.objectStore('exams').delete(examId);
  for (const name of ['subjects', 'topics', 'items', 'relations', 'matrices', 'reviews', 'cellStats'] as const) {
    const store = tx.objectStore(name);
    const keys = await store.index('byExam').getAllKeys(examId);
    await Promise.all(keys.map((k) => store.delete(k as never)));
  }
  await tx.done;
}

export async function putSubject(subject: Subject, db?: DB): Promise<Subject> {
  const d = db ?? (await getDB());
  await d.put('subjects', subject);
  return subject;
}

export async function putTopic(topic: Topic, db?: DB): Promise<Topic> {
  const d = db ?? (await getDB());
  await d.put('topics', topic);
  return topic;
}

export async function findOrCreateTopic(
  examId: ID, title: string, subjectId?: ID, db?: DB,
): Promise<Topic> {
  const d = db ?? (await getDB());
  const trimmed = title.trim();
  const existing = (await d.getAllFromIndex('topics', 'byExam', examId))
    .find((t) => t.title === trimmed && (subjectId ? t.subjectId === subjectId : true));
  if (existing) return existing;
  const topic: Topic = {
    id: newId('topic_'),
    examId,
    ...(subjectId ? { subjectId } : {}),
    title: trimmed,
    order: Date.now(),
  };
  await d.put('topics', topic);
  return topic;
}

export async function putItem(item: StudyItem, db?: DB): Promise<StudyItem> {
  const d = db ?? (await getDB());
  const next = { ...item, updatedAt: now() };
  await d.put('items', next);
  return next;
}

export async function deleteItem(itemId: ID, db?: DB): Promise<void> {
  const d = db ?? (await getDB());
  const tx = d.transaction(['items', 'relations', 'reviews'], 'readwrite');
  await tx.objectStore('items').delete(itemId);
  const rel = tx.objectStore('relations');
  const [asA, asB] = await Promise.all([
    rel.index('byA').getAllKeys(itemId),
    rel.index('byB').getAllKeys(itemId),
  ]);
  await Promise.all([...asA, ...asB].map((k) => rel.delete(k)));
  // Review history is kept: it is evidence about the learner, not about the item.
  await tx.done;
}

export async function putMatrix(matrix: Matrix, db?: DB): Promise<Matrix> {
  const d = db ?? (await getDB());
  const next = { ...matrix, updatedAt: now() };
  await d.put('matrices', next);
  return next;
}

export async function deleteMatrix(matrixId: ID, db?: DB): Promise<void> {
  const d = db ?? (await getDB());
  const tx = d.transaction(['matrices', 'cellStats'], 'readwrite');
  await tx.objectStore('matrices').delete(matrixId);
  const stats = tx.objectStore('cellStats');
  const keys = await stats.index('byMatrix').getAllKeys(matrixId);
  await Promise.all(keys.map((k) => stats.delete(k)));
  await tx.done;
}

/**
 * Confusion relations are stored once and mirrored onto both items'
 * `confusedWithIds`, which is a read cache — the relation table stays the
 * authority, and `rebuildConfusionCache` can regenerate it.
 */
export async function addRelation(rel: ConfusionRelation, db?: DB): Promise<ConfusionRelation> {
  const d = db ?? (await getDB());
  const existing = (await d.getAllFromIndex('relations', 'byExam', rel.examId))
    .find((r) => r.aId === rel.aId && r.bId === rel.bId);
  if (existing) return existing;

  const tx = d.transaction(['relations', 'items'], 'readwrite');
  await tx.objectStore('relations').put(rel);
  const items = tx.objectStore('items');
  for (const [self, other] of [[rel.aId, rel.bId], [rel.bId, rel.aId]] as const) {
    const item = await items.get(self);
    if (!item || item.confusedWithIds.includes(other)) continue;
    await items.put({ ...item, confusedWithIds: [...item.confusedWithIds, other], updatedAt: now() });
  }
  await tx.done;
  return rel;
}

export async function removeRelation(relationId: ID, db?: DB): Promise<void> {
  const d = db ?? (await getDB());
  const rel = await d.get('relations', relationId);
  if (!rel) return;
  const tx = d.transaction(['relations', 'items'], 'readwrite');
  await tx.objectStore('relations').delete(relationId);
  const items = tx.objectStore('items');
  for (const [self, other] of [[rel.aId, rel.bId], [rel.bId, rel.aId]] as const) {
    const item = await items.get(self);
    if (!item) continue;
    await items.put({
      ...item,
      confusedWithIds: item.confusedWithIds.filter((x) => x !== other),
      updatedAt: now(),
    });
  }
  await tx.done;
}

/* ------------------------------------------------------------- grading --- */

export interface RecordAnswerInput {
  item: StudyItem;
  correct: boolean;
  confidence: Confidence;
  submittedAnswer?: string;
  responseTimeMs?: number;
  failureReason?: FailureReason;
  mode: DrillMode;
  cellRef?: CellRef;
  at?: Date;
}

export interface RecordAnswerResult {
  item: StudyItem;
  event: ReviewEvent;
  scheduled: ScheduleResult;
}

/**
 * The single write path for a retrieval attempt. Grading, scheduling, the
 * review event and the per-cell statistic all happen in one transaction, so
 * the app can never end up with an answered item whose next date did not move.
 */
export async function recordAnswer(
  input: RecordAnswerInput,
  db?: DB,
): Promise<RecordAnswerResult> {
  const d = db ?? (await getDB());
  const settings = await readSettings(d);
  const at = input.at ?? new Date();

  const scheduled = schedule(
    {
      step: input.item.step,
      streak: input.item.streak,
      lapses: input.item.lapses,
      reviewCount: input.item.reviewCount,
      status: input.item.status,
    },
    {
      correct: input.correct,
      confidence: input.confidence,
      ...(input.responseTimeMs !== undefined ? { responseTimeMs: input.responseTimeMs } : {}),
      slowAnswerMs: settings.slowAnswerMs,
    },
    at,
  );

  const reviewedAt = at.toISOString();
  const event: ReviewEvent = {
    id: newId('rev_'),
    itemId: input.item.id,
    examId: input.item.examId,
    reviewedAt,
    ...(input.submittedAnswer !== undefined ? { submittedAnswer: input.submittedAnswer } : {}),
    correct: input.correct,
    confidence: input.confidence,
    ...(input.responseTimeMs !== undefined ? { responseTimeMs: input.responseTimeMs } : {}),
    resultClass: scheduled.resultClass,
    slow: scheduled.slow,
    ...(input.failureReason ? { failureReason: input.failureReason } : {}),
    stepAfter: scheduled.step,
    intervalDays: scheduled.intervalDays,
    nextReviewAt: scheduled.nextReviewAt,
    mode: input.mode,
    ...(input.cellRef ? { cellRef: input.cellRef } : {}),
  };

  const nextItem: StudyItem = {
    ...input.item,
    step: scheduled.step,
    streak: scheduled.streak,
    lapses: scheduled.lapses,
    reviewCount: scheduled.reviewCount,
    status: scheduled.status,
    lastReviewedAt: reviewedAt,
    nextReviewAt: scheduled.nextReviewAt,
    updatedAt: reviewedAt,
  };

  const tx = d.transaction(['items', 'reviews', 'cellStats'], 'readwrite');
  await tx.objectStore('items').put(nextItem);
  await tx.objectStore('reviews').put(event);
  if (input.cellRef) {
    const stats = tx.objectStore('cellStats');
    const id = cellStatId(input.cellRef.matrixId, input.cellRef.rowId, input.cellRef.columnId);
    const prev = await stats.get(id);
    await stats.put(
      applyCellOutcome(prev, { ...input.cellRef, examId: input.item.examId }, input.correct, reviewedAt),
    );
  }
  await tx.done;

  return { item: nextItem, event, scheduled };
}

/**
 * A matrix cell answered on its own, with no StudyItem behind it. The cell
 * statistic is still recorded, so a repeatedly-missed cell surfaces in the
 * table and biases future blanking even before the learner promotes it to an
 * item of its own.
 */
export async function recordCellOutcome(
  ref: CellRef & { examId: ID }, correct: boolean, at = new Date(), db?: DB,
): Promise<CellStat> {
  const d = db ?? (await getDB());
  const id = cellStatId(ref.matrixId, ref.rowId, ref.columnId);
  const prev = await d.get('cellStats', id);
  const next = applyCellOutcome(prev, ref, correct, at.toISOString());
  await d.put('cellStats', next);
  return next;
}

/* -------------------------------------------------------------- backup --- */

export async function exportBackup(db?: DB): Promise<BackupPayload> {
  const d = db ?? (await getDB());
  const [exams, subjects, topics, items, relations, matrices, reviews, cellStats, settings] =
    await Promise.all([
      d.getAll('exams'), d.getAll('subjects'), d.getAll('topics'), d.getAll('items'),
      d.getAll('relations'), d.getAll('matrices'), d.getAll('reviews'), d.getAll('cellStats'),
      readSettings(d),
    ]);
  const { id: _id, ...settingsRest } = settings;
  return {
    format: 'exam-matrix-backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now(),
    exams, subjects, topics, items, relations, matrices, reviews, cellStats,
    settings: settingsRest,
  };
}

export type ImportStrategy = 'merge' | 'replace';

export interface ImportResult {
  added: Record<string, number>;
  skipped: Record<string, number>;
}

/**
 * Writes a payload in. `merge` keeps existing records and skips id collisions;
 * `replace` clears the database first. Both are explicit choices made on the
 * preview screen — nothing here runs without the learner having seen the
 * counts first (§30).
 */
export async function importPayload(
  payload: BackupPayload,
  strategy: ImportStrategy = 'merge',
  db?: DB,
): Promise<ImportResult> {
  const d = db ?? (await getDB());
  const added: Record<string, number> = {};
  const skipped: Record<string, number> = {};

  const stores = ['exams', 'subjects', 'topics', 'items', 'relations', 'matrices', 'reviews', 'cellStats'] as const;
  const tx = d.transaction([...stores], 'readwrite');

  if (strategy === 'replace') {
    for (const name of stores) await tx.objectStore(name).clear();
  }

  const rowsFor = (name: (typeof stores)[number]): Array<{ id: string }> => {
    switch (name) {
      case 'exams': return payload.exams ?? [];
      case 'subjects': return payload.subjects ?? [];
      case 'topics': return payload.topics ?? [];
      case 'items': return payload.items ?? [];
      case 'relations': return payload.relations ?? [];
      case 'matrices': return payload.matrices ?? [];
      case 'reviews': return payload.reviews ?? [];
      case 'cellStats': return payload.cellStats ?? [];
    }
  };

  for (const name of stores) {
    const store = tx.objectStore(name);
    let a = 0, s = 0;
    for (const row of rowsFor(name)) {
      if (strategy === 'merge' && (await store.get(row.id as never))) { s++; continue; }
      await store.put(row as never);
      a++;
    }
    added[name] = a;
    skipped[name] = s;
  }
  await tx.done;
  return { added, skipped };
}

export async function clearAll(db?: DB): Promise<void> {
  const d = db ?? (await getDB());
  const stores = ['exams', 'subjects', 'topics', 'items', 'relations', 'matrices', 'reviews', 'cellStats'] as const;
  const tx = d.transaction([...stores], 'readwrite');
  for (const name of stores) await tx.objectStore(name).clear();
  await tx.done;
}

/**
 * Attach a failure reason to a review that has already been recorded.
 *
 * The reason is chosen *after* the answer is graded, and it must not create a
 * second review event — that would schedule the item twice and inflate every
 * count derived from the history.
 */
export async function setFailureReason(
  eventId: ID, reason: FailureReason | undefined, db?: DB,
): Promise<void> {
  const d = db ?? (await getDB());
  const ev = await d.get('reviews', eventId);
  if (!ev) return;
  const next = { ...ev };
  if (reason) next.failureReason = reason;
  else delete next.failureReason;
  await d.put('reviews', next);
}
