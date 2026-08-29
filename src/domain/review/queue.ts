/**
 * Drill queue construction.
 *
 * Two jobs, kept apart because they are judged differently:
 *
 *   selection — *which* items deserve the learner's next twenty minutes.
 *               Ranked by why they are due (see explainDue), not by date alone.
 *
 *   ordering  — *in what order*, so the session is not ten near-identical cards
 *               in a row. Two constraints: items from one topic are spread out,
 *               and a pair the learner has explicitly marked as confusable is
 *               deliberately placed a few cards apart so the second one lands
 *               while the first is still in mind (§ interleaving).
 *
 * Deterministic. Given the same items, relations and clock, the same session
 * comes out — which is what makes it testable.
 */

import type {
  ConfusionRelation, DrillMode, MarkerKey, ReviewEvent, StudyItem, ID,
} from '../models.ts';
import { explainDue, type DueReason } from './scheduler.ts';
import { isDue } from '../time.ts';

export interface QueueEntry {
  item: StudyItem;
  reason: DueReason;
  score: number;
}

export interface QueueFilters {
  subjectId?: ID;
  topicId?: ID;
  /** Matches ItemSource.title exactly — the Sources screen passes what it lists. */
  sourceTitle?: string;
  sourceYear?: string;
  markers?: MarkerKey[];
  matrixId?: ID;
  /** Restrict to these two items and anything confusable with them. */
  itemIds?: ID[];
  tag?: string;
}

export interface QueueOptions {
  mode: DrillMode;
  items: StudyItem[];
  /** Most recent review per item id. */
  lastReviews: Map<ID, ReviewEvent>;
  relations?: ConfusionRelation[];
  filters?: QueueFilters;
  limit?: number;
  now?: Date | string | number;
  /** Let 마스터 items back in occasionally. Off by default. */
  includeMastered?: boolean;
}

const MODE_BOOST: Partial<Record<DrillMode, number>> = {
  wrong_only: 0,
  unsure_correct: 0,
  exam_eve: 0,
};

/** Does this item qualify for the requested mode, ignoring due dates? */
function matchesMode(
  item: StudyItem,
  mode: DrillMode,
  last: ReviewEvent | undefined,
): boolean {
  switch (mode) {
    case 'wrong_only':
      return item.lapses > 0 || last?.correct === false;
    case 'unsure_correct':
      return last?.resultClass === 'unsure_correct' || last?.slow === true;
    case 'traps':
      return item.markers.includes('trap') || item.intakeReason === 'wording_trap';
    case 'exceptions':
      return item.markers.includes('exception') || item.intakeReason === 'missed_exception';
    case 'exam_eve':
      return true; // ranked separately by examEve.ts; everything is eligible
    default:
      return true;
  }
}

function matchesFilters(item: StudyItem, f: QueueFilters | undefined): boolean {
  if (!f) return true;
  if (f.subjectId && item.subjectId !== f.subjectId) return false;
  if (f.topicId && item.topicId !== f.topicId) return false;
  if (f.sourceTitle && (item.source.title ?? '') !== f.sourceTitle) return false;
  if (f.sourceYear && (item.source.year ?? '') !== f.sourceYear) return false;
  if (f.matrixId && item.cellRef?.matrixId !== f.matrixId) return false;
  if (f.tag && !item.tags.includes(f.tag)) return false;
  if (f.markers?.length && !f.markers.some((m) => item.markers.includes(m))) return false;
  if (f.itemIds?.length && !f.itemIds.includes(item.id)) return false;
  return true;
}

/**
 * Extra weight from the item's own history, independent of the due reason:
 * repeated failures and dangerous misconceptions jump the line.
 */
function historyBoost(item: StudyItem, last: ReviewEvent | undefined): number {
  let b = 0;
  b += Math.min(item.lapses, 5) * 6;
  if (last?.resultClass === 'confident_wrong') b += 12;
  if (item.pinned) b += 30;
  if (item.status === 'inbox') b += 8;
  if (item.status === 'stable') b -= 10;
  if (item.status === 'mastered') b -= 25;
  return b;
}

export function selectCandidates(opts: QueueOptions): QueueEntry[] {
  const now = opts.now ?? new Date();
  const requiresDue = opts.mode === 'today';
  const out: QueueEntry[] = [];

  for (const item of opts.items) {
    if (item.status === 'archived') continue;
    if (item.status === 'mastered' && !opts.includeMastered && opts.mode !== 'exam_eve') continue;
    if (!matchesFilters(item, opts.filters)) continue;

    const last = opts.lastReviews.get(item.id);
    if (!matchesMode(item, opts.mode, last)) continue;
    if (requiresDue && !isDue(item.nextReviewAt, now)) continue;

    const reason = explainDue(item, last, now);
    const score = reason.weight + historyBoost(item, last) + (MODE_BOOST[opts.mode] ?? 0);
    out.push({ item, reason, score });
  }

  // Deterministic: score desc, then oldest-created first, then id.
  out.sort(
    (a, b) =>
      b.score - a.score ||
      a.item.createdAt.localeCompare(b.item.createdAt) ||
      a.item.id.localeCompare(b.item.id),
  );
  return out;
}

/* ------------------------------------------------------------ ordering --- */

/**
 * Round-robin over groups, largest first. Guarantees maximal separation of
 * same-group entries for any distribution, without randomness.
 */
export function spreadByGroup<T>(entries: T[], groupOf: (e: T) => string): T[] {
  if (entries.length < 3) return entries.slice();

  const groups = new Map<string, T[]>();
  for (const e of entries) {
    const k = groupOf(e);
    const arr = groups.get(k);
    if (arr) arr.push(e);
    else groups.set(k, [e]);
  }
  // Ties broken by key so the result never depends on Map insertion order.
  const buckets = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([, v]) => v);

  const out: T[] = [];
  let placed = 0;
  const total = entries.length;
  while (placed < total) {
    let movedThisPass = false;
    for (const bucket of buckets) {
      const next = bucket.shift();
      if (next === undefined) continue;
      // Avoid immediate repetition of a group when another bucket still has room.
      out.push(next);
      placed++;
      movedThisPass = true;
    }
    if (!movedThisPass) break;
    buckets.sort((a, b) => b.length - a.length);
  }
  return out;
}

const MIN_PAIR_GAP = 2;
const MAX_PAIR_GAP = 4;

/**
 * Nudge explicitly-confusable items to sit `MIN_PAIR_GAP`–`MAX_PAIR_GAP` apart.
 * Adjacent (gap 1) is too easy — the learner just compares the two screens.
 * Far apart wastes the contrast. A few cards apart is where the discrimination
 * actually has to be done from memory.
 */
export function placeConfusionPairs(
  entries: QueueEntry[],
  relations: ConfusionRelation[],
): QueueEntry[] {
  if (entries.length < 3 || relations.length === 0) return entries;

  const out = entries.slice();
  const indexOf = new Map<ID, number>();
  out.forEach((e, i) => indexOf.set(e.item.id, i));

  const pairs = relations
    .filter((r) => indexOf.has(r.aId) && indexOf.has(r.bId))
    .sort((x, y) => x.id.localeCompare(y.id));

  const moved = new Set<ID>();

  for (const rel of pairs) {
    if (moved.has(rel.aId) || moved.has(rel.bId)) continue;
    const ia = indexOf.get(rel.aId)!;
    const ib = indexOf.get(rel.bId)!;
    const first = Math.min(ia, ib);
    const second = Math.max(ia, ib);
    const gap = second - first;
    if (gap >= MIN_PAIR_GAP && gap <= MAX_PAIR_GAP) continue;

    const target = Math.min(first + MIN_PAIR_GAP, out.length - 1);
    if (target === second) continue;

    const [entry] = out.splice(second, 1);
    if (!entry) continue;
    out.splice(target, 0, entry);
    moved.add(rel.aId);
    moved.add(rel.bId);
    indexOf.clear();
    out.forEach((e, i) => indexOf.set(e.item.id, i));
  }
  return out;
}

/** Selection + ordering. This is what the Drill screen calls. */
export function buildQueue(opts: QueueOptions): QueueEntry[] {
  const limit = opts.limit ?? 20;
  const ranked = selectCandidates(opts).slice(0, limit);
  const spread = spreadByGroup(ranked, (e) => e.item.topicId ?? e.item.subjectId ?? '_');
  return placeConfusionPairs(spread, opts.relations ?? []);
}

/**
 * Re-insert an item the learner just got wrong, a few cards later in the same
 * sitting. `cursor` is the index currently being shown.
 */
export function requeueFailed(
  queue: QueueEntry[],
  cursor: number,
  entry: QueueEntry,
  gap = 3,
): QueueEntry[] {
  const out = queue.slice();
  const at = Math.min(cursor + gap, out.length);
  out.splice(at, 0, { ...entry, reason: { code: 'lapse', text: '방금 틀려서 다시 나왔습니다.', weight: 100 } });
  return out;
}

/** Counters for the Today screen. Cheap enough to run on every render. */
export interface TodayCounts {
  due: number;
  unsureCorrect: number;
  repeatedWrong: number;
  confidentWrong: number;
  inbox: number;
  total: number;
}

export function countToday(
  items: StudyItem[],
  lastReviews: Map<ID, ReviewEvent>,
  now: Date | string | number = new Date(),
): TodayCounts {
  const counts: TodayCounts = {
    due: 0, unsureCorrect: 0, repeatedWrong: 0, confidentWrong: 0, inbox: 0, total: 0,
  };
  for (const item of items) {
    if (item.status === 'archived') continue;
    counts.total++;
    if (item.status === 'inbox') counts.inbox++;
    if (item.status !== 'mastered' && isDue(item.nextReviewAt, now)) counts.due++;
    const last = lastReviews.get(item.id);
    if (last?.resultClass === 'unsure_correct' || last?.slow) counts.unsureCorrect++;
    if (last?.resultClass === 'confident_wrong') counts.confidentWrong++;
    if (item.lapses >= 2) counts.repeatedWrong++;
  }
  return counts;
}
