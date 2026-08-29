/**
 * Diagnostics that change behaviour.
 *
 * The bar for including a number here (§Weakness) is: could a learner read it
 * and do something different in the next twenty minutes? Streaks, XP and
 * "studied 72% harder" fail that test and are absent by design.
 */

import type {
  ConfusionRelation, FailureReason, ID, ResultClass, ReviewEvent, StudyItem, Subject, Topic,
} from './models.ts';
import { daysBetween } from './time.ts';
import { rankPairs, type ConfusionPair } from './confusion.ts';

export interface QuadrantCounts {
  confident_correct: number;
  unsure_correct: number;
  unsure_wrong: number;
  confident_wrong: number;
}

export interface TopicWeakness {
  topicId?: ID;
  title: string;
  attempts: number;
  misses: number;
  accuracy: number;
  items: number;
}

export interface FailureBreakdown {
  reason: FailureReason;
  count: number;
  share: number;
}

export interface CalibrationRow {
  /** 확신도 1-4 */
  confidence: 1 | 2 | 3 | 4;
  attempts: number;
  correct: number;
  accuracy: number;
}

export interface WeaknessReport {
  quadrants: QuadrantCounts;
  /** Answered confidently and still wrong. The dangerous list. */
  misconceptions: StudyItem[];
  /** Correct but unsure or slow: the weakness that looks like a success. */
  hiddenWeakness: StudyItem[];
  /** Two or more lifetime lapses. */
  repeatedlyWrong: StudyItem[];
  /** Promoted to 안정/마스터 in the last fortnight — the shrinking review set. */
  recentlyStabilised: StudyItem[];
  unresolvedPairs: ConfusionPair[];
  worstTopics: TopicWeakness[];
  failureReasons: FailureBreakdown[];
  calibration: CalibrationRow[];
  backlog: number;
  totalActive: number;
}

export interface WeaknessInput {
  items: StudyItem[];
  reviews: ReviewEvent[];
  lastReviews: Map<ID, ReviewEvent>;
  relations: ConfusionRelation[];
  topics: Topic[];
  subjects: Subject[];
  now?: Date | string | number;
}

const RECENT_DAYS = 14;

export function buildWeaknessReport(input: WeaknessInput): WeaknessReport {
  const now = input.now ?? new Date();
  const itemsById = new Map(input.items.map((i) => [i.id, i]));
  const live = input.items.filter((i) => i.status !== 'archived');

  const quadrants: QuadrantCounts = {
    confident_correct: 0, unsure_correct: 0, unsure_wrong: 0, confident_wrong: 0,
  };
  for (const r of input.reviews) quadrants[r.resultClass]++;

  const misconceptions = live
    .filter((i) => input.lastReviews.get(i.id)?.resultClass === 'confident_wrong')
    .sort(byRecentReview(input.lastReviews));

  const hiddenWeakness = live
    .filter((i) => {
      const last = input.lastReviews.get(i.id);
      return !!last && (last.resultClass === 'unsure_correct' || last.slow);
    })
    .sort(byRecentReview(input.lastReviews));

  const repeatedlyWrong = live
    .filter((i) => i.lapses >= 2)
    .sort((a, b) => b.lapses - a.lapses || a.prompt.localeCompare(b.prompt));

  const recentlyStabilised = live
    .filter(
      (i) =>
        (i.status === 'stable' || i.status === 'mastered') &&
        !!i.lastReviewedAt &&
        daysBetween(i.lastReviewedAt, now) <= RECENT_DAYS,
    )
    .sort(byRecentReview(input.lastReviews));

  /* ---- per-topic accuracy ------------------------------------------------ */
  const topicTitle = new Map<ID, string>(input.topics.map((t) => [t.id, t.title]));
  const subjectTitle = new Map<ID, string>(input.subjects.map((s) => [s.id, s.title]));
  const buckets = new Map<string, TopicWeakness>();

  const bucketFor = (item: StudyItem): TopicWeakness => {
    const key = item.topicId ?? item.subjectId ?? '_none';
    let b = buckets.get(key);
    if (!b) {
      const title = item.topicId
        ? topicTitle.get(item.topicId) ?? '(삭제된 주제)'
        : item.subjectId
          ? subjectTitle.get(item.subjectId) ?? '(삭제된 과목)'
          : '주제 없음';
      b = {
        ...(item.topicId ? { topicId: item.topicId } : {}),
        title, attempts: 0, misses: 0, accuracy: 1, items: 0,
      };
      buckets.set(key, b);
    }
    return b;
  };

  for (const item of live) bucketFor(item).items++;
  for (const r of input.reviews) {
    const item = itemsById.get(r.itemId);
    if (!item || item.status === 'archived') continue;
    const b = bucketFor(item);
    b.attempts++;
    if (!r.correct) b.misses++;
  }
  const worstTopics = [...buckets.values()]
    .map((b) => ({ ...b, accuracy: b.attempts ? (b.attempts - b.misses) / b.attempts : 1 }))
    .filter((b) => b.attempts >= 2)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
    .slice(0, 8);

  /* ---- failure reasons --------------------------------------------------- */
  const reasonCounts = new Map<FailureReason, number>();
  let reasonTotal = 0;
  for (const r of input.reviews) {
    if (!r.failureReason) continue;
    reasonCounts.set(r.failureReason, (reasonCounts.get(r.failureReason) ?? 0) + 1);
    reasonTotal++;
  }
  const failureReasons: FailureBreakdown[] = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count, share: reasonTotal ? count / reasonTotal : 0 }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

  /* ---- calibration ------------------------------------------------------- */
  const calibration: CalibrationRow[] = ([1, 2, 3, 4] as const).map((confidence) => {
    const rows = input.reviews.filter((r) => r.confidence === confidence);
    const correct = rows.filter((r) => r.correct).length;
    return {
      confidence,
      attempts: rows.length,
      correct,
      accuracy: rows.length ? correct / rows.length : 0,
    };
  });

  const unresolvedPairs = rankPairs(input.relations, itemsById, input.lastReviews)
    .filter((p) => p.unresolved)
    .slice(0, 12);

  const backlog = live.filter(
    (i) => i.status !== 'mastered' && !!i.nextReviewAt && new Date(i.nextReviewAt) <= new Date(now),
  ).length;

  return {
    quadrants,
    misconceptions,
    hiddenWeakness,
    repeatedlyWrong,
    recentlyStabilised,
    unresolvedPairs,
    worstTopics,
    failureReasons,
    calibration,
    backlog,
    totalActive: live.length,
  };
}

function byRecentReview(last: Map<ID, ReviewEvent>) {
  return (a: StudyItem, b: StudyItem) =>
    (last.get(b.id)?.reviewedAt ?? '').localeCompare(last.get(a.id)?.reviewedAt ?? '');
}

/** Copy for the four-quadrant grid. Ordered worst-first, because that is the point. */
export const QUADRANT_ORDER: ResultClass[] = [
  'confident_wrong', 'unsure_wrong', 'unsure_correct', 'confident_correct',
];
