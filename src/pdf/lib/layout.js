/**
 * Adaptive matrix layout.
 *
 * The rule the brief insists on and that this implements: never shrink a wide
 * table until it is unreadable. Widen the page first; if that is not enough,
 * split the columns across pages, repeating the row-label column. Font size is
 * never the variable.
 */

import { visualLen } from './text.js';

/** Millimetres. Derived from the @page margins in src/pdf/print.css. */
const GEOM = {
  portrait:  { usable: 180, rowLabel: 32 },
  landscape: { usable: 271, rowLabel: 34 },
};

/** Minimum comfortable data-column width. Recall cells need room to write in. */
const MIN_COL = { full: 28, recall: 34 };

function maxCols(orientation, edition) {
  const g = GEOM[orientation];
  return Math.max(1, Math.floor((g.usable - g.rowLabel) / MIN_COL[edition]));
}

/** Split n columns into balanced groups of at most `cap`. */
function balancedChunks(columns, cap) {
  const n = columns.length;
  if (n <= cap) return [columns];
  const groups = Math.ceil(n / cap);
  const size = Math.ceil(n / groups);
  const out = [];
  for (let i = 0; i < n; i += size) out.push(columns.slice(i, i + size));
  return out;
}

/**
 * @returns {{orientation, chunks: Array<{columns, index, total}>, density}}
 */
export function planMatrix(matrix, edition = 'full') {
  const cols = matrix.columns;
  const rows = matrix.rows;

  // Longest content each column has to hold, in half-width units.
  const perColMax = cols.map((c, ci) =>
    Math.max(visualLen(c.label), ...rows.map((r) => visualLen(r.cells[ci]?.v ?? '')))
  );
  const density = perColMax.length
    ? perColMax.reduce((a, b) => a + b, 0) / perColMax.length
    : 0;

  const capPortrait = maxCols('portrait', edition);
  const capLandscape = maxCols('landscape', edition);

  let orientation;
  if (matrix.layout === 'portrait' || matrix.layout === 'landscape') {
    orientation = matrix.layout;
  } else if (cols.length <= capPortrait && (cols.length <= 3 || density <= 34)) {
    // Few columns, or several short ones: portrait keeps the reading rhythm of
    // the rest of the document and duplex-prints without rotating the page.
    orientation = 'portrait';
  } else {
    orientation = 'landscape';
  }

  const cap = orientation === 'portrait' ? capPortrait : capLandscape;
  const groups = balancedChunks(cols, cap);

  return {
    orientation,
    density: Math.round(density),
    chunks: groups.map((columns, i) => ({
      columns,
      // Column indices into the original row.cells array.
      indices: columns.map((c) => cols.findIndex((x) => x.key === c.key)),
      index: i + 1,
      total: groups.length,
    })),
  };
}

/**
 * Column width percentages for one chunk. Proportional to content need but
 * clamped, so one verbose column cannot starve the others.
 */
export function columnWidths(chunk, rows, orientation) {
  const g = GEOM[orientation];
  const labelPct = (g.rowLabel / g.usable) * 100;
  const need = chunk.columns.map((c, i) => {
    const ci = chunk.indices[i];
    const m = Math.max(visualLen(c.label), ...rows.map((r) => visualLen(r.cells[ci]?.v ?? '')));
    return Math.min(Math.max(m, 14), 46); // clamp so nothing dominates
  });
  const total = need.reduce((a, b) => a + b, 0) || 1;
  const rest = 100 - labelPct;
  return {
    label: labelPct.toFixed(2),
    cols: need.map((n) => ((n / total) * rest).toFixed(2)),
  };
}
