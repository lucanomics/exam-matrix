/**
 * Global search.
 *
 * Korean does not tokenise on spaces the way English does — 자료수집방법 is one
 * word a learner will search for as 자료수집, 수집방법 or 방법 — so this is
 * substring matching over a prepared haystack rather than a word index.
 * With a few thousand items that stays comfortably under a frame; the index is
 * rebuilt only when the underlying records change.
 */

import type { ID, Matrix, StudyItem, Subject, Topic } from './models.ts';

export type SearchKind = 'item' | 'matrix' | 'topic' | 'source';

export interface SearchDoc {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  /** Lower-cased concatenation of every searchable field. */
  haystack: string;
  /** Where selecting the result should go. */
  href: string;
  refId: ID;
}

export interface SearchHit extends SearchDoc {
  score: number;
}

const norm = (s: string | undefined): string => (s ?? '').toLowerCase().trim();

export interface IndexInput {
  items: StudyItem[];
  matrices: Matrix[];
  topics: Topic[];
  subjects: Subject[];
}

export function buildIndex(input: IndexInput): SearchDoc[] {
  const topicTitle = new Map(input.topics.map((t) => [t.id, t.title]));
  const subjectTitle = new Map(input.subjects.map((s) => [s.id, s.title]));
  const docs: SearchDoc[] = [];

  for (const it of input.items) {
    const topic = it.topicId ? topicTitle.get(it.topicId) : undefined;
    const subject = it.subjectId ? subjectTitle.get(it.subjectId) : undefined;
    const src = [it.source.title, it.source.year, it.source.page, it.source.questionNumber]
      .filter(Boolean).join(' ');
    docs.push({
      id: `item:${it.id}`,
      kind: 'item',
      title: it.prompt,
      subtitle: [topic ?? subject, src].filter(Boolean).join(' · '),
      haystack: norm([
        it.prompt, it.answer, it.rationale, it.correctedStatement, it.examinerWording,
        it.decisiveDistinction, it.confusionNote, topic, subject, src, it.tags.join(' '),
      ].filter(Boolean).join('  ')),
      href: `/item/${it.id}`,
      refId: it.id,
    });
  }

  for (const m of input.matrices) {
    const cellText = m.rows
      .flatMap((r) => [r.label, r.sub, ...m.columns.map((c) => r.cells[c.id]?.value)])
      .filter(Boolean).join(' ');
    docs.push({
      id: `matrix:${m.id}`,
      kind: 'matrix',
      title: m.title,
      subtitle: `비교표 · ${m.rows.length}행 × ${m.columns.length}열`,
      haystack: norm([m.title, m.note, m.columns.map((c) => c.label).join(' '), cellText].join(' ')),
      href: `/matrix/${m.id}`,
      refId: m.id,
    });
  }

  for (const t of input.topics) {
    docs.push({
      id: `topic:${t.id}`,
      kind: 'topic',
      title: t.title,
      subtitle: t.subjectId ? subjectTitle.get(t.subjectId) ?? '주제' : '주제',
      haystack: norm(t.title),
      href: `/drill?mode=topic&topicId=${encodeURIComponent(t.id)}`,
      refId: t.id,
    });
  }

  const sources = new Map<string, { count: number; label: string }>();
  for (const it of input.items) {
    const label = [it.source.title, it.source.year].filter(Boolean).join(' ');
    if (!label) continue;
    const prev = sources.get(label);
    sources.set(label, { count: (prev?.count ?? 0) + 1, label });
  }
  for (const [label, { count }] of sources) {
    docs.push({
      id: `source:${label}`,
      kind: 'source',
      title: label,
      subtitle: `출처 · ${count}개 항목`,
      haystack: norm(label),
      href: `/sources?q=${encodeURIComponent(label)}`,
      refId: label,
    });
  }

  return docs;
}

const KIND_WEIGHT: Record<SearchKind, number> = {
  item: 1, matrix: 0.9, topic: 0.8, source: 0.7,
};

export function search(docs: SearchDoc[], query: string, limit = 30): SearchHit[] {
  const q = norm(query);
  if (q.length === 0) return [];
  // Multiple terms all have to appear; each is matched as a substring.
  const terms = q.split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];

  for (const doc of docs) {
    let score = 0;
    let ok = true;
    for (const term of terms) {
      const at = doc.haystack.indexOf(term);
      if (at < 0) { ok = false; break; }
      // Earlier and in the title counts for more.
      score += 100 - Math.min(at, 90);
      if (norm(doc.title).includes(term)) score += 60;
      if (norm(doc.title).startsWith(term)) score += 40;
    }
    if (!ok) continue;
    hits.push({ ...doc, score: score * KIND_WEIGHT[doc.kind] });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}
