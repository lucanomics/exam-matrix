/**
 * The matrix, as an instrument rather than a picture.
 *
 * A comparison table earns its place only if the learner can hide parts of it
 * and rebuild them from memory (§43). So this module does three things:
 *
 *   - chooses which cells to blank, using the same marker weighting the print
 *     Recall Edition uses, plus one addition the paper edition cannot have:
 *     cells this learner has actually missed before are far more likely to be
 *     withheld;
 *   - records per-cell outcomes so a repeatedly-failed cell can be shown as
 *     unstable in the table itself;
 *   - converts a matrix into the shape the preserved PDF engine expects, so
 *     screen and paper never disagree about what a matrix contains.
 */

import type {
  CellStat, ID, MarkerKey, Matrix, MatrixCell, MatrixColumn, MatrixRow,
} from './models.ts';
import { cellStatId, hash32, newId, rng, slugify } from './ids.ts';
import { MARKER_DIFFICULTY } from '../pdf/lib/archetypes.js';

/** Same weights as src/pdf/lib/recall.js. Discriminating cells are worth hiding. */
const MARKER_WEIGHT: Record<MarkerKey, number> = {
  trap: 5, exception: 5, distinction: 4, update: 3, core: 1.5, evidence: 0.5,
};

/** Default share of filled cells withheld, matching the print edition. */
export const DEFAULT_BLANK_RATIO = 0.45;
/** Some context must survive in every row. */
const MAX_ROW_RATIO = 0.7;

export interface CellAddress { rowId: ID; columnId: ID }

export interface BlankPlan {
  /** `${rowId}:${columnId}` for O(1) membership tests during render. */
  blanked: Set<string>;
  order: CellAddress[];
}

export const addrKey = (rowId: ID, columnId: ID): string => `${rowId}:${columnId}`;

export interface BlankOptions {
  ratio?: number;
  /** Restrict to one row, one column, or one marker — the row/column drills. */
  onlyRowId?: ID;
  onlyColumnId?: ID;
  onlyMarkers?: MarkerKey[];
  /** Per-cell history; missed cells get a large weight bonus. */
  stats?: Map<string, CellStat>;
  /** Override the seed to get a different-but-still-reproducible selection. */
  seed?: number;
}

/**
 * Deterministic for a given matrix + seed, exactly like the print edition, so
 * "다시 풀기" reproduces the same sheet and a reprint matches what was written
 * on. Passing a new seed is how the learner asks for a different set.
 */
export function planBlanks(matrix: Matrix, opts: BlankOptions = {}): BlankPlan {
  const ratio = opts.ratio ?? DEFAULT_BLANK_RATIO;
  const rand = rng(opts.seed ?? hash32(`${matrix.id}::${matrix.updatedAt}`));

  interface Candidate { rowId: ID; columnId: ID; w: number; jitter: number; rowIdx: number }
  const candidates: Candidate[] = [];
  const colMarker = new Map(matrix.columns.map((c) => [c.id, c.marker]));

  matrix.rows.forEach((row, rowIdx) => {
    if (opts.onlyRowId && row.id !== opts.onlyRowId) return;
    for (const col of matrix.columns) {
      if (opts.onlyColumnId && col.id !== opts.onlyColumnId) continue;
      const cell = row.cells[col.id];
      if (!cell?.value?.trim()) continue;
      const marker = cell.marker ?? colMarker.get(col.id) ?? 'core';
      if (opts.onlyMarkers?.length && !opts.onlyMarkers.includes(marker)) continue;

      const stat = opts.stats?.get(cellStatId(matrix.id, row.id, col.id));
      // A cell you have already failed is the point of the exercise.
      const missBonus = stat ? Math.min(stat.misses, 4) * 3 : 0;
      candidates.push({
        rowId: row.id,
        columnId: col.id,
        w: (MARKER_WEIGHT[marker] ?? 1) + missBonus,
        jitter: rand(),
        rowIdx,
      });
    }
  });

  candidates.sort(
    (a, b) =>
      (b.w + b.jitter * 2.2) - (a.w + a.jitter * 2.2) ||
      a.rowId.localeCompare(b.rowId) ||
      a.columnId.localeCompare(b.columnId),
  );

  const filledPerRow = new Map<ID, number>();
  for (const c of candidates) filledPerRow.set(c.rowId, (filledPerRow.get(c.rowId) ?? 0) + 1);

  const target = Math.max(1, Math.round(candidates.length * ratio));
  const usedPerRow = new Map<ID, number>();
  const blanked = new Set<string>();
  const order: CellAddress[] = [];

  for (const c of candidates) {
    if (order.length >= target) break;
    const cap = Math.max(1, Math.floor((filledPerRow.get(c.rowId) ?? 0) * MAX_ROW_RATIO));
    const used = usedPerRow.get(c.rowId) ?? 0;
    if (used >= cap) continue;
    usedPerRow.set(c.rowId, used + 1);
    blanked.add(addrKey(c.rowId, c.columnId));
    order.push({ rowId: c.rowId, columnId: c.columnId });
  }

  // Present in reading order — top-left to bottom-right — so filling the sheet
  // feels like filling a table, not answering a shuffled quiz.
  const rowPos = new Map(matrix.rows.map((r, i) => [r.id, i]));
  const colPos = new Map(matrix.columns.map((c, i) => [c.id, i]));
  order.sort(
    (a, b) =>
      (rowPos.get(a.rowId) ?? 0) - (rowPos.get(b.rowId) ?? 0) ||
      (colPos.get(a.columnId) ?? 0) - (colPos.get(b.columnId) ?? 0),
  );

  return { blanked, order };
}

/** Cells failed more often than they are answered are shown as unstable. */
export function isUnstable(stat: CellStat | undefined): boolean {
  if (!stat || stat.attempts === 0) return false;
  return stat.misses >= 2 || stat.misses / stat.attempts >= 0.5;
}

export function applyCellOutcome(
  prev: CellStat | undefined,
  ref: { matrixId: ID; rowId: ID; columnId: ID; examId: ID },
  correct: boolean,
  at: string,
): CellStat {
  const base: CellStat = prev ?? {
    id: cellStatId(ref.matrixId, ref.rowId, ref.columnId),
    matrixId: ref.matrixId,
    rowId: ref.rowId,
    columnId: ref.columnId,
    examId: ref.examId,
    attempts: 0,
    misses: 0,
  };
  return {
    ...base,
    attempts: base.attempts + 1,
    misses: base.misses + (correct ? 0 : 1),
    lastAttemptAt: at,
    ...(correct ? {} : { lastMissAt: at }),
  };
}

/* ------------------------------------------------------------- authoring - */

export function newColumn(label: string, marker: MarkerKey = 'core'): MatrixColumn {
  return { id: newId('col_'), key: slugify(label, 'col'), label, marker };
}

export function newRow(label: string): MatrixRow {
  return { id: newId('row_'), label, cells: {} };
}

export function getCell(matrix: Matrix, rowId: ID, columnId: ID): MatrixCell | undefined {
  return matrix.rows.find((r) => r.id === rowId)?.cells[columnId];
}

export function cellMarker(matrix: Matrix, rowId: ID, columnId: ID): MarkerKey {
  const cell = getCell(matrix, rowId, columnId);
  if (cell?.marker) return cell.marker;
  return matrix.columns.find((c) => c.id === columnId)?.marker ?? 'core';
}

export function setCell(
  matrix: Matrix, rowId: ID, columnId: ID, patch: Partial<MatrixCell>,
): Matrix {
  return {
    ...matrix,
    rows: matrix.rows.map((r) =>
      r.id === rowId
        ? { ...r, cells: { ...r.cells, [columnId]: { value: '', ...r.cells[columnId], ...patch } } }
        : r,
    ),
    updatedAt: new Date().toISOString(),
  };
}

/** How much of the table is actually filled in. Drives the empty-state copy. */
export function fillRate(matrix: Matrix): { filled: number; total: number } {
  let filled = 0;
  const total = matrix.rows.length * matrix.columns.length;
  for (const row of matrix.rows) {
    for (const col of matrix.columns) {
      if (row.cells[col.id]?.value?.trim()) filled++;
    }
  }
  return { filled, total };
}

export const difficultyOf = (marker: MarkerKey): 'high' | 'mid' | 'low' =>
  MARKER_DIFFICULTY[marker] ?? 'low';
