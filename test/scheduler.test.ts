/**
 * The scheduler is the one module where a quiet behaviour change would be
 * invisible in the UI and wrong for months, so its rules are pinned here as
 * statements about the product, not about the implementation.
 */

import { describe, expect, it } from 'vitest';
import {
  classifyResult, explainDue, explainNext, ladderDays, LEECH_LAPSES,
  REVIEW_LADDER, schedule, type SchedulableState,
} from '../src/domain/review/scheduler.ts';
import type { ReviewEvent } from '../src/domain/models.ts';

const state = (p: Partial<SchedulableState> = {}): SchedulableState => ({
  step: 0, streak: 0, lapses: 0, reviewCount: 0, status: 'active', ...p,
});

const NOW = new Date('2026-03-01T09:00:00Z');
const daysOut = (iso: string) =>
  Math.round((new Date(iso).getTime() - NOW.getTime()) / 86_400_000);

describe('classifyResult — the four quadrants of §23', () => {
  it('splits on confidence 3, not on correctness alone', () => {
    expect(classifyResult(true, 4)).toBe('confident_correct');
    expect(classifyResult(true, 3)).toBe('confident_correct');
    expect(classifyResult(true, 2)).toBe('unsure_correct');
    expect(classifyResult(true, 1)).toBe('unsure_correct');
    expect(classifyResult(false, 1)).toBe('unsure_wrong');
    expect(classifyResult(false, 2)).toBe('unsure_wrong');
    expect(classifyResult(false, 3)).toBe('confident_wrong');
    expect(classifyResult(false, 4)).toBe('confident_wrong');
  });
});

describe('schedule — a correct answer is not automatically progress', () => {
  it('a guessed-right answer drops the interval back to one day', () => {
    const r = schedule(state({ step: 5, streak: 3 }), { correct: true, confidence: 1 }, NOW);
    expect(r.step).toBe(1);
    expect(r.intervalDays).toBe(1);
    expect(r.resultClass).toBe('unsure_correct');
    expect(r.streak).toBe(0);
  });

  it('an unsure-correct answer never climbs past seven days, however often it repeats', () => {
    let s = state();
    for (let i = 0; i < 10; i++) {
      const r = schedule(s, { correct: true, confidence: 2 }, NOW);
      s = { step: r.step, streak: r.streak, lapses: r.lapses, reviewCount: r.reviewCount, status: r.status };
      expect(r.intervalDays).toBeLessThanOrEqual(7);
    }
    expect(s.step).toBe(3);
  });

  it('confident retrieval is the only thing that buys real distance', () => {
    const normal = schedule(state({ step: 2 }), { correct: true, confidence: 3 }, NOW);
    const strong = schedule(state({ step: 2 }), { correct: true, confidence: 4 }, NOW);
    expect(normal.step).toBe(3);
    expect(strong.step).toBe(4);
    expect(strong.intervalDays).toBeGreaterThan(normal.intervalDays);
  });

  it('caps at the top of the ladder', () => {
    const r = schedule(state({ step: 6, streak: 5 }), { correct: true, confidence: 4 }, NOW);
    expect(r.step).toBe(REVIEW_LADDER.length - 1);
    expect(r.intervalDays).toBe(60);
  });
});

describe('schedule — being slow is a form of not knowing', () => {
  it('caps a fast-typed confident answer at confidence 2 when it took too long', () => {
    const r = schedule(state({ step: 4 }), {
      correct: true, confidence: 4, responseTimeMs: 40_000, slowAnswerMs: 25_000,
    }, NOW);
    expect(r.slow).toBe(true);
    expect(r.effectiveConfidence).toBe(2);
    expect(r.intervalDays).toBe(7);
    // The learner still *said* 확실함, so the quadrant records what they claimed.
    expect(r.resultClass).toBe('confident_correct');
  });

  it('does not penalise a wrong answer for being slow', () => {
    const r = schedule(state(), { correct: false, confidence: 2, responseTimeMs: 90_000 }, NOW);
    expect(r.slow).toBe(false);
  });
});

describe('schedule — failure', () => {
  it('resets to step 0, retries in session, and counts a lapse', () => {
    const r = schedule(state({ step: 5, streak: 4, lapses: 1 }), { correct: false, confidence: 4 }, NOW);
    expect(r.step).toBe(0);
    expect(r.intervalDays).toBe(0);
    expect(r.retryInSession).toBe(true);
    expect(r.lapses).toBe(2);
    expect(r.streak).toBe(0);
    expect(r.status).toBe('active');
  });

  it('flags a leech once the lifetime lapses reach the threshold', () => {
    const r = schedule(state({ lapses: LEECH_LAPSES - 1 }), { correct: false, confidence: 2 }, NOW);
    expect(r.leech).toBe(true);
    expect(explainNext(r)).toContain(`${LEECH_LAPSES}번째 오답`);
  });

  it('a step-0 item comes back within the same day, not immediately', () => {
    const r = schedule(state(), { correct: false, confidence: 2 }, NOW);
    const gapMs = new Date(r.nextReviewAt).getTime() - NOW.getTime();
    expect(gapMs).toBeGreaterThan(0);
    expect(gapMs).toBeLessThan(86_400_000);
  });
});

describe('schedule — status transitions', () => {
  it('promotes to 안정 then 마스터, and only with a confident streak', () => {
    let s = state({ step: 4, streak: 1 });
    const a = schedule(s, { correct: true, confidence: 3 }, NOW);
    expect(a.step).toBe(5);
    expect(a.status).toBe('stable');

    s = { ...s, step: a.step, streak: a.streak, status: a.status };
    const b = schedule(s, { correct: true, confidence: 4 }, NOW);
    expect(b.step).toBe(6);
    expect(b.status).toBe('mastered');
  });

  it('never promotes on unsure-correct, no matter the step', () => {
    const r = schedule(state({ step: 6, streak: 9 }), { correct: true, confidence: 2 }, NOW);
    expect(r.streak).toBe(0);
    expect(r.status).toBe('active');
  });

  it('drops a mastered item straight back to 복습 중 on any failure', () => {
    const r = schedule(state({ step: 6, streak: 5, status: 'mastered' }), { correct: false, confidence: 3 }, NOW);
    expect(r.status).toBe('active');
  });

  it('leaves an archived item archived', () => {
    const r = schedule(state({ status: 'archived' }), { correct: true, confidence: 4 }, NOW);
    expect(r.status).toBe('archived');
  });
});

describe('nextReviewAt lands on the ladder', () => {
  it.each([[1, 1], [2, 3], [3, 7], [4, 14], [5, 30], [6, 60]])(
    'step %i is %i days out',
    (step, days) => {
      expect(ladderDays(step)).toBe(days);
      const r = schedule(state({ step: step - 1 }), { correct: true, confidence: 3 }, NOW);
      if (r.step === step) expect(daysOut(r.nextReviewAt)).toBe(days);
    },
  );
});

describe('explainDue — every due item can say why it is here', () => {
  const ev = (p: Partial<ReviewEvent>): ReviewEvent => ({
    id: 'r', itemId: 'i', examId: 'e',
    reviewedAt: new Date('2026-02-28T09:00:00Z').toISOString(),
    correct: true, confidence: 3, resultClass: 'confident_correct', slow: false,
    stepAfter: 1, intervalDays: 1, nextReviewAt: NOW.toISOString(), mode: 'today', ...p,
  });

  it('names a never-reviewed item as new', () => {
    expect(explainDue({ reviewCount: 0, lapses: 0, step: 0 }, undefined, NOW).code).toBe('new');
  });

  it('ranks a confident-wrong above an ordinary lapse', () => {
    const misconception = explainDue(
      { reviewCount: 2, lapses: 1, step: 0 },
      ev({ correct: false, confidence: 4, resultClass: 'confident_wrong' }), NOW,
    );
    const lapse = explainDue(
      { reviewCount: 2, lapses: 1, step: 0 },
      ev({ correct: false, confidence: 1, resultClass: 'unsure_wrong' }), NOW,
    );
    expect(misconception.code).toBe('misconception');
    expect(lapse.code).toBe('lapse');
    expect(misconception.weight).toBeGreaterThan(lapse.weight);
  });

  it('keeps an unsure-correct in the queue with its own explanation', () => {
    const r = explainDue({ reviewCount: 1, lapses: 0, step: 1 }, ev({ resultClass: 'unsure_correct', confidence: 2 }), NOW);
    expect(r.code).toBe('unsure_correct');
    expect(r.text).toContain('확신이 없어서');
  });

  it('explains a slow-but-correct answer as such', () => {
    const r = explainDue({ reviewCount: 1, lapses: 0, step: 1 }, ev({ slow: true }), NOW);
    expect(r.code).toBe('slow');
  });

  it('reports overdue days and weights them up', () => {
    const r = explainDue(
      { reviewCount: 3, lapses: 0, step: 3, nextReviewAt: '2026-02-26T09:00:00Z' },
      ev({ resultClass: 'confident_correct' }), NOW,
    );
    expect(r.code).toBe('overdue');
    expect(r.text).toContain('3일 밀린');
  });

  it('always returns learner-facing Korean, never a code', () => {
    const r = explainDue({ reviewCount: 5, lapses: 0, step: 4 }, ev({}), NOW);
    expect(r.text).toMatch(/[가-힣]/);
    expect(r.text).not.toMatch(/[a-z_]{4,}/);
  });
});

describe('explainNext', () => {
  it('says what happened and when it returns', () => {
    const guessed = explainNext(schedule(state({ step: 4 }), { correct: true, confidence: 1 }, NOW));
    expect(guessed).toContain('찍어서 맞힌');
    expect(guessed).toContain('1일 뒤');

    const strong = explainNext(schedule(state({ step: 1 }), { correct: true, confidence: 4 }, NOW));
    expect(strong).toContain('확신 있게');
    expect(strong).toContain('7일 뒤');
  });
});
