/**
 * The review scheduler. One module, deterministic, and able to explain itself.
 *
 * This is not a spaced-repetition algorithm with opinions. It is a ladder of
 * six intervals plus a small number of rules about how a given answer moves an
 * item up or down that ladder. The learner is allowed to know all of them —
 * `explainDue()` renders the rule that put an item in front of them today, and
 * `explainNext()` renders the rule that decided when it comes back.
 *
 * The two rules that matter most, and that separate this from a flashcard app:
 *
 *   1. **Correctness is not mastery.** A correct answer given at confidence 1
 *      ("찍음") resets the item to a one-day interval. A correct answer at
 *      confidence 2 ("애매함") may not climb past 7 days no matter how many
 *      times it is repeated. Only confident retrieval buys distance.
 *
 *   2. **Being slow is a form of not knowing.** A correct answer that took
 *      longer than `slowAnswerMs` is capped at confidence 2, because in an exam
 *      it would have cost the time it did not have.
 *
 * Nothing here reads or writes storage; callers apply the returned patch.
 */

import type {
  Confidence, ItemStatus, ResultClass, ReviewEvent, StudyItem,
} from '../models.ts';
import { addDays, daysBetween, DAY_MS } from '../time.ts';

/**
 * Step 0 is "오늘 다시" — the item failed and has not yet been re-earned.
 * The rest is the conventional 1/3/7/14/30/60 ladder.
 */
export const REVIEW_LADDER = [0, 1, 3, 7, 14, 30, 60] as const;
export const MAX_STEP = REVIEW_LADDER.length - 1;

/** Above this many total wrong answers an item is treated as needing a rewrite. */
export const LEECH_LAPSES = 4;

/** An unsure-but-correct answer cannot climb past this step (7 days). */
const UNSURE_CEILING = 3;

/** Promotion thresholds. Both require the step *and* the streak. */
const STABLE_STEP = 5;
const STABLE_STREAK = 2;
const MASTERED_STEP = 6;
const MASTERED_STREAK = 3;

export const DEFAULT_SLOW_ANSWER_MS = 25_000;

export function ladderDays(step: number): number {
  const i = Math.max(0, Math.min(MAX_STEP, Math.round(step)));
  return REVIEW_LADDER[i] as number;
}

/* ------------------------------------------------------------- classify -- */

/** §23's four quadrants. Confidence 3-4 counts as "confident". */
export function classifyResult(correct: boolean, confidence: Confidence): ResultClass {
  const confident = confidence >= 3;
  if (correct) return confident ? 'confident_correct' : 'unsure_correct';
  return confident ? 'confident_wrong' : 'unsure_wrong';
}

export interface GradeInput {
  correct: boolean;
  confidence: Confidence;
  responseTimeMs?: number;
  slowAnswerMs?: number;
}

/** The item fields the scheduler reads. Keeps it testable without a whole item. */
export interface SchedulableState {
  step: number;
  streak: number;
  lapses: number;
  reviewCount: number;
  status: ItemStatus;
}

export interface ScheduleResult {
  resultClass: ResultClass;
  /** Correct, but slower than the threshold — treated as confidence 2. */
  slow: boolean;
  /** The confidence actually used after the slowness cap. */
  effectiveConfidence: Confidence;
  step: number;
  intervalDays: number;
  nextReviewAt: string;
  /** Wrong answers come back before the session ends. */
  retryInSession: boolean;
  /** Four or more lifetime lapses: the item itself is probably the problem. */
  leech: boolean;
  streak: number;
  lapses: number;
  reviewCount: number;
  status: ItemStatus;
  /** Machine-readable rule id, for the UI to render in the learner's words. */
  rule: ScheduleRule;
}

export type ScheduleRule =
  | 'wrong'
  | 'guessed_right'
  | 'unsure_correct'
  | 'correct'
  | 'confident_correct'
  | 'slow_correct';

/**
 * Grade one retrieval and decide when the item comes back.
 * Pure: same inputs, same output, always.
 */
export function schedule(
  state: SchedulableState,
  input: GradeInput,
  now: Date | string | number = new Date(),
): ScheduleResult {
  const slowThreshold = input.slowAnswerMs ?? DEFAULT_SLOW_ANSWER_MS;
  const slow =
    input.correct &&
    typeof input.responseTimeMs === 'number' &&
    input.responseTimeMs > slowThreshold;

  // Being slow is being unsure. Cap, never raise.
  const effectiveConfidence = (slow
    ? Math.min(input.confidence, 2)
    : input.confidence) as Confidence;

  const resultClass = classifyResult(input.correct, input.confidence);

  const step0 = Math.max(0, Math.min(MAX_STEP, state.step));
  let step: number;
  let rule: ScheduleRule;
  let lapses = state.lapses;
  let streak = state.streak;

  if (!input.correct) {
    lapses += 1;
    streak = 0;
    step = 0;
    rule = 'wrong';
  } else {
    switch (effectiveConfidence) {
      case 1:
        // 찍어서 맞음. Correct by luck is not knowledge; back to one day.
        step = 1;
        rule = 'guessed_right';
        break;
      case 2:
        // 애매하게 맞음 — grows, but never past a week until it is confident.
        step = Math.min(step0 + 1, UNSURE_CEILING);
        rule = slow ? 'slow_correct' : 'unsure_correct';
        break;
      case 3:
        step = Math.min(step0 + 1, MAX_STEP);
        rule = 'correct';
        break;
      default:
        step = Math.min(step0 + 2, MAX_STEP);
        rule = 'confident_correct';
        break;
    }
    streak = resultClass === 'confident_correct' ? state.streak + 1 : 0;
  }

  const leech = lapses >= LEECH_LAPSES;
  const intervalDays = ladderDays(step);
  const base = new Date(now);
  // Step 0 means "again today": ten minutes out, so it lands later in the same
  // sitting rather than immediately after the card it just failed.
  const nextReviewAt =
    intervalDays === 0
      ? new Date(base.getTime() + 10 * 60_000).toISOString()
      : addDays(base, intervalDays).toISOString();

  return {
    resultClass,
    slow,
    effectiveConfidence,
    step,
    intervalDays,
    nextReviewAt,
    retryInSession: !input.correct,
    leech,
    streak,
    lapses,
    reviewCount: state.reviewCount + 1,
    status: nextStatus(state.status, input.correct, step, streak),
    rule,
  };
}

/**
 * 마스터 never means deleted (§15) — it means "stops appearing by default".
 * Any wrong answer drops the item straight back to 복습 중.
 */
function nextStatus(
  current: ItemStatus,
  correct: boolean,
  step: number,
  streak: number,
): ItemStatus {
  if (current === 'archived') return 'archived';
  if (!correct) return 'active';
  if (step >= MASTERED_STEP && streak >= MASTERED_STREAK) return 'mastered';
  if (step >= STABLE_STEP && streak >= STABLE_STREAK) return 'stable';
  return 'active';
}

/* ------------------------------------------------------------- explain --- */

export interface DueReason {
  code:
    | 'new'
    | 'lapse'
    | 'misconception'
    | 'unsure_correct'
    | 'slow'
    | 'leech'
    | 'overdue'
    | 'scheduled';
  /** Learner-facing Korean. Plain words, no jargon. */
  text: string;
  /** Ranking weight for the drill queue. Higher comes first. */
  weight: number;
}

/**
 * "왜 지금 나왔나요?" — answerable for every item in the queue.
 * Takes the item and its most recent review (if any).
 */
export function explainDue(
  item: Pick<StudyItem, 'nextReviewAt' | 'lapses' | 'reviewCount' | 'step'>,
  last: Pick<ReviewEvent, 'resultClass' | 'slow' | 'reviewedAt'> | undefined,
  now: Date | string | number = new Date(),
): DueReason {
  if (!last || item.reviewCount === 0) {
    return { code: 'new', text: '아직 한 번도 풀어보지 않은 항목입니다.', weight: 40 };
  }

  const when = daysBetween(last.reviewedAt, now);
  const ago = when === 0 ? '오늘' : when === 1 ? '어제' : `${when}일 전`;

  if (item.lapses >= LEECH_LAPSES) {
    return {
      code: 'leech',
      text: `${item.lapses}번 틀린 항목입니다. 문장을 더 작게 쪼개보세요.`,
      weight: 100,
    };
  }
  if (last.resultClass === 'confident_wrong') {
    return {
      code: 'misconception',
      text: `${ago} 확신하고 틀렸던 항목이라 빨리 다시 나왔습니다.`,
      weight: 95,
    };
  }
  if (last.resultClass === 'unsure_wrong') {
    return { code: 'lapse', text: `${ago} 틀려서 다시 나왔습니다.`, weight: 85 };
  }
  if (last.slow) {
    return {
      code: 'slow',
      text: `${ago} 맞혔지만 시간이 오래 걸려서 다시 나왔습니다.`,
      weight: 70,
    };
  }
  if (last.resultClass === 'unsure_correct') {
    return {
      code: 'unsure_correct',
      text: `${ago} 맞혔지만 확신이 없어서 다시 나왔습니다.`,
      weight: 75,
    };
  }

  const overdueBy = item.nextReviewAt ? -daysBetween(now, item.nextReviewAt) : 0;
  if (overdueBy > 0) {
    return {
      code: 'overdue',
      text: `${overdueBy}일 밀린 복습입니다.`,
      weight: 55 + Math.min(overdueBy, 20),
    };
  }
  return {
    code: 'scheduled',
    text: `${ladderDays(item.step)}일 간격으로 예정된 복습입니다.`,
    weight: 50,
  };
}

/** "확신 있게 맞혀서 다음은 14일 뒤입니다." — shown right after feedback. */
export function explainNext(r: ScheduleResult): string {
  const when = r.intervalDays === 0 ? '오늘 안에' : `${r.intervalDays}일 뒤`;
  switch (r.rule) {
    case 'wrong':
      return r.leech
        ? `${r.lapses}번째 오답입니다. 이번 복습 안에서 한 번 더 나오고, 그다음은 ${when}입니다.`
        : `틀렸으니 이번 복습 안에서 한 번 더 나오고, 그다음은 ${when}입니다.`;
    case 'guessed_right':
      return `찍어서 맞힌 것은 아는 게 아니라서 ${when} 다시 나옵니다.`;
    case 'slow_correct':
      return `맞혔지만 오래 걸려서 애매하게 맞힌 것으로 봅니다. ${when} 다시 나옵니다.`;
    case 'unsure_correct':
      return `애매하게 맞혔으니 간격을 조금만 늘렸습니다. ${when} 다시 나옵니다.`;
    case 'confident_correct':
      return `확신 있게 맞혀서 간격을 크게 늘렸습니다. ${when} 다시 나옵니다.`;
    default:
      return `맞혔으니 ${when} 다시 나옵니다.`;
  }
}

/** For the settings screen and the docs: the ladder, in the learner's words. */
export function ladderDescription(): Array<{ step: number; label: string }> {
  return REVIEW_LADDER.map((d, i) => ({
    step: i,
    label: d === 0 ? '오늘 다시' : `${d}일`,
  }));
}

/** Milliseconds until an item is due. Negative means overdue. */
export function msUntilDue(item: Pick<StudyItem, 'nextReviewAt'>, now: Date | number = new Date()): number {
  if (!item.nextReviewAt) return -DAY_MS;
  return new Date(item.nextReviewAt).getTime() - new Date(now).getTime();
}
