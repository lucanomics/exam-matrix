/**
 * 시험 전날 — the compression ladder, kept from the original system.
 *
 * L1 is everything still in play. L2 is what is worth an hour the night before.
 * L3 is the sheet you read in the last ten minutes. The system ranks; the
 * learner decides. Pinning always wins over the ranking, and a pinned item can
 * never be pushed out of L3 by an algorithm that thinks it knows better.
 */

import type { ID, ReviewEvent, StudyItem } from './models.ts';
import { daysBetween } from './time.ts';

export type Level = 'l1' | 'l2' | 'l3';

export const LEVEL_LABEL: Record<Level, string> = {
  l1: 'L1 · 전체',
  l2: 'L2 · 전날 훑기',
  l3: 'L3 · 마지막 10분',
};

export const LEVEL_HINT: Record<Level, string> = {
  l1: '아직 안정되지 않은 모든 항목',
  l2: '시험 전날 한 번 더 볼 것',
  l3: '고사장에서 마지막으로 볼 한 장',
};

/** How many items each level holds by default. L3 must stay a single sheet. */
export const LEVEL_CAP: Record<Level, number> = { l1: Infinity, l2: 40, l3: 12 };

export interface RankedItem {
  item: StudyItem;
  score: number;
  /** Why it made the cut, in the learner's words. */
  why: string;
  pinned: boolean;
}

export interface EveInput {
  items: StudyItem[];
  lastReviews: Map<ID, ReviewEvent>;
  now?: Date | string | number;
}

/**
 * Risk score. Deliberately simple and inspectable: each clause is a sentence
 * the learner can be shown, and the highest-scoring clause becomes `why`.
 */
export function rankForExam(input: EveInput): RankedItem[] {
  const now = input.now ?? new Date();
  const out: RankedItem[] = [];

  for (const item of input.items) {
    if (item.status === 'archived' || item.status === 'mastered') {
      if (!item.pinned) continue;
    }
    const last = input.lastReviews.get(item.id);
    const clauses: Array<{ w: number; why: string }> = [];

    if (item.lapses >= 3) clauses.push({ w: 90, why: `${item.lapses}번 틀린 항목` });
    else if (item.lapses === 2) clauses.push({ w: 70, why: '두 번 틀린 항목' });
    else if (item.lapses === 1) clauses.push({ w: 45, why: '한 번 틀린 항목' });

    if (last?.resultClass === 'confident_wrong') clauses.push({ w: 95, why: '확신하고 틀렸던 항목' });
    if (last?.resultClass === 'unsure_correct') clauses.push({ w: 65, why: '애매하게 맞힌 항목' });
    if (last?.slow) clauses.push({ w: 60, why: '맞혔지만 오래 걸린 항목' });

    if (item.markers.includes('trap')) clauses.push({ w: 72, why: '함정으로 표시한 항목' });
    if (item.markers.includes('exception')) clauses.push({ w: 68, why: '예외로 표시한 항목' });
    if (item.markers.includes('update')) clauses.push({ w: 58, why: '바뀔 수 있는 내용' });
    if (item.confusedWithIds.length) clauses.push({ w: 62, why: '아직 정리 안 된 헷갈리는 짝' });
    if (item.status === 'inbox') clauses.push({ w: 40, why: '아직 한 번도 안 풀어본 항목' });

    if (last && daysBetween(last.reviewedAt, now) > 14) {
      clauses.push({ w: 35, why: '2주 넘게 안 본 항목' });
    }

    if (!clauses.length && !item.pinned) continue;

    clauses.sort((a, b) => b.w - a.w);
    const top = clauses[0];
    // Sum with decay: several medium risks matter, but do not out-rank one severe one.
    const score = clauses.reduce((acc, c, i) => acc + c.w / (i + 1), 0) + (item.pinned ? 1000 : 0);

    out.push({
      item,
      score,
      why: item.pinned ? '직접 고정한 항목' : top?.why ?? '',
      pinned: !!item.pinned,
    });
  }

  return out.sort(
    (a, b) => b.score - a.score || a.item.createdAt.localeCompare(b.item.createdAt),
  );
}

export function sliceLevel(ranked: RankedItem[], level: Level): RankedItem[] {
  const cap = LEVEL_CAP[level];
  return cap === Infinity ? ranked : ranked.slice(0, cap);
}

/** Days until the sitting, or null when no date is set. */
export function daysToExam(examDate: string | undefined, now: Date | string | number = new Date()): number | null {
  if (!examDate) return null;
  const d = daysBetween(now, examDate);
  return Number.isFinite(d) ? d : null;
}
