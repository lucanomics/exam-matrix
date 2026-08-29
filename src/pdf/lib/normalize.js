/**
 * Turns a raw parsed exam object into the shape the templates render.
 *
 * Pure: no fs, no ajv, no js-yaml. That is deliberate — this module is bundled
 * into the browser editor so that typing in the editor and building from a YAML
 * file go through exactly the same normalisation, and the on-screen preview
 * cannot drift from the committed PDFs.
 */

import { ARCHETYPES, MARKERS, MARKER_DIFFICULTY, defaultColumns, archetypeRowLabel } from './archetypes.js';

const MAX_ESSENTIALS = 5;

/** Normalise a cell: bare string or {v, mark, note}. */
function normCell(raw, columnMark) {
  if (raw === null || raw === undefined || raw === '') {
    return { v: '', mark: columnMark, empty: true };
  }
  if (typeof raw === 'object') {
    return {
      v: String(raw.v ?? raw.value ?? ''),
      mark: raw.mark ?? columnMark ?? 'core',
      note: raw.note ?? null,
      empty: !(raw.v ?? raw.value),
    };
  }
  return { v: String(raw), mark: columnMark ?? 'core', empty: false };
}

function pickLabel(obj, lang, base = 'label') {
  if (!obj) return '';
  return (lang === 'ko' && obj[`${base}_ko`]) ? obj[`${base}_ko`] : (obj[base] ?? obj[`${base}_ko`] ?? '');
}

function daysBetween(from, to) {
  const a = new Date(from), b = new Date(to);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * `key:` with nothing after it is how a person fills in a template, and YAML
 * reads it as null. Treat that as "not provided" rather than as a type error,
 * so a half-completed file still builds. Objects and array entries left wholly
 * empty are dropped for the same reason.
 */
export function stripEmpty(node) {
  if (Array.isArray(node)) {
    return node.map(stripEmpty).filter((v) => v !== null && v !== undefined);
  }
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      const s = stripEmpty(v);
      if (s === null || s === undefined) continue;
      if (typeof s === 'object' && !Array.isArray(s) && Object.keys(s).length === 0) continue;
      out[k] = s;
    }
    return out;
  }
  return node;
}

export function normalizeExam(raw, { today = new Date() } = {}) {
  const warnings = [];
  const lang = raw.exam?.lang === 'ko' ? 'ko' : 'en';
  const exam = { ...(raw.exam ?? {}), lang };
  exam.days_remaining = exam.date ? daysBetween(today, exam.date) : null;
  exam.blueprint = raw.exam?.blueprint ?? [];

  const topics = (raw.topics ?? []).map((t, ti) => {
    const arch = ARCHETYPES[t.archetype];
    if (!arch) throw new Error(`Topic "${t.title}": unknown archetype "${t.archetype}"`);

    const m = t.matrix ?? {};
    const rawCols = m.columns?.length ? m.columns : defaultColumns(t.archetype);
    const columns = rawCols.map((c) => ({
      key: c.key,
      label: pickLabel(c, lang),
      mark: c.mark ?? 'core',
    }));

    const rows = (m.rows ?? []).map((r) => ({
      label: r.label,
      sub: r.sub ?? null,
      cells: columns.map((c) => normCell(r.cells?.[c.key], c.mark)),
    }));

    if ((t.essentials ?? []).length > MAX_ESSENTIALS) {
      warnings.push(
        `Topic "${t.title}": ${t.essentials.length} essentials — the system caps at ` +
        `${MAX_ESSENTIALS} on purpose (P8, structure beats volume). Extra items dropped.`
      );
    }

    return {
      ...t,
      index: ti + 1,
      archetypeLabel: pickLabel(arch, lang),
      essentials: (t.essentials ?? []).slice(0, MAX_ESSENTIALS),
      matrix: {
        row_label: m.row_label ?? archetypeRowLabel(t.archetype, lang),
        note: m.note ?? null,
        layout: m.layout ?? 'auto',
        columns,
        rows,
      },
      decisive: t.decisive ?? null,
      traps: t.traps ?? [],
      evidence: t.evidence ?? [],
    };
  });

  // --- structural error -> matrix cell links -----------------------------
  // This is the load-bearing feedback link (P3). A dangling reference means a
  // mistake was logged against a cell that does not exist, which is a real
  // authoring bug, so we surface it rather than rendering a broken breadcrumb.
  const byId = new Map(topics.map((t) => [t.id, t]));
  const resolveRef = (ref, where, defaultTopicId = null) => {
    if (!ref) return null;
    if (typeof ref === 'string') return { text: ref, resolved: false };
    const topicId = ref.topic ?? defaultTopicId;
    if (!topicId) {
      warnings.push(`${where}: cell reference has no topic and none could be inferred`);
      return { text: `${ref.row ?? ''} · ${ref.column ?? ''}`, resolved: false };
    }
    const t = byId.get(topicId);
    if (!t) {
      warnings.push(`${where}: references unknown topic "${topicId}"`);
      return { text: `${topicId} · ${ref.row ?? ''} · ${ref.column ?? ''}`, resolved: false };
    }
    const row = t.matrix.rows.find((r) => r.label === ref.row);
    const colIdx = t.matrix.columns.findIndex((c) => c.key === ref.column);
    if (!row) warnings.push(`${where}: topic "${topicId}" has no row "${ref.row}"`);
    if (colIdx < 0) warnings.push(`${where}: topic "${topicId}" has no column "${ref.column}"`);
    const colLabel = colIdx >= 0 ? t.matrix.columns[colIdx].label : ref.column;
    return {
      text: [t.title, ref.row, colLabel].filter(Boolean).join(' · '),
      // Same breadcrumb without the topic, for use on that topic's own pages.
      short: [ref.row, colLabel].filter(Boolean).join(' · '),
      resolved: !!row && colIdx >= 0,
      topicIndex: t.index,
    };
  };

  const error_log = (raw.error_log ?? []).map((e, i) => ({
    ...e,
    matrix_update: resolveRef(e.matrix_update, `error_log[${i}]`),
  }));

  topics.forEach((t) => {
    t.evidence = t.evidence.map((ev, i) => ({
      ...ev,
      cellRef: resolveRef(ev.cell, `topic "${t.id}" evidence[${i}]`, t.id),
    }));
  });

  return {
    exam,
    topics,
    error_log,
    compression: raw.compression ?? {},
    blank_rows: raw.blank_rows ?? {},
    warnings,
    lang,
    MARKERS,
    MARKER_DIFFICULTY,
  };
}
