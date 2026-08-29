/**
 * The confusion graph.
 *
 * "A is confused with B" is the product's central fact, so it is stored as its
 * own record rather than as a field on an item. That buys three things the
 * cached `confusedWithIds` array cannot: a kind (예외 / 대비 / 착각), a note,
 * and the ability to rank pairs by how often they still cost marks.
 */

import type {
  ConfusionKind, ConfusionRelation, ID, ReviewEvent, StudyItem,
} from './models.ts';
import { newId } from './ids.ts';

/**
 * Relations are undirected: aId/bId are stored sorted so a pair is unique.
 *
 * `at` exists so an importer can stamp a whole conversion with one clock —
 * without it, a migration run twice on the same file produces records that
 * differ only by a millisecond, which makes the conversion untestable.
 */
export function makeRelation(
  examId: ID, aId: ID, bId: ID, kind: ConfusionKind = 'confused_with',
  note?: string, at: Date | string = new Date(),
): ConfusionRelation {
  const [x, y] = aId < bId ? [aId, bId] : [bId, aId];
  return {
    id: newId('rel_'),
    examId,
    aId: x,
    bId: y,
    kind,
    ...(note ? { note } : {}),
    createdAt: new Date(at).toISOString(),
  };
}

export function relationKey(aId: ID, bId: ID): string {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

export function partnersOf(relations: ConfusionRelation[], itemId: ID): ID[] {
  const out: ID[] = [];
  for (const r of relations) {
    if (r.aId === itemId) out.push(r.bId);
    else if (r.bId === itemId) out.push(r.aId);
  }
  return [...new Set(out)];
}

export interface ConfusionPair {
  relation: ConfusionRelation;
  a: StudyItem;
  b: StudyItem;
  /** Combined lapses across both sides. */
  misses: number;
  /** True while either side is still getting answered wrong. */
  unresolved: boolean;
  lastMissAt?: string;
}

/**
 * Rank pairs by how much they are still costing. A pair whose two items are
 * both answered confidently and correctly has been *resolved* — that is the
 * whole objective (§Principle H), so it drops off the list rather than
 * lingering as a permanent "topic".
 */
export function rankPairs(
  relations: ConfusionRelation[],
  itemsById: Map<ID, StudyItem>,
  lastReviews: Map<ID, ReviewEvent>,
): ConfusionPair[] {
  const out: ConfusionPair[] = [];
  for (const rel of relations) {
    const a = itemsById.get(rel.aId);
    const b = itemsById.get(rel.bId);
    if (!a || !b) continue;

    const la = lastReviews.get(a.id);
    const lb = lastReviews.get(b.id);
    const misses = a.lapses + b.lapses;
    const unresolved =
      a.status !== 'mastered' || b.status !== 'mastered' ||
      la?.correct === false || lb?.correct === false;

    const lastMissAt = [
      la?.correct === false ? la.reviewedAt : undefined,
      lb?.correct === false ? lb.reviewedAt : undefined,
    ].filter(Boolean).sort().pop();

    out.push({ relation: rel, a, b, misses, unresolved, ...(lastMissAt ? { lastMissAt } : {}) });
  }

  return out.sort(
    (x, y) =>
      Number(y.unresolved) - Number(x.unresolved) ||
      y.misses - x.misses ||
      x.relation.id.localeCompare(y.relation.id),
  );
}

/**
 * Matrix suggestions (§11). Never applied automatically — the learner accepts,
 * edits or dismisses. Three signals, in descending order of how much the
 * learner has already told us:
 *
 *   1. explicit confusion relations that are not yet in any matrix;
 *   2. items sharing a topic that have each been failed at least once;
 *   3. items whose failures share a failure reason of 비슷한 개념과 혼동.
 */
export interface MatrixSuggestion {
  key: string;
  itemIds: ID[];
  labels: string[];
  topicId?: ID;
  reason: string;
  strength: number;
}

export function suggestMatrices(
  items: StudyItem[],
  relations: ConfusionRelation[],
  reviews: ReviewEvent[],
  alreadyCoveredItemIds: Set<ID>,
): MatrixSuggestion[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const suggestions = new Map<string, MatrixSuggestion>();

  const add = (ids: ID[], reason: string, strength: number, topicId?: ID) => {
    const uniq = [...new Set(ids)].filter((id) => byId.has(id)).sort();
    if (uniq.length < 2) return;
    if (uniq.every((id) => alreadyCoveredItemIds.has(id))) return;
    const key = uniq.join('|');
    const prev = suggestions.get(key);
    if (prev && prev.strength >= strength) return;
    suggestions.set(key, {
      key,
      itemIds: uniq,
      labels: uniq.map((id) => byId.get(id)!.prompt.slice(0, 40)),
      ...(topicId ? { topicId } : {}),
      reason,
      strength,
    });
  };

  // 1 — explicit relations, grouped into clusters so A-B and B-C become A-B-C.
  const clusters = connectedClusters(relations, byId);
  for (const cluster of clusters) {
    add(cluster, '헷갈린다고 직접 연결한 항목들입니다.', 100 + cluster.length);
  }

  // 2 — same topic, each already failed at least once.
  const byTopic = new Map<ID, StudyItem[]>();
  for (const it of items) {
    if (!it.topicId || it.lapses === 0) continue;
    const arr = byTopic.get(it.topicId);
    if (arr) arr.push(it);
    else byTopic.set(it.topicId, [it]);
  }
  for (const [topicId, group] of byTopic) {
    if (group.length < 2) continue;
    const top = group.sort((a, b) => b.lapses - a.lapses).slice(0, 4).map((i) => i.id);
    add(top, '같은 주제에서 반복해서 틀린 항목들입니다.', 60 + group.length, topicId);
  }

  // 3 — failures the learner themself labelled as 비슷한 개념과 혼동.
  const confusedItemIds = new Set(
    reviews.filter((r) => r.failureReason === 'confused_with_similar').map((r) => r.itemId),
  );
  const byTopicConfused = new Map<ID, ID[]>();
  for (const id of confusedItemIds) {
    const it = byId.get(id);
    if (!it?.topicId) continue;
    const arr = byTopicConfused.get(it.topicId);
    if (arr) arr.push(id);
    else byTopicConfused.set(it.topicId, [id]);
  }
  for (const [topicId, ids] of byTopicConfused) {
    add(ids, '"비슷한 개념과 혼동"으로 표시한 항목들입니다.', 80 + ids.length, topicId);
  }

  return [...suggestions.values()].sort(
    (a, b) => b.strength - a.strength || a.key.localeCompare(b.key),
  );
}

/** Union-find over the relation edges, so a chain becomes one suggestion. */
function connectedClusters(
  relations: ConfusionRelation[],
  byId: Map<ID, StudyItem>,
): ID[][] {
  const parent = new Map<ID, ID>();
  const find = (x: ID): ID => {
    const p = parent.get(x);
    if (p === undefined || p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (a: ID, b: ID) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const r of relations) {
    if (!byId.has(r.aId) || !byId.has(r.bId)) continue;
    if (!parent.has(r.aId)) parent.set(r.aId, r.aId);
    if (!parent.has(r.bId)) parent.set(r.bId, r.bId);
    union(r.aId, r.bId);
  }

  const groups = new Map<ID, ID[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    const arr = groups.get(root);
    if (arr) arr.push(id);
    else groups.set(root, [id]);
  }
  return [...groups.values()]
    .filter((g) => g.length >= 2)
    .map((g) => g.sort())
    .sort((a, b) => a[0]!.localeCompare(b[0]!));
}
