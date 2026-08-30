/**
 * Legacy conversion — the v1 YAML/editor era into the v2 learning model.
 *
 * Two inputs arrive here and both are normalised to one shape before anything
 * is converted, so there is a single code path to test:
 *
 *   examples/*.yaml            the committed exam files
 *   localStorage["em.v2"]      the browser editor's saved state, which is the
 *                              same object with its list fields flattened into
 *                              newline- and comma-separated strings
 *
 * What the conversion is trying to achieve is not a field-by-field copy. v1
 * described a *document*; v2 describes a *learning loop*. The interesting part
 * is deciding which parts of a document are already retrieval prompts:
 *
 *   topic.one_sentence   → a prompt: "…을 한 문장으로 설명하면?"
 *   topic.decisive       → a prompt: the exam's actual discrimination question
 *   topic.decisive.pairs → one comparison item per pair, plus a relation
 *   topic.traps          → the examiner's wording as prompt, exception as answer
 *   topic.evidence       → a prompt aimed at one matrix cell, keeping tested_as
 *   error_log            → items that already carry a lapse, because they do
 *   compression.l2/l3    → pinned items, which is what 시험 전날 pinning is
 *   topic.matrix         → a Matrix, drillable cell by cell
 *
 * Anything with no home lands in `legacy` rather than in the bin.
 */

import type {
  BackupPayload, ConfusionRelation, Exam, IntakeReason, MarkerKey,
  Matrix, MatrixColumn, MatrixRow, StudyItem, Subject, Topic,
} from '../../domain/models.ts';
import { newId, slugify } from '../../domain/ids.ts';
import { createItem, type NewItemInput } from '../../domain/item.ts';
import { makeRelation } from '../../domain/confusion.ts';
import { SCHEMA_VERSION } from '../db.ts';

/* ------------------------------------------------------- shared shapes --- */

export interface LegacyExamFile {
  exam?: Record<string, any>;
  topics?: any[];
  error_log?: any[];
  compression?: { l2?: any[]; l3?: any[] | string };
  blank_rows?: unknown;
  [k: string]: unknown;
}

const MARKERS: MarkerKey[] = ['core', 'distinction', 'exception', 'trap', 'update', 'evidence'];
const asMarker = (v: unknown): MarkerKey | undefined =>
  typeof v === 'string' && (MARKERS as string[]).includes(v) ? (v as MarkerKey) : undefined;

const splitLines = (v: unknown): string[] =>
  typeof v === 'string'
    ? v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

const splitCommas = (v: unknown): string[] =>
  typeof v === 'string'
    ? v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
    : Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/** Cell values are either a bare string or `{ v, mark, note }`. */
function readCell(raw: unknown): { value: string; marker?: MarkerKey; note?: string } | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const value = text(o.v ?? o.value);
    if (!value) return null;
    const marker = asMarker(o.mark);
    const note = text(o.note);
    return { value, ...(marker ? { marker } : {}), ...(note ? { note } : {}) };
  }
  return { value: text(raw) };
}

/**
 * The editor keeps its lists as strings in a textarea. Turn that state back
 * into the YAML file shape so the converter below sees one thing.
 */
export function normalizeEditorState(state: any): LegacyExamFile {
  if (!state || typeof state !== 'object') return {};
  const e = state.exam ?? {};
  const exam: Record<string, any> = {
    ...e,
    subjects: splitLines(e.subjects),
    sources: splitLines(e.sources),
    what_it_tests: splitLines(e.what_it_tests),
    high_yield: splitLines(e.high_yield),
    weak: splitLines(e.weak),
    volatile: splitLines(e.volatile),
    blueprint: Array.isArray(e.blueprint) ? e.blueprint : [],
  };

  const topics = (state.topics ?? []).map((t: any) => ({
    ...t,
    prerequisites: splitCommas(t.prerequisites),
    sources: splitCommas(t.sources),
    essentials: (t.essentials ?? []).map(text).filter(Boolean).slice(0, 5),
    matrix: {
      ...(t.matrix ?? {}),
      columns: (t.matrix?.columns ?? []).map((c: any) => ({
        key: c.key,
        label: c.label,
        label_ko: c.label_ko,
        mark: c.mark,
      })),
      rows: (t.matrix?.rows ?? []).map((r: any) => ({ label: r.label, sub: r.sub, cells: r.cells ?? {} })),
    },
  }));

  const l3raw = state.compression?.l3;
  return {
    exam,
    topics,
    error_log: state.error_log ?? [],
    compression: {
      l2: state.compression?.l2 ?? [],
      l3: typeof l3raw === 'string' ? splitLines(l3raw) : (l3raw ?? []),
    },
  };
}

/* --------------------------------------------------------- error types --- */

const ERROR_TYPE_TO_INTAKE: Record<string, IntakeReason> = {
  'knowledge-gap': 'wrong',
  'confused-pair': 'confused_pair',
  'exception-forgotten': 'missed_exception',
  'wording-misread': 'wording_trap',
  'formula-selection': 'wrong',
  calculation: 'wrong',
  'procedure-order': 'wrong',
  outdated: 'wrong',
  careless: 'wrong',
  'time-pressure': 'too_slow',
};

export interface ConvertOptions {
  warnings?: string[];
  /** Fixed clock, so the migration tests are deterministic. */
  now?: Date;
  markSample?: boolean;
}

export interface LegacyConversion
  extends Pick<BackupPayload, 'exams' | 'subjects' | 'topics' | 'items' | 'relations' | 'matrices'> {
  reviews: [];
  cellStats: [];
}

/**
 * The conversion. Deterministic apart from the ids, which are only ever
 * compared to each other.
 */
export function convertLegacyExamFile(
  file: LegacyExamFile,
  opts: ConvertOptions = {},
): LegacyConversion {
  const warn = opts.warnings ?? [];
  const stamp = (opts.now ?? new Date()).toISOString();
  const e = file.exam ?? {};

  /* ---- exam -------------------------------------------------------------- */
  const examId = newId('exam_');
  const {
    name, name_sub, date, lang: _lang, subjects: subjectNames, ...examRest
  } = e as Record<string, any>;

  const legacyExamFields = Object.fromEntries(
    Object.entries(examRest).filter(([, v]) =>
      v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)),
  );

  const exam: Exam = {
    id: examId,
    title: text(name) || '제목 없는 시험',
    ...(text(date) ? { examDate: text(date) } : {}),
    ...(text(name_sub) ? { description: text(name_sub) } : {}),
    ...(opts.markSample ? { isSample: true } : {}),
    createdAt: stamp,
    updatedAt: stamp,
    ...(Object.keys(legacyExamFields).length ? { legacy: legacyExamFields } : {}),
  };
  if (Object.keys(legacyExamFields).length) {
    warn.push(
      '출제 비중·합격 기준 같은 시험 메타 정보는 새 모델에 자리가 없어 원본 그대로 보관했습니다. ' +
      '백업 파일에 그대로 들어 있습니다.',
    );
  }

  /* ---- subjects ---------------------------------------------------------- */
  const subjects: Subject[] = splitLines(subjectNames).map((title, i) => ({
    id: newId('subj_'),
    examId,
    title,
    order: i,
  }));

  /* ---- topics, matrices, items ------------------------------------------- */
  const topics: Topic[] = [];
  const matrices: Matrix[] = [];
  const items: StudyItem[] = [];
  const relations: ConfusionRelation[] = [];
  /** Matrix cell lookup for evidence / error_log references: topicId → matrix. */
  const matrixByLegacyTopicId = new Map<string, Matrix>();
  const topicByLegacyId = new Map<string, Topic>();

  for (const [ti, t] of (file.topics ?? []).entries()) {
    const legacyTopicId = text(t.id) || slugify(text(t.title), `topic-${ti + 1}`);
    const topic: Topic = {
      id: newId('topic_'),
      examId,
      title: text(t.title) || `주제 ${ti + 1}`,
      order: ti,
    };
    topics.push(topic);
    topicByLegacyId.set(legacyTopicId, topic);

    const mk = (input: Omit<NewItemInput, 'examId'>): StudyItem =>
      createItem({ topicId: topic.id, createdAt: stamp, ...input, examId });

    /* matrix */
    const rawCols: any[] = t.matrix?.columns ?? [];
    const columns: MatrixColumn[] = rawCols.map((c, ci) => ({
      id: newId('col_'),
      key: text(c.key) || `c${ci + 1}`,
      label: text(c.label_ko) || text(c.label) || `기준 ${ci + 1}`,
      marker: asMarker(c.mark) ?? 'core',
    }));
    const colByKey = new Map(columns.map((c) => [c.key, c]));

    const rows: MatrixRow[] = (t.matrix?.rows ?? []).map((r: any, ri: number) => {
      const cells: MatrixRow['cells'] = {};
      for (const col of columns) {
        const cell = readCell(r.cells?.[col.key]);
        if (cell) cells[col.id] = cell;
      }
      return {
        id: newId('row_'),
        label: text(r.label) || `항목 ${ri + 1}`,
        ...(text(r.sub) ? { sub: text(r.sub) } : {}),
        cells,
      };
    });

    let matrix: Matrix | undefined;
    if (columns.length && rows.length) {
      matrix = {
        id: newId('mx_'),
        examId,
        topicId: topic.id,
        title: topic.title,
        rowLabel: text(t.matrix?.row_label) || '항목',
        archetype: (t.archetype ?? 'concept') as Matrix['archetype'],
        columns,
        rows,
        ...(text(t.matrix?.note) ? { note: text(t.matrix.note) } : {}),
        createdAt: stamp,
        updatedAt: stamp,
      };
      matrices.push(matrix);
      matrixByLegacyTopicId.set(legacyTopicId, matrix);
    }

    const rowByLabel = new Map((matrix?.rows ?? []).map((r) => [r.label, r]));

    /* one-sentence model → a free-recall prompt */
    if (text(t.one_sentence)) {
      items.push(mk({
        prompt: `${topic.title} — 한 문장으로 설명하면?`,
        answer: text(t.one_sentence),
        itemType: 'concept_prompt',
        markers: ['core'],
        intakeReason: 'manual',
      }));
    }

    /* essentials → one free-recall prompt, raw list preserved */
    const essentials = splitLines(t.essentials);
    if (essentials.length) {
      items.push(mk({
        prompt: `${topic.title} — 꼭 기억해야 할 것을 말해보세요.`,
        answer: essentials.map((x, i) => `${i + 1}. ${x}`).join('\n'),
        itemType: 'concept_prompt',
        markers: ['core'],
        legacy: { from: 'topic.essentials', raw: essentials },
      }));
    }

    /* decisive distinction — the discrimination question itself */
    if (text(t.decisive?.answer)) {
      items.push(mk({
        prompt: text(t.decisive?.prompt) || `${topic.title} — 하나만 고른다면 무엇으로 구분하나요?`,
        answer: text(t.decisive.answer),
        itemType: 'comparison',
        markers: ['distinction'],
        decisiveDistinction: text(t.decisive.answer),
      }));
    }

    /* decisive pairs — one comparison item each, plus a confusion relation */
    for (const p of t.decisive?.pairs ?? []) {
      const a = text(p.a), b = text(p.b);
      if (!a || !b) continue;
      const answer = text(p.clue) || text(p.why);
      if (!answer) continue;

      const itemA = mk({
        prompt: `${a} — ${b}와(과) 무엇이 다른가요?`,
        answer,
        ...(text(p.why) ? { rationale: text(p.why) } : {}),
        itemType: 'comparison',
        markers: ['distinction'],
        intakeReason: 'confused_pair',
        decisiveDistinction: answer,
        ...(rowByLabel.get(a) && matrix
          ? { cellRef: { matrixId: matrix.id, rowId: rowByLabel.get(a)!.id, columnId: columns[0]?.id ?? '' } }
          : {}),
      });
      const itemB = mk({
        prompt: `${b} — ${a}와(과) 무엇이 다른가요?`,
        answer,
        ...(text(p.why) ? { rationale: text(p.why) } : {}),
        itemType: 'comparison',
        markers: ['distinction'],
        intakeReason: 'confused_pair',
        decisiveDistinction: answer,
        ...(rowByLabel.get(b) && matrix
          ? { cellRef: { matrixId: matrix.id, rowId: rowByLabel.get(b)!.id, columnId: columns[0]?.id ?? '' } }
          : {}),
      });
      itemA.confusedWithIds = [itemB.id];
      itemB.confusedWithIds = [itemA.id];
      items.push(itemA, itemB);
      relations.push(makeRelation(examId, itemA.id, itemB.id, 'contrasts_with', text(p.why) || undefined, stamp));
    }

    /* traps — the examiner's own phrasing is the prompt */
    for (const tr of t.traps ?? []) {
      const cue = text(tr.cue);
      if (!cue) continue;
      const answer = text(tr.exception) || text(tr.usually);
      if (!answer) continue;
      items.push(mk({
        prompt: `"${cue}" — 항상 그런가요?`,
        answer,
        rationale: [text(tr.usually) && `원칙: ${text(tr.usually)}`, text(tr.why)].filter(Boolean).join('\n'),
        examinerWording: cue,
        itemType: 'statement_judgement',
        markers: text(tr.exception) ? ['trap', 'exception'] : ['trap'],
        intakeReason: 'wording_trap',
        ...(text(tr.source) ? { source: { type: 'past_paper', title: text(tr.source) } } : {}),
      }));
    }

    /* evidence — a prompt aimed at one cell, keeping the examiner's wording */
    for (const ev of t.evidence ?? []) {
      const ref = ev.cell;
      if (!matrix || !ref || typeof ref !== 'object') {
        if (text(ev.tested_as)) {
          warn.push(`"${topic.title}" 의 기출 표현 하나를 표의 칸과 연결하지 못했습니다.`);
        }
        continue;
      }
      const row = rowByLabel.get(text(ref.row));
      const col = colByKey.get(text(ref.column));
      if (!row || !col) continue;
      const value = row.cells[col.id]?.value;
      if (!value) continue;
      items.push(mk({
        prompt: `${row.label} — ${col.label}?`,
        answer: value,
        ...(text(ev.tested_as) ? { examinerWording: text(ev.tested_as) } : {}),
        ...(text(ev.question) ? { rationale: `출제: ${text(ev.question)}` } : {}),
        itemType: 'short_answer',
        markers: ['evidence'],
        source: {
          type: 'past_paper',
          ...(text(ev.exam) ? { title: text(ev.exam) } : text(ev.source) ? { title: text(ev.source) } : {}),
        },
        cellRef: { matrixId: matrix.id, rowId: row.id, columnId: col.id },
      }));
    }
  }

  /* ---- error log — these already carry a failure ------------------------- */
  for (const entry of file.error_log ?? []) {
    const prompt = text(entry.question);
    const answer = text(entry.correct);
    if (!prompt || !answer) continue;

    const legacyTopicId = text(entry.topic) || text(entry.matrix_update?.topic);
    const topic = legacyTopicId ? topicByLegacyId.get(legacyTopicId) : undefined;
    const matrix = legacyTopicId ? matrixByLegacyTopicId.get(legacyTopicId) : undefined;

    let cellRef: StudyItem['cellRef'];
    const upd = entry.matrix_update;
    if (matrix && upd && typeof upd === 'object') {
      const row = matrix.rows.find((r) => r.label === text(upd.row));
      const col = matrix.columns.find((c) => c.key === text(upd.column));
      if (row && col) cellRef = { matrixId: matrix.id, rowId: row.id, columnId: col.id };
    }

    const item = createItem({
      examId,
      ...(topic ? { topicId: topic.id } : {}),
      prompt,
      answer,
      ...(text(entry.missing_distinction) ? { rationale: text(entry.missing_distinction) } : {}),
      ...(text(entry.mine) ? { confusionNote: `예전에 쓴 답: ${text(entry.mine)}` } : {}),
      itemType: 'short_answer',
      intakeReason: ERROR_TYPE_TO_INTAKE[text(entry.error_type)] ?? 'wrong',
      markers: entry.error_type === 'wording-misread' ? ['trap'] : [],
      ...(cellRef ? { cellRef } : {}),
      createdAt: text(entry.date) ? new Date(entry.date).toISOString() : stamp,
      legacy: { from: 'error_log', raw: entry },
    });
    // It was recorded because it was got wrong. Carry that in, do not invent a
    // review event — the app never fabricates retrieval history.
    item.lapses = 1;
    item.status = 'active';
    items.push(item);
  }

  /* ---- compression → pinned items ---------------------------------------- */
  for (const row of file.compression?.l2 ?? []) {
    const label = text(row?.item ?? row);
    if (!label) continue;
    const detail = text(row?.detail);
    const item = createItem({
      examId,
      prompt: detail ? `${label} — ?` : label,
      answer: detail || label,
      itemType: 'concept_prompt',
      markers: asMarker(row?.mark) ? [asMarker(row.mark)!] : ['core'],
      createdAt: stamp,
      legacy: { from: 'compression.l2', raw: row },
    });
    item.pinned = true;
    items.push(item);
  }

  const l3 = Array.isArray(file.compression?.l3) ? file.compression.l3 : splitLines(file.compression?.l3);
  for (const line of l3) {
    const s = text(line);
    if (!s) continue;
    const item = createItem({
      examId,
      prompt: s,
      answer: s,
      itemType: 'concept_prompt',
      markers: ['core'],
      createdAt: stamp,
      legacy: { from: 'compression.l3', raw: s },
    });
    item.pinned = true;
    items.push(item);
  }
  if (l3.length) {
    warn.push(
      `마지막 10분용 메모 ${l3.length}개를 "시험 전날" 고정 항목으로 옮겼습니다. ` +
      '문제 형태로 다듬으면 복습에도 쓸 수 있습니다.',
    );
  }

  return { exams: [exam], subjects, topics, items, relations, matrices, reviews: [], cellStats: [] };
}

/** Wrap a conversion as a full payload, for the import pipeline. */
export function legacyToPayload(file: LegacyExamFile, opts: ConvertOptions = {}): BackupPayload {
  const c = convertLegacyExamFile(file, opts);
  return {
    format: 'exam-matrix-backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: (opts.now ?? new Date()).toISOString(),
    ...c,
  };
}

/** The browser editor's saved state, if this browser still has it. */
export const LEGACY_STORAGE_KEY = 'em.v2';

export function readLegacyLocalStorage(store?: Storage): LegacyExamFile | null {
  try {
    const s = store ?? globalThis.localStorage;
    const raw = s?.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const file = normalizeEditorState(parsed);
    const hasContent =
      !!text(file.exam?.name) || (file.topics?.length ?? 0) > 0 || (file.error_log?.length ?? 0) > 0;
    return hasContent ? file : null;
  } catch {
    return null;
  }
}
