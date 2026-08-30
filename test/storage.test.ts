/**
 * Storage: the round trip a learner's data has to survive, and the write path
 * that grading takes. Runs against fake-indexeddb, which is the same IDB
 * semantics without a browser.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { getDB, resetDBConnection, readSettings, writeSettings, DB_NAME } from '../src/data/db.ts';
import {
  addRelation, clearAll, createExam, deleteExam, deleteItem, exportBackup,
  importPayload, listExams, loadExamSnapshot, putItem, putMatrix, putSubject,
  recordAnswer, recordCellOutcome, removeRelation, setFailureReason,
} from '../src/data/repo.ts';
import { createItem } from '../src/domain/item.ts';
import { makeRelation } from '../src/domain/confusion.ts';
import { newColumn, newRow, isUnstable } from '../src/domain/matrix.ts';
import { cellStatId, newId } from '../src/domain/ids.ts';
import { buildSampleExam } from '../src/data/seed.ts';
import type { Matrix } from '../src/domain/models.ts';

beforeEach(async () => {
  // A clean database per test, so ordering can never make one pass by accident.
  globalThis.indexedDB = new IDBFactory();
  resetDBConnection();
  await getDB();
});

describe('exam lifecycle', () => {
  it('creates, lists and loads an exam with everything under it', async () => {
    const exam = await createExam({ title: '시험 A', examDate: '2026-06-01' });
    await putSubject({ id: newId('subj_'), examId: exam.id, title: '과목', order: 0 });
    const item = await putItem(createItem({ examId: exam.id, prompt: 'p', answer: 'a' }));

    expect((await listExams()).map((e) => e.id)).toEqual([exam.id]);
    const snap = await loadExamSnapshot(exam.id);
    expect(snap.exam!.title).toBe('시험 A');
    expect(snap.subjects).toHaveLength(1);
    expect(snap.items.map((i) => i.id)).toEqual([item.id]);
  });

  it('deleting an exam removes everything under it and nothing else', async () => {
    const keep = await createExam({ title: 'keep' });
    const drop = await createExam({ title: 'drop' });
    await putItem(createItem({ examId: keep.id, prompt: 'k', answer: 'k' }));
    const gone = await putItem(createItem({ examId: drop.id, prompt: 'd', answer: 'd' }));
    await recordAnswer({ item: gone, correct: true, confidence: 3, mode: 'today' });

    await deleteExam(drop.id);

    expect((await loadExamSnapshot(drop.id)).items).toHaveLength(0);
    expect((await loadExamSnapshot(drop.id)).reviews).toHaveLength(0);
    expect((await loadExamSnapshot(keep.id)).items).toHaveLength(1);
  });

  it('an empty exam id yields an empty snapshot rather than throwing', async () => {
    expect((await loadExamSnapshot(undefined)).items).toEqual([]);
  });
});

describe('recordAnswer — one transaction for grading, scheduling and history', () => {
  it('moves the item and writes exactly one review event', async () => {
    const exam = await createExam({ title: 'e' });
    const item = await putItem(createItem({ examId: exam.id, prompt: 'p', answer: 'a' }));

    const r = await recordAnswer({
      item, correct: true, confidence: 4, submittedAnswer: 'a', responseTimeMs: 3000, mode: 'today',
    });

    expect(r.item.reviewCount).toBe(1);
    expect(r.item.nextReviewAt).toBe(r.scheduled.nextReviewAt);
    expect(r.item.status).toBe('active');

    const snap = await loadExamSnapshot(exam.id);
    expect(snap.reviews).toHaveLength(1);
    expect(snap.lastReviews.get(item.id)!.id).toBe(r.event.id);
    expect(snap.items[0]!.step).toBe(r.scheduled.step);
  });

  it('honours the learner’s slow-answer threshold from settings', async () => {
    const exam = await createExam({ title: 'e' });
    const item = await putItem(createItem({ examId: exam.id, prompt: 'p', answer: 'a' }));
    await writeSettings({ slowAnswerMs: 5_000 });

    const r = await recordAnswer({
      item, correct: true, confidence: 4, responseTimeMs: 9_000, mode: 'today',
    });
    expect(r.scheduled.slow).toBe(true);
    expect(r.event.slow).toBe(true);
    expect(r.scheduled.intervalDays).toBeLessThanOrEqual(7);
  });

  it('lastReviews holds the most recent event, not the first', async () => {
    const exam = await createExam({ title: 'e' });
    let item = await putItem(createItem({ examId: exam.id, prompt: 'p', answer: 'a' }));
    item = (await recordAnswer({
      item, correct: false, confidence: 2, mode: 'today', at: new Date('2026-01-01T00:00:00Z'),
    })).item;
    const second = await recordAnswer({
      item, correct: true, confidence: 4, mode: 'today', at: new Date('2026-01-02T00:00:00Z'),
    });

    const snap = await loadExamSnapshot(exam.id);
    expect(snap.reviews).toHaveLength(2);
    expect(snap.lastReviews.get(item.id)!.id).toBe(second.event.id);
  });

  it('a failure reason patches the existing event rather than adding another', async () => {
    const exam = await createExam({ title: 'e' });
    const item = await putItem(createItem({ examId: exam.id, prompt: 'p', answer: 'a' }));
    const r = await recordAnswer({ item, correct: false, confidence: 2, mode: 'today' });

    await setFailureReason(r.event.id, 'confused_with_similar');
    const snap = await loadExamSnapshot(exam.id);
    expect(snap.reviews).toHaveLength(1);
    expect(snap.reviews[0]!.failureReason).toBe('confused_with_similar');

    await setFailureReason(r.event.id, undefined);
    expect((await loadExamSnapshot(exam.id)).reviews[0]!.failureReason).toBeUndefined();
  });

  it('records a per-cell statistic when the retrieval was a matrix cell', async () => {
    const exam = await createExam({ title: 'e' });
    const col = newColumn('기준');
    const row = newRow('항목');
    const matrix: Matrix = {
      id: newId('mx_'), examId: exam.id, title: 'm', rowLabel: '항목', archetype: 'concept',
      columns: [col], rows: [row], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await putMatrix(matrix);
    const ref = { matrixId: matrix.id, rowId: row.id, columnId: col.id };
    const item = await putItem(createItem({ examId: exam.id, prompt: 'p', answer: 'a', cellRef: ref }));

    await recordAnswer({ item, correct: false, confidence: 2, mode: 'matrix', cellRef: ref });
    await recordCellOutcome({ ...ref, examId: exam.id }, false);

    const snap = await loadExamSnapshot(exam.id);
    const stat = snap.cellStats.find((s) => s.id === cellStatId(matrix.id, row.id, col.id))!;
    expect(stat.attempts).toBe(2);
    expect(stat.misses).toBe(2);
    expect(isUnstable(stat)).toBe(true);
  });
});

describe('confusion relations', () => {
  it('mirrors onto both items and is idempotent', async () => {
    const exam = await createExam({ title: 'e' });
    const a = await putItem(createItem({ examId: exam.id, prompt: 'a', answer: 'a' }));
    const b = await putItem(createItem({ examId: exam.id, prompt: 'b', answer: 'b' }));

    const rel = await addRelation(makeRelation(exam.id, a.id, b.id));
    const again = await addRelation(makeRelation(exam.id, b.id, a.id));
    expect(again.id).toBe(rel.id);

    let snap = await loadExamSnapshot(exam.id);
    expect(snap.relations).toHaveLength(1);
    expect(snap.items.find((i) => i.id === a.id)!.confusedWithIds).toEqual([b.id]);
    expect(snap.items.find((i) => i.id === b.id)!.confusedWithIds).toEqual([a.id]);

    await removeRelation(rel.id);
    snap = await loadExamSnapshot(exam.id);
    expect(snap.relations).toHaveLength(0);
    expect(snap.items.every((i) => i.confusedWithIds.length === 0)).toBe(true);
  });

  it('deleting an item removes its relations but keeps its review history', async () => {
    const exam = await createExam({ title: 'e' });
    const a = await putItem(createItem({ examId: exam.id, prompt: 'a', answer: 'a' }));
    const b = await putItem(createItem({ examId: exam.id, prompt: 'b', answer: 'b' }));
    await addRelation(makeRelation(exam.id, a.id, b.id));
    await recordAnswer({ item: a, correct: true, confidence: 3, mode: 'today' });

    await deleteItem(a.id);
    const snap = await loadExamSnapshot(exam.id);
    expect(snap.items.map((i) => i.id)).toEqual([b.id]);
    expect(snap.relations).toHaveLength(0);
    expect(snap.reviews).toHaveLength(1);
  });
});

describe('backup round trip', () => {
  it('exports and re-imports every record byte for byte', async () => {
    const s = buildSampleExam(new Date('2026-03-01T00:00:00Z'));
    await importPayload({
      format: 'exam-matrix-backup', schemaVersion: 2, exportedAt: new Date().toISOString(),
      exams: [s.exam], subjects: s.subjects, topics: s.topics, items: s.items,
      relations: s.relations, matrices: s.matrices, reviews: s.reviews, cellStats: [],
    });

    const first = await exportBackup();
    await clearAll();
    expect(await listExams()).toHaveLength(0);

    await importPayload(first);
    const second = await exportBackup();

    const strip = (b: Awaited<ReturnType<typeof exportBackup>>) =>
      JSON.stringify({ ...b, exportedAt: null });
    expect(strip(second)).toBe(strip(first));
  });

  it('preserves sources, markers, rationale and confusion links exactly', async () => {
    const exam = await createExam({ title: 'src' });
    const original = await putItem(createItem({
      examId: exam.id,
      prompt: '문헌연구법은 면접법보다 시간과 장소의 제약이 큰가?',
      answer: 'X',
      rationale: '기존 자료를 활용하기 때문이다.',
      examinerWording: '문헌연구법은 시간과 공간의 제약을 크게 받는다.',
      correctedStatement: '제약이 작다.',
      markers: ['trap', 'distinction'],
      tags: ['자료수집'],
      source: { type: 'past_paper', title: '기출', year: '2024', questionNumber: '17', page: '78' },
    }));

    const payload = await exportBackup();
    await clearAll();
    await importPayload(payload);

    const back = (await loadExamSnapshot(exam.id)).items[0]!;
    expect(back).toEqual(original);
  });

  it('merge skips ids that already exist; replace wipes first', async () => {
    const exam = await createExam({ title: 'orig' });
    await putItem(createItem({ examId: exam.id, prompt: 'p', answer: 'a' }));
    const payload = await exportBackup();

    const merged = await importPayload(payload, 'merge');
    expect(merged.skipped.items).toBe(1);
    expect(merged.added.items).toBe(0);
    expect((await loadExamSnapshot(exam.id)).items).toHaveLength(1);

    const other = await createExam({ title: 'other' });
    await putItem(createItem({ examId: other.id, prompt: 'q', answer: 'b' }));
    await importPayload(payload, 'replace');
    expect(await listExams()).toHaveLength(1);
    expect((await listExams())[0]!.title).toBe('orig');
  });

  it('carries the legacy blob through a round trip untouched', async () => {
    const exam = await createExam({ title: 'x' });
    const weird = { blueprint: [{ domain: '영역', weight: 30 }], nested: { a: [1, 2, { b: null }] } };
    await putItem(createItem({ examId: exam.id, prompt: 'p', answer: 'a', legacy: weird }));

    const payload = await exportBackup();
    await clearAll();
    await importPayload(payload);
    expect((await loadExamSnapshot(exam.id)).items[0]!.legacy).toEqual(weird);
  });
});

describe('settings', () => {
  it('returns defaults before anything is written, and merges patches', async () => {
    const initial = await readSettings();
    expect(initial.sessionSize).toBe(20);
    expect(initial.onboarded).toBe(false);

    await writeSettings({ sessionSize: 35 });
    await writeSettings({ theme: 'dark' });
    const merged = await readSettings();
    expect(merged.sessionSize).toBe(35);
    expect(merged.theme).toBe('dark');
    expect(merged.slowAnswerMs).toBe(25_000);
  });
});

describe('the database name is stable', () => {
  it('is what the shipped app opens', () => {
    expect(DB_NAME).toBe('exam-matrix');
  });
});
