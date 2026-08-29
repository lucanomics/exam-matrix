/**
 * App data → the v1 exam-file shape.
 *
 * This is the bridge to everything the original repository built. The PDF
 * engine, the YAML export and `scripts/build.js` all consume this one shape,
 * so a document printed from the browser and a document built from the CLI are
 * the same document — the property the old editor's parity test protected, kept
 * across the rebuild.
 *
 * Two kinds of topic come out:
 *
 *   - a topic backed by a Matrix prints as the matrix, exactly as before;
 *   - a topic with items but no matrix prints as a two-column recall table
 *     (프롬프트 → 답 / 왜), which is a perfectly good sheet and means nothing a
 *     learner captured is missing from the printout.
 */

import type {
  CellStat, ConfusionRelation, Exam, ID, Matrix, StudyItem, Subject, Topic,
} from '../../domain/models.ts';
import { slugify } from '../../domain/ids.ts';
import { isUnstable } from '../../domain/matrix.ts';
import { itemLabel } from '../../domain/item.ts';

export interface BuildExamFileInput {
  exam: Exam;
  subjects: Subject[];
  topics: Topic[];
  items: StudyItem[];
  matrices: Matrix[];
  relations?: ConfusionRelation[];
  cellStats?: CellStat[];
  /** Restrict to these items — the Exam Eve L2/L3 exports pass a subset. */
  itemIds?: Set<ID>;
  /** Appears under the title. Used to label an L2/L3 sheet. */
  subtitle?: string;
}

type Raw = Record<string, any>;

const ARCHETYPES = ['concept', 'law', 'calculation', 'it', 'language', 'procedure'];

export function buildExamFile(input: BuildExamFileInput): Raw {
  const { exam, subjects, topics, matrices } = input;
  const items = input.itemIds
    ? input.items.filter((i) => input.itemIds!.has(i.id))
    : input.items;

  const legacy = (exam.legacy ?? {}) as Raw;
  const statById = new Map((input.cellStats ?? []).map((s) => [s.id, s]));

  const examBlock: Raw = {
    name: exam.title,
    lang: 'ko',
    ...(input.subtitle ? { name_sub: input.subtitle } : exam.description ? { name_sub: exam.description } : {}),
    ...(exam.examDate ? { date: exam.examDate } : {}),
    ...(subjects.length ? { subjects: subjects.map((s) => s.title) } : {}),
  };
  // Restore anything an import parked on the exam — blueprint, pass mark, …
  for (const key of ['authority', 'syllabus_version', 'passing', 'target_score', 'what_it_tests',
    'blueprint', 'high_yield', 'weak', 'volatile', 'sources', 'last_updated', 'confidence']) {
    if (legacy[key] !== undefined) examBlock[key] = legacy[key];
  }

  const usedTopicIds = new Set<string>();
  const uniqueId = (seed: string, fallback: string): string => {
    let id = slugify(seed, fallback);
    let n = 2;
    while (usedTopicIds.has(id)) id = `${slugify(seed, fallback)}-${n++}`;
    usedTopicIds.add(id);
    return id;
  };

  const topicById = new Map(topics.map((t) => [t.id, t]));
  const itemsByTopic = new Map<string, StudyItem[]>();
  for (const it of items) {
    const key = it.topicId ?? '_loose';
    const arr = itemsByTopic.get(key);
    if (arr) arr.push(it);
    else itemsByTopic.set(key, [it]);
  }

  const outTopics: Raw[] = [];
  const matrixTopicIds = new Set<string>();

  /* ---- 1. matrices ------------------------------------------------------- */
  for (const m of matrices) {
    const cols = m.columns;
    if (!cols.length || !m.rows.length) continue;
    if (m.topicId) matrixTopicIds.add(m.topicId);

    const topicItems = m.topicId ? itemsByTopic.get(m.topicId) ?? [] : [];
    const archetype = ARCHETYPES.includes(m.archetype) ? m.archetype : 'concept';

    outTopics.push(pruneEmpty({
      id: uniqueId(m.title, 'matrix'),
      title: m.title,
      archetype,
      ...(m.note ? { why: m.note } : {}),
      one_sentence: firstConceptAnswer(topicItems),
      essentials: essentialsFrom(topicItems),
      matrix: {
        row_label: m.rowLabel || '항목',
        columns: cols.map((c) => ({ key: c.key, label_ko: c.label, mark: c.marker })),
        rows: m.rows.map((r) => ({
          label: r.label,
          ...(r.sub ? { sub: r.sub } : {}),
          cells: Object.fromEntries(
            cols.map((c) => {
              const cell = r.cells[c.id];
              if (!cell?.value) return [c.key, null];
              // A cell this learner keeps missing prints with the trap marker,
              // so the paper edition inherits the screen's diagnosis.
              const unstable = isUnstable(statById.get(`${m.id}:${r.id}:${c.id}`));
              const mark = cell.marker ?? (unstable ? 'trap' : undefined);
              return [c.key, mark || cell.note
                ? { v: cell.value, ...(mark ? { mark } : {}), ...(cell.note ? { note: cell.note } : {}) }
                : cell.value];
            }),
          ),
        })),
      },
      decisive: decisiveFrom(topicItems),
      traps: trapsFrom(topicItems),
      evidence: evidenceFrom(topicItems, m),
    }));
  }

  /* ---- 2. topics with items but no matrix -------------------------------- */
  for (const [topicId, group] of itemsByTopic) {
    if (matrixTopicIds.has(topicId)) continue;
    const printable = group.filter((i) => i.prompt && i.answer);
    if (!printable.length) continue;
    const title = topicId === '_loose'
      ? '주제 없음'
      : topicById.get(topicId)?.title ?? '주제';

    outTopics.push(pruneEmpty({
      id: uniqueId(title, 'topic'),
      title,
      archetype: 'concept',
      matrix: {
        row_label: '문제',
        columns: [
          { key: 'answer', label_ko: '답', mark: 'distinction' },
          { key: 'why', label_ko: '왜', mark: 'core' },
        ],
        rows: printable.slice(0, 60).map((i) => ({
          label: itemLabel(i, 60),
          cells: {
            answer: { v: i.answer, mark: markerFor(i) },
            why: i.rationale ?? null,
          },
        })),
      },
      traps: trapsFrom(printable),
    }));
  }

  /* ---- 3. error log and compression -------------------------------------- */
  const errorLog = items
    .filter((i) => i.lapses > 0)
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, 40)
    .map((i) => pruneEmpty({
      date: (i.lastReviewedAt ?? i.createdAt).slice(0, 10),
      question: itemLabel(i, 70),
      correct: i.answer,
      ...(i.confusionNote ? { mine: i.confusionNote.replace(/^예전에 쓴 답:\s*/, '') } : {}),
      ...(i.rationale ? { missing_distinction: i.rationale } : {}),
    }));

  const pinned = items.filter((i) => i.pinned);
  const compression = pruneEmpty({
    l2: pinned.slice(0, 40).map((i) => pruneEmpty({
      item: itemLabel(i, 40),
      detail: i.answer,
      mark: markerFor(i),
    })),
    l3: pinned.slice(0, 12).map((i) => `${itemLabel(i, 34)} → ${i.answer}`),
  });

  return pruneEmpty({
    exam: examBlock,
    topics: outTopics.length ? outTopics : [placeholderTopic()],
    error_log: errorLog,
    compression,
  });
}

/* ------------------------------------------------------------- helpers --- */

const markerFor = (i: StudyItem): string | undefined =>
  i.markers.includes('trap') ? 'trap'
    : i.markers.includes('exception') ? 'exception'
      : i.markers.includes('distinction') ? 'distinction'
        : i.markers.includes('update') ? 'update'
          : undefined;

const firstConceptAnswer = (items: StudyItem[]): string | undefined =>
  items.find((i) => i.itemType === 'concept_prompt' && /한 문장/.test(i.prompt))?.answer;

function essentialsFrom(items: StudyItem[]): string[] {
  const bullets = items.find((i) => /꼭 기억/.test(i.prompt))?.answer;
  if (bullets) {
    return bullets.split('\n').map((s) => s.replace(/^\d+\.\s*/, '').trim()).filter(Boolean).slice(0, 5);
  }
  return items
    .filter((i) => i.markers.includes('core') && i.answer)
    .slice(0, 5)
    .map((i) => `${itemLabel(i, 40)} → ${i.answer}`);
}

function decisiveFrom(items: StudyItem[]): Raw | undefined {
  const anchor = items.find((i) => i.itemType === 'comparison' && i.decisiveDistinction);
  const pairs = items
    .filter((i) => i.itemType === 'comparison' && / — .+와\(과\) 무엇이 다른가요\?/.test(i.prompt))
    .map((i) => {
      const m = /^(.+?) — (.+?)와\(과\) 무엇이 다른가요\?$/.exec(i.prompt);
      if (!m) return null;
      return pruneEmpty({ a: m[1], b: m[2], why: i.rationale, clue: i.decisiveDistinction ?? i.answer });
    })
    .filter(Boolean) as Raw[];
  if (!anchor && !pairs.length) return undefined;
  return pruneEmpty({
    ...(anchor?.decisiveDistinction ? { answer: anchor.decisiveDistinction } : {}),
    ...(pairs.length ? { pairs: dedupePairs(pairs) } : {}),
  });
}

/** A → B and B → A are one pair on paper. */
function dedupePairs(pairs: Raw[]): Raw[] {
  const seen = new Set<string>();
  const out: Raw[] = [];
  for (const p of pairs) {
    const key = [p.a, p.b].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

const trapsFrom = (items: StudyItem[]): Raw[] =>
  items
    .filter((i) => i.markers.includes('trap') || i.markers.includes('exception'))
    .slice(0, 8)
    .map((i) => pruneEmpty({
      cue: i.examinerWording ?? itemLabel(i, 70),
      exception: i.answer,
      why: i.rationale,
      source: i.source.title,
    }))
    .filter((t) => t.cue && t.exception);

function evidenceFrom(items: StudyItem[], matrix: Matrix): Raw[] {
  const byRow = new Map(matrix.rows.map((r) => [r.id, r]));
  const byCol = new Map(matrix.columns.map((c) => [c.id, c]));
  return items
    .filter((i) => i.examinerWording && i.cellRef?.matrixId === matrix.id)
    .slice(0, 12)
    .map((i) => {
      const row = byRow.get(i.cellRef!.rowId);
      const col = byCol.get(i.cellRef!.columnId);
      if (!row || !col) return null;
      return pruneEmpty({
        cell: { row: row.label, column: col.key },
        tested_as: i.examinerWording,
        ...(i.source.title ? { exam: i.source.title } : {}),
        ...(i.source.year ? { source: i.source.year } : {}),
      });
    })
    .filter(Boolean) as Raw[];
}

const placeholderTopic = (): Raw => ({
  id: 'start-here',
  title: '아직 비교표가 없습니다',
  archetype: 'concept',
  matrix: {
    row_label: '항목',
    columns: [
      { key: 'a', label_ko: '무엇인가', mark: 'core' },
      { key: 'b', label_ko: '무엇과 헷갈리나', mark: 'distinction' },
      { key: 'c', label_ko: '결정적 차이', mark: 'distinction' },
    ],
    rows: [{ label: '', cells: {} }, { label: '', cells: {} }, { label: '', cells: {} }],
  },
});

/** Drop empty strings, arrays, objects and nulls so the YAML stays readable. */
function pruneEmpty<T extends Raw>(o: T): T {
  const out: Raw = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) { if (v.length) out[k] = v; continue; }
    if (typeof v === 'object') {
      const inner = pruneEmpty(v as Raw);
      if (Object.keys(inner).length) out[k] = inner;
      continue;
    }
    out[k] = v;
  }
  return out as T;
}
