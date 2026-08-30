/**
 * Every string the learner reads lives here.
 *
 * Two rules, from §39:
 *   - plain Korean, the way a person would say it out loud;
 *   - no vocabulary from the developer documentation. "인출", "메타인지",
 *     "확신도 보정" are real words for real ideas, and none of them belong on
 *     a screen someone opens at 6am before an exam.
 */

import type {
  Confidence, ConfusionKind, FailureReason, IntakeReason, ItemStatus,
  ItemType, MarkerKey, ResultClass, SourceType, DrillMode,
} from './models.ts';

export const MARKER_LABEL: Record<MarkerKey, string> = {
  core: '핵심',
  distinction: '갈림',
  exception: '예외',
  trap: '함정',
  update: '바뀜',
  evidence: '근거',
};

export const MARKER_HINT: Record<MarkerKey, string> = {
  core: '그냥 알아야 하는 사실',
  distinction: '여기서 둘이 갈린다',
  exception: '원칙이 통하지 않는 곳',
  trap: '시험이 함정을 파는 곳',
  update: '바뀔 수 있는 내용',
  evidence: '출제된 표현 · 근거',
};

/** Marker order used everywhere a picker is shown. Lightest first. */
export const MARKER_ORDER: MarkerKey[] = [
  'core', 'distinction', 'exception', 'trap', 'update', 'evidence',
];

export const INTAKE_LABEL: Record<IntakeReason, string> = {
  wrong: '틀림',
  guessed_right: '찍어서 맞음',
  unsure_right: '애매하게 맞음',
  too_slow: '너무 오래 걸림',
  confused_pair: '다른 것과 헷갈림',
  missed_exception: '예외를 놓침',
  wording_trap: '선지 표현에 낚임',
  reason_unclear: '근거가 흐릿함',
  manual: '그냥 추가',
};

/** The five that appear as one-tap buttons in Quick Capture. */
export const INTAKE_QUICK: IntakeReason[] = [
  'wrong', 'guessed_right', 'unsure_right', 'too_slow', 'wording_trap',
];

export const FAILURE_LABEL: Record<FailureReason, string> = {
  did_not_know: '개념 자체를 몰랐음',
  confused_with_similar: '비슷한 개념과 혼동',
  missed_condition: '조건을 놓침',
  missed_exception: '예외를 놓침',
  fooled_by_wording: '선지 표현에 낚임',
  weak_rationale: '근거가 불분명했음',
  careless: '단순 실수',
  other: '기타',
};

export const FAILURE_ORDER: FailureReason[] = [
  'confused_with_similar', 'missed_condition', 'missed_exception',
  'fooled_by_wording', 'did_not_know', 'weak_rationale', 'careless', 'other',
];

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  1: '찍음',
  2: '애매함',
  3: '아는 것 같음',
  4: '확실함',
};

export const CONFIDENCE_HINT: Record<Confidence, string> = {
  1: '거의 모르고 골랐다',
  2: '둘 중에 헷갈렸다',
  3: '맞을 것 같다',
  4: '설명까지 할 수 있다',
};

export const RESULT_LABEL: Record<ResultClass, string> = {
  confident_correct: '확신하고 맞음',
  unsure_correct: '애매하게 맞음',
  unsure_wrong: '헷갈리다 틀림',
  confident_wrong: '확신하고 틀림',
};

export const RESULT_HINT: Record<ResultClass, string> = {
  confident_correct: '안정적인 항목',
  unsure_correct: '숨은 약점 — 다음에 틀릴 수 있습니다',
  unsure_wrong: '드러난 약점',
  confident_wrong: '위험한 착각 — 가장 먼저 고쳐야 합니다',
};

export const STATUS_LABEL: Record<ItemStatus, string> = {
  inbox: '새로 담음',
  active: '복습 중',
  stable: '안정',
  mastered: '마스터',
  archived: '보관',
};

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  short_answer: '단답',
  ox: 'O/X',
  statement_judgement: '선지 판단',
  comparison: '비교',
  fill_blank: '빈칸',
  concept_prompt: '개념 설명',
};

export const SOURCE_LABEL: Record<SourceType, string> = {
  textbook: '교재',
  past_paper: '기출',
  mock: '모의고사',
  lecture: '강의',
  handout: '유인물',
  other: '직접 입력',
};

export const SOURCE_ORDER: SourceType[] = [
  'textbook', 'past_paper', 'mock', 'lecture', 'handout', 'other',
];

export const CONFUSION_LABEL: Record<ConfusionKind, string> = {
  confused_with: '헷갈림',
  exception_to: '~의 예외',
  commonly_mistaken_for: '자주 착각함',
  contrasts_with: '대비됨',
};

export const MODE_LABEL: Record<DrillMode, string> = {
  today: '오늘 복습',
  wrong_only: '오답만',
  unsure_correct: '애매하게 맞은 것',
  traps: '함정 선지만',
  exceptions: '예외만',
  subject: '과목별',
  topic: '주제별',
  source: '출처별',
  matrix: '비교표 집중',
  confusion: '헷갈리는 짝',
  exam_eve: '시험 직전',
  all: '전체',
};
