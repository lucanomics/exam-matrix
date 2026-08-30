/**
 * Recall Edition generator.
 *
 * Turns the same data structure into a retrieval instrument by withholding
 * cells rather than by maintaining a second document. Row and column labels
 * always survive, so the learner gets cued recall — the grid *is* the cue.
 *
 * Deterministic: the same source file always blanks the same cells, so the
 * answer key stays valid and a reprint matches the copy already written on.
 */

import { MARKER_DIFFICULTY } from './archetypes.js';

/** Fraction of eligible matrix cells withheld. */
const TARGET_RATIO = 0.45;
/** Never withhold more than this share of one row — some context must remain. */
const MAX_ROW_RATIO = 0.7;

/** Cells carrying a discrimination are worth withholding; boilerplate is not. */
const WEIGHT = { trap: 5, exception: 5, distinction: 4, update: 3, core: 1.5, evidence: 0.5 };

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small, deterministic, good enough for choosing cells. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DIFFICULTY_GLYPH = { high: '●●●', mid: '●●', low: '●' };

/**
 * Annotates a loaded model in place with recall metadata.
 * Adds `blank` + `ref` + `difficulty` to chosen cells, and collects an answer key.
 *
 * @returns {Array<{topic, items: Array<{ref, where, answer, difficulty}>}>}
 */
export function applyRecall(model) {
  const key = [];
  let counter = 0;
  const next = () => ++counter;

  for (const t of model.topics) {
    const items = [];
    const rand = rng(hash(`${model.exam.name}::${t.id}`));

    // --- one-sentence model: always withheld ---------------------------------
    if (t.one_sentence) {
      const ref = next();
      t.recall_one_sentence = { ref };
      items.push({
        ref, where: model.lang === 'ko' ? '한 문장 모델' : 'One-sentence model',
        answer: t.one_sentence, difficulty: 'mid',
      });
    }

    // --- matrix cells --------------------------------------------------------
    const rows = t.matrix.rows;
    const candidates = [];
    rows.forEach((r, ri) => {
      r.cells.forEach((c, ci) => {
        if (c.empty || !c.v) return;
        candidates.push({ ri, ci, w: WEIGHT[c.mark] ?? 1, r: rand() });
      });
    });

    // Weighted ordering: high-discrimination cells first, jittered so the sheet
    // does not become "every trap column is blank".
    candidates.sort((a, b) => (b.w + b.r * 2.2) - (a.w + a.r * 2.2));

    const target = Math.round(candidates.length * TARGET_RATIO);
    const perRowCap = rows.map((r) =>
      Math.floor(r.cells.filter((c) => !c.empty && c.v).length * MAX_ROW_RATIO)
    );
    const perRowUsed = rows.map(() => 0);

    let taken = 0;
    for (const cand of candidates) {
      if (taken >= target) break;
      if (perRowUsed[cand.ri] >= perRowCap[cand.ri]) continue;
      const cell = rows[cand.ri].cells[cand.ci];
      const ref = next();
      cell.blank = true;
      cell.ref = ref;
      cell.difficulty = MARKER_DIFFICULTY[cell.mark] ?? 'low';
      perRowUsed[cand.ri]++;
      taken++;
      items.push({
        ref,
        where: `${rows[cand.ri].label} · ${t.matrix.columns[cand.ci].label}`,
        answer: cell.v,
        difficulty: cell.difficulty,
      });
    }

    // --- decisive distinction ------------------------------------------------
    if (t.decisive?.answer) {
      const ref = next();
      t.decisive.recall = { ref };
      items.push({
        ref, where: model.lang === 'ko' ? '결정적 변별' : 'Decisive distinction',
        answer: t.decisive.answer, difficulty: 'high',
      });
    }
    for (const p of t.decisive?.pairs ?? []) {
      if (!p.clue) continue;
      const ref = next();
      p.recall = { ref };
      items.push({
        ref, where: `${p.a} / ${p.b}`, answer: p.clue, difficulty: 'high',
      });
    }

    // --- traps: withhold the exception, keep the cue visible -----------------
    for (const tr of t.traps ?? []) {
      if (!tr.exception) continue;
      const ref = next();
      tr.recall = { ref };
      items.push({
        ref, where: tr.cue, answer: tr.exception, difficulty: 'high',
      });
    }

    if (items.length) key.push({ topic: t, items });
  }

  model.recall = { key, total: counter };
  return key;
}
