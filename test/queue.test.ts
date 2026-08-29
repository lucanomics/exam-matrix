/**
 * Queue construction: what gets picked, and in what order.
 * Both halves matter — a session of ten near-identical cards teaches pattern
 * matching rather than recall (§interleaving).
 */

import { describe, expect, it } from 'vitest';
import {
  buildQueue, countToday, placeConfusionPairs, requeueFailed, selectCandidates,
  spreadByGroup, type QueueEntry,
} from '../src/domain/review/queue.ts';
import { makeRelation } from '../src/domain/confusion.ts';
import { createItem } from '../src/domain/item.ts';
import type { ID, ReviewEvent, StudyItem } from '../src/domain/models.ts';

const NOW = new Date('2026-03-01T09:00:00Z');
const iso = (offsetDays: number) =>
  new Date(NOW.getTime() + offsetDays * 86_400_000).toISOString();

let seq = 0;
function item(p: Partial<StudyItem> = {}): StudyItem {
  seq++;
  return {
    ...createItem({
      examId: 'e', prompt: `p${seq}`, answer: `a${seq}`,
      id: `i${String(seq).padStart(3, '0')}`,
      createdAt: iso(-100 + seq),
    }),
    status: 'active',
    nextReviewAt: iso(-1),
    ...p,
  };
}

function review(itemId: ID, p: Partial<ReviewEvent> = {}): ReviewEvent {
  return {
    id: `r-${itemId}`, itemId, examId: 'e', reviewedAt: iso(-1),
    correct: true, confidence: 3, resultClass: 'confident_correct', slow: false,
    stepAfter: 2, intervalDays: 3, nextReviewAt: iso(2), mode: 'today', ...p,
  };
}

const lasts = (...rs: ReviewEvent[]) => new Map(rs.map((r) => [r.itemId, r]));

describe('selection', () => {
  it('mode "today" takes only what is actually due', () => {
    const due = item({ nextReviewAt: iso(-1) });
    const later = item({ nextReviewAt: iso(5) });
    const out = selectCandidates({
      mode: 'today', items: [due, later], lastReviews: new Map(), now: NOW,
    });
    expect(out.map((e) => e.item.id)).toEqual([due.id]);
  });

  it('other modes ignore the due date, because the learner asked for them', () => {
    const notDue = item({ nextReviewAt: iso(9), lapses: 2 });
    const out = selectCandidates({
      mode: 'wrong_only', items: [notDue], lastReviews: new Map(), now: NOW,
    });
    expect(out).toHaveLength(1);
  });

  it('"애매하게 맞은 것" picks up both unsure-correct and slow-correct', () => {
    const unsure = item();
    const slow = item();
    const clean = item();
    const out = selectCandidates({
      mode: 'unsure_correct',
      items: [unsure, slow, clean],
      lastReviews: lasts(
        review(unsure.id, { resultClass: 'unsure_correct', confidence: 2 }),
        review(slow.id, { slow: true }),
        review(clean.id),
      ),
      now: NOW,
    });
    expect(out.map((e) => e.item.id).sort()).toEqual([slow.id, unsure.id].sort());
  });

  it('hides mastered items by default and shows them when asked', () => {
    const mastered = item({ status: 'mastered' });
    const base = { mode: 'today' as const, items: [mastered], lastReviews: new Map(), now: NOW };
    expect(selectCandidates(base)).toHaveLength(0);
    expect(selectCandidates({ ...base, includeMastered: true })).toHaveLength(1);
  });

  it('never returns archived items', () => {
    expect(selectCandidates({
      mode: 'all', items: [item({ status: 'archived' })], lastReviews: new Map(), now: NOW,
    })).toHaveLength(0);
  });

  it('ranks a confident-wrong above a plain scheduled review', () => {
    const dangerous = item();
    const routine = item();
    const out = selectCandidates({
      mode: 'today',
      items: [routine, dangerous],
      lastReviews: lasts(
        review(dangerous.id, { correct: false, confidence: 4, resultClass: 'confident_wrong' }),
        review(routine.id),
      ),
      now: NOW,
    });
    expect(out[0]!.item.id).toBe(dangerous.id);
  });

  it('puts pinned items first', () => {
    const pinned = item({ pinned: true });
    const others = [item(), item(), item()];
    const out = selectCandidates({
      mode: 'today', items: [...others, pinned], lastReviews: new Map(), now: NOW,
    });
    expect(out[0]!.item.id).toBe(pinned.id);
  });

  it('is deterministic for identical input', () => {
    const items = [item(), item(), item(), item()];
    const a = selectCandidates({ mode: 'today', items, lastReviews: new Map(), now: NOW });
    const b = selectCandidates({ mode: 'today', items: items.slice().reverse(), lastReviews: new Map(), now: NOW });
    expect(a.map((e) => e.item.id)).toEqual(b.map((e) => e.item.id));
  });

  it('filters by topic and by source', () => {
    const a = item({ topicId: 't1', source: { type: 'past_paper', title: '2024 기출', year: '2024' } });
    const b = item({ topicId: 't2', source: { type: 'textbook', title: '교재' } });
    expect(selectCandidates({
      mode: 'all', items: [a, b], lastReviews: new Map(), now: NOW, filters: { topicId: 't1' },
    }).map((e) => e.item.id)).toEqual([a.id]);
    expect(selectCandidates({
      mode: 'all', items: [a, b], lastReviews: new Map(), now: NOW,
      filters: { sourceTitle: '2024 기출', sourceYear: '2024' },
    }).map((e) => e.item.id)).toEqual([a.id]);
  });
});

describe('ordering', () => {
  it('spreads a dominant group instead of running it consecutively', () => {
    const xs = ['a', 'a', 'a', 'a', 'b', 'c', 'd'];
    const out = spreadByGroup(xs.map((g, i) => ({ g, i })), (e) => e.g);
    expect(out).toHaveLength(xs.length);
    const adjacentSame = out.filter((e, i) => i > 0 && out[i - 1]!.g === e.g).length;
    // Four of seven can be arranged a·b·a·c·a·d·a — no adjacency is necessary.
    expect(adjacentSame).toBe(0);
  });

  it('degrades gracefully when one group is more than half the session', () => {
    const xs = ['a', 'a', 'a', 'a', 'a', 'b', 'c'];
    const out = spreadByGroup(xs.map((g, i) => ({ g, i })), (e) => e.g);
    const adjacentSame = out.filter((e, i) => i > 0 && out[i - 1]!.g === e.g).length;
    // Five of seven: two adjacencies are unavoidable, and no more than that.
    expect(adjacentSame).toBe(2);
    expect(out).toHaveLength(xs.length);
  });

  it('preserves every entry exactly once', () => {
    const xs = Array.from({ length: 23 }, (_, i) => ({ g: `g${i % 4}`, i }));
    const out = spreadByGroup(xs, (e) => e.g);
    expect(out.map((e) => e.i).sort((a, b) => a - b)).toEqual(xs.map((e) => e.i));
  });

  it('places a confusable pair a few cards apart — neither adjacent nor far', () => {
    const a = item();
    const b = item();
    const filler = Array.from({ length: 8 }, () => item());
    const entries: QueueEntry[] = [a, ...filler, b].map((it) => ({
      item: it, score: 1, reason: { code: 'scheduled', text: '', weight: 1 },
    }));
    const out = placeConfusionPairs(entries, [makeRelation('e', a.id, b.id)]);
    const ia = out.findIndex((e) => e.item.id === a.id);
    const ib = out.findIndex((e) => e.item.id === b.id);
    const gap = Math.abs(ia - ib);
    expect(gap).toBeGreaterThanOrEqual(2);
    expect(gap).toBeLessThanOrEqual(4);
    expect(out).toHaveLength(entries.length);
  });

  it('leaves an already well-spaced pair alone', () => {
    const a = item();
    const b = item();
    const entries: QueueEntry[] = [a, item(), item(), b].map((it) => ({
      item: it, score: 1, reason: { code: 'scheduled', text: '', weight: 1 },
    }));
    const out = placeConfusionPairs(entries, [makeRelation('e', a.id, b.id)]);
    expect(out.map((e) => e.item.id)).toEqual(entries.map((e) => e.item.id));
  });

  it('buildQueue respects the limit and returns each item once', () => {
    const items = Array.from({ length: 30 }, (_, i) => item({ topicId: `t${i % 3}` }));
    const out = buildQueue({ mode: 'today', items, lastReviews: new Map(), limit: 12, now: NOW });
    expect(out).toHaveLength(12);
    expect(new Set(out.map((e) => e.item.id)).size).toBe(12);
  });
});

describe('requeueFailed', () => {
  it('re-inserts the failed item a few cards later, in the same session', () => {
    const entries: QueueEntry[] = Array.from({ length: 6 }, () => item()).map((it) => ({
      item: it, score: 1, reason: { code: 'scheduled', text: '', weight: 1 },
    }));
    const out = requeueFailed(entries, 1, entries[1]!);
    expect(out).toHaveLength(7);
    expect(out[4]!.item.id).toBe(entries[1]!.item.id);
    expect(out[4]!.reason.text).toContain('방금 틀려서');
  });

  it('appends at the end when the session is nearly over', () => {
    const entries: QueueEntry[] = [item(), item()].map((it) => ({
      item: it, score: 1, reason: { code: 'scheduled', text: '', weight: 1 },
    }));
    const out = requeueFailed(entries, 1, entries[1]!);
    expect(out[out.length - 1]!.item.id).toBe(entries[1]!.item.id);
  });
});

describe('countToday', () => {
  it('counts the four numbers the home screen shows', () => {
    const dueOne = item({ nextReviewAt: iso(-1) });
    const later = item({ nextReviewAt: iso(4) });
    const unsure = item({ nextReviewAt: iso(-1) });
    const repeat = item({ nextReviewAt: iso(-1), lapses: 3 });
    const dangerous = item({ nextReviewAt: iso(-1) });

    const c = countToday(
      [dueOne, later, unsure, repeat, dangerous, item({ status: 'archived' })],
      lasts(
        review(unsure.id, { resultClass: 'unsure_correct', confidence: 2 }),
        review(dangerous.id, { correct: false, confidence: 4, resultClass: 'confident_wrong' }),
      ),
      NOW,
    );
    expect(c.due).toBe(4);
    expect(c.unsureCorrect).toBe(1);
    expect(c.repeatedWrong).toBe(1);
    expect(c.confidentWrong).toBe(1);
    expect(c.total).toBe(5);
  });
});
