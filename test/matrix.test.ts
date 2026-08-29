/**
 * The matrix as an instrument: which cells get hidden, and what a missed cell
 * does to the next round.
 */

import { describe, expect, it } from 'vitest';
import {
  addrKey, applyCellOutcome, cellMarker, DEFAULT_BLANK_RATIO, fillRate,
  isUnstable, newColumn, newRow, planBlanks, setCell,
} from '../src/domain/matrix.ts';
import { cellStatId, newId } from '../src/domain/ids.ts';
import { suggestMatrices, makeRelation, rankPairs, partnersOf } from '../src/domain/confusion.ts';
import { createItem } from '../src/domain/item.ts';
import type { CellStat, Matrix, StudyItem } from '../src/domain/models.ts';

function build(): Matrix {
  const cols = [
    newColumn('정의', 'core'),
    newColumn('결정적 차이', 'distinction'),
    newColumn('예외', 'exception'),
    newColumn('함정', 'trap'),
  ];
  const rows = ['A', 'B', 'C'].map((label) => {
    const r = newRow(label);
    cols.forEach((c, i) => { r.cells[c.id] = { value: `${label}-${i}` }; });
    return r;
  });
  return {
    id: 'mx1', examId: 'e', title: 'm', rowLabel: '항목', archetype: 'concept',
    columns: cols, rows,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('planBlanks', () => {
  it('is deterministic for the same matrix and seed', () => {
    const m = build();
    const a = planBlanks(m);
    const b = planBlanks(m);
    expect([...a.blanked].sort()).toEqual([...b.blanked].sort());
  });

  it('produces a different-but-reproducible set for a new seed', () => {
    const m = build();
    const a = planBlanks(m, { seed: 1 });
    const b = planBlanks(m, { seed: 2 });
    expect([...a.blanked].sort()).toEqual([...planBlanks(m, { seed: 1 }).blanked].sort());
    expect([...a.blanked].sort()).not.toEqual([...b.blanked].sort());
  });

  it('hides roughly the target share and never a whole row', () => {
    const m = build();
    const plan = planBlanks(m);
    const filled = m.rows.length * m.columns.length;
    expect(plan.order.length).toBe(Math.round(filled * DEFAULT_BLANK_RATIO));
    for (const row of m.rows) {
      const hidden = m.columns.filter((c) => plan.blanked.has(addrKey(row.id, c.id))).length;
      expect(hidden).toBeLessThan(m.columns.length);
    }
  });

  it('prefers discriminating cells over boilerplate', () => {
    const m = build();
    const plan = planBlanks(m, { ratio: 0.3 });
    const markerOf = (key: string) => {
      const [rowId, colId] = key.split(':') as [string, string];
      return cellMarker(m, rowId, colId);
    };
    const marks = [...plan.blanked].map(markerOf);
    const discriminating = marks.filter((x) => x === 'trap' || x === 'exception' || x === 'distinction');
    expect(discriminating.length).toBeGreaterThan(marks.length / 2);
  });

  it('weights a cell this learner keeps missing far above its marker', () => {
    const m = build();
    // The dullest possible cell: 정의 (core) on row C.
    const rowC = m.rows[2]!;
    const colDef = m.columns[0]!;
    const stats = new Map<string, CellStat>([[
      cellStatId(m.id, rowC.id, colDef.id),
      {
        id: cellStatId(m.id, rowC.id, colDef.id), matrixId: m.id, rowId: rowC.id,
        columnId: colDef.id, examId: 'e', attempts: 4, misses: 4,
      },
    ]]);
    const without = planBlanks(m, { ratio: 0.2 });
    const withStats = planBlanks(m, { ratio: 0.2, stats });
    expect(without.blanked.has(addrKey(rowC.id, colDef.id))).toBe(false);
    expect(withStats.blanked.has(addrKey(rowC.id, colDef.id))).toBe(true);
  });

  it('restricts to one marker when the learner asks for 함정만', () => {
    const m = build();
    const trapCol = m.columns[3]!;
    const plan = planBlanks(m, { onlyMarkers: ['trap'] });
    for (const a of plan.order) expect(a.columnId).toBe(trapCol.id);
  });

  it('restricts to a single row or column for the row/column drills', () => {
    const m = build();
    const row = m.rows[1]!;
    expect(planBlanks(m, { onlyRowId: row.id }).order.every((a) => a.rowId === row.id)).toBe(true);
    const col = m.columns[2]!;
    expect(planBlanks(m, { onlyColumnId: col.id }).order.every((a) => a.columnId === col.id)).toBe(true);
  });

  it('never hides an empty cell', () => {
    const m = build();
    m.rows[0]!.cells[m.columns[0]!.id] = { value: '' };
    const plan = planBlanks(m, { ratio: 1 });
    expect(plan.blanked.has(addrKey(m.rows[0]!.id, m.columns[0]!.id))).toBe(false);
  });

  it('presents the blanks in reading order', () => {
    const m = build();
    const plan = planBlanks(m, { ratio: 0.9 });
    const rowPos = new Map(m.rows.map((r, i) => [r.id, i]));
    const colPos = new Map(m.columns.map((c, i) => [c.id, i]));
    const seq = plan.order.map((a) => (rowPos.get(a.rowId)! * 10) + colPos.get(a.columnId)!);
    expect(seq).toEqual([...seq].sort((x, y) => x - y));
  });
});

describe('cell statistics', () => {
  it('accumulates attempts and misses, and stamps the last miss', () => {
    const ref = { matrixId: 'm', rowId: 'r', columnId: 'c', examId: 'e' };
    let stat = applyCellOutcome(undefined, ref, false, '2026-01-01T00:00:00Z');
    expect(stat).toMatchObject({ attempts: 1, misses: 1, lastMissAt: '2026-01-01T00:00:00Z' });
    stat = applyCellOutcome(stat, ref, true, '2026-01-02T00:00:00Z');
    expect(stat.attempts).toBe(2);
    expect(stat.misses).toBe(1);
    expect(stat.lastMissAt).toBe('2026-01-01T00:00:00Z');
    expect(stat.lastAttemptAt).toBe('2026-01-02T00:00:00Z');
  });

  it('calls a cell unstable on two misses, or on a half-miss rate', () => {
    const base = { id: 'x', matrixId: 'm', rowId: 'r', columnId: 'c', examId: 'e' };
    expect(isUnstable(undefined)).toBe(false);
    expect(isUnstable({ ...base, attempts: 0, misses: 0 })).toBe(false);
    expect(isUnstable({ ...base, attempts: 4, misses: 1 })).toBe(false);
    expect(isUnstable({ ...base, attempts: 2, misses: 1 })).toBe(true);
    expect(isUnstable({ ...base, attempts: 9, misses: 2 })).toBe(true);
  });
});

describe('editing', () => {
  it('setCell writes without mutating the original and bumps updatedAt', () => {
    const m = build();
    const before = JSON.stringify(m);
    const next = setCell(m, m.rows[0]!.id, m.columns[0]!.id, { value: '새 값', marker: 'trap' });
    expect(JSON.stringify(m)).toBe(before);
    expect(next.rows[0]!.cells[m.columns[0]!.id]).toMatchObject({ value: '새 값', marker: 'trap' });
    expect(next.updatedAt).not.toBe(m.updatedAt);
  });

  it('cellMarker falls back to the column marker', () => {
    const m = build();
    expect(cellMarker(m, m.rows[0]!.id, m.columns[3]!.id)).toBe('trap');
    const next = setCell(m, m.rows[0]!.id, m.columns[3]!.id, { marker: 'core' });
    expect(cellMarker(next, m.rows[0]!.id, m.columns[3]!.id)).toBe('core');
  });

  it('fillRate counts only non-blank cells', () => {
    const m = build();
    expect(fillRate(m)).toEqual({ filled: 12, total: 12 });
    const next = setCell(m, m.rows[0]!.id, m.columns[0]!.id, { value: '   ' });
    expect(fillRate(next).filled).toBe(11);
  });
});

describe('confusion graph', () => {
  const mk = (id: string, p: Partial<StudyItem> = {}): StudyItem => ({
    ...createItem({ examId: 'e', prompt: id, answer: id, id }), ...p,
  });

  it('stores a pair once regardless of argument order', () => {
    const a = makeRelation('e', 'z', 'a');
    const b = makeRelation('e', 'a', 'z');
    expect([a.aId, a.bId]).toEqual([b.aId, b.bId]);
  });

  it('partnersOf reads both directions', () => {
    const rels = [makeRelation('e', 'a', 'b'), makeRelation('e', 'c', 'a')];
    expect(partnersOf(rels, 'a').sort()).toEqual(['b', 'c']);
  });

  it('ranks unresolved pairs above settled ones, by miss count', () => {
    const items = new Map([
      ['a', mk('a', { lapses: 3 })], ['b', mk('b', { lapses: 1 })],
      ['c', mk('c', { status: 'mastered' })], ['d', mk('d', { status: 'mastered' })],
    ]);
    const rels = [makeRelation('e', 'a', 'b'), makeRelation('e', 'c', 'd')];
    const ranked = rankPairs(rels, items, new Map());
    expect(ranked[0]!.misses).toBe(4);
    expect(ranked[0]!.unresolved).toBe(true);
    expect(ranked[1]!.unresolved).toBe(false);
  });

  it('suggests a matrix from an explicit confusion chain, merged into one cluster', () => {
    const items = [mk('a'), mk('b'), mk('c')];
    const rels = [makeRelation('e', 'a', 'b'), makeRelation('e', 'b', 'c')];
    const out = suggestMatrices(items, rels, [], new Set());
    expect(out[0]!.itemIds).toEqual(['a', 'b', 'c']);
    expect(out[0]!.reason).toContain('직접 연결');
  });

  it('suggests from repeated failures in the same topic', () => {
    const items = [mk('a', { topicId: 't', lapses: 2 }), mk('b', { topicId: 't', lapses: 1 })];
    const out = suggestMatrices(items, [], [], new Set());
    expect(out).toHaveLength(1);
    expect(out[0]!.topicId).toBe('t');
  });

  it('stays quiet once every candidate is already in a matrix', () => {
    const items = [mk('a'), mk('b')];
    const rels = [makeRelation('e', 'a', 'b')];
    expect(suggestMatrices(items, rels, [], new Set(['a', 'b']))).toHaveLength(0);
  });

  it('never suggests a single-item matrix', () => {
    const items = [mk('a', { topicId: 't', lapses: 5 })];
    expect(suggestMatrices(items, [], [], new Set())).toHaveLength(0);
  });

  it('ignores relations that point at items that no longer exist', () => {
    const out = suggestMatrices([mk('a')], [makeRelation('e', 'a', 'ghost')], [], new Set());
    expect(out).toHaveLength(0);
  });
});

describe('ids', () => {
  it('sorts chronologically', async () => {
    const a = newId();
    await new Promise((r) => setTimeout(r, 3));
    const b = newId();
    expect(a < b).toBe(true);
  });
});
