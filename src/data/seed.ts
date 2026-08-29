/**
 * One small, realistic sample exam.
 *
 * Six items and one matrix, not sixty — the point is to demonstrate the loop
 * (틀림 · 애매하게 맞음 · 헷갈리는 짝 · O/X · 비교표 · 오늘 복습), not to fill
 * the app with plausible-looking noise. Everything is flagged `isSample` so it
 * can be told apart and removed in one action, and the exam title says so.
 *
 * The content is illustrative. It is not verified study material.
 */

import type {
  ConfusionRelation, Exam, Matrix, ReviewEvent, StudyItem, Subject, Topic,
} from '../domain/models.ts';
import { newId } from '../domain/ids.ts';
import { createItem } from '../domain/item.ts';
import { makeRelation } from '../domain/confusion.ts';
import { newColumn, newRow } from '../domain/matrix.ts';
import { addDays } from '../domain/time.ts';
import { schedule } from '../domain/review/scheduler.ts';

export interface SeedBundle {
  exam: Exam;
  subjects: Subject[];
  topics: Topic[];
  items: StudyItem[];
  relations: ConfusionRelation[];
  matrices: Matrix[];
  reviews: ReviewEvent[];
}

export const SAMPLE_TITLE = '예시 · 사회탐구 (샘플 데이터)';

export function buildSampleExam(now = new Date()): SeedBundle {
  const stamp = now.toISOString();
  const examId = newId('exam_');

  const exam: Exam = {
    id: examId,
    title: SAMPLE_TITLE,
    examDate: addDays(now, 45).toISOString().slice(0, 10),
    description: '앱을 둘러보기 위한 예시입니다. 검증된 학습 자료가 아닙니다.',
    isSample: true,
    createdAt: stamp,
    updatedAt: stamp,
  };

  const subject: Subject = { id: newId('subj_'), examId, title: '사회·문화', order: 0 };
  const topic: Topic = {
    id: newId('topic_'), examId, subjectId: subject.id, title: '자료수집방법', order: 0,
  };

  /* ---- the comparison table --------------------------------------------- */
  const cols = [
    newColumn('자료 원천', 'core'),
    newColumn('연구자–대상 직접 접촉', 'distinction'),
    newColumn('시간·장소 제약', 'distinction'),
    newColumn('주요 한계', 'exception'),
    newColumn('출제 함정', 'trap'),
  ];
  const rowLit = newRow('문헌연구법');
  const rowInt = newRow('면접법');
  const rowQ = newRow('질문지법');

  const fill = (row: ReturnType<typeof newRow>, values: string[]) => {
    cols.forEach((c, i) => {
      const v = values[i];
      if (v) row.cells[c.id] = { value: v };
    });
    return row;
  };

  fill(rowLit, [
    '이미 존재하는 2차 자료',
    '없음',
    '작다',
    '자료의 신뢰성을 연구자가 통제할 수 없다',
    '"문헌연구법이 시간·장소 제약이 크다" → 틀림',
  ]);
  fill(rowInt, [
    '대상자에게서 직접 얻는 1차 자료',
    '있음 (대면)',
    '크다',
    '표본이 적고 시간이 오래 걸린다',
    '"면접법은 다수에게 적합하다" → 틀림',
  ]);
  fill(rowQ, [
    '대상자에게서 직접 얻는 1차 자료',
    '있음 (간접)',
    '중간',
    '문맹자·무성의 응답에 취약하다',
    '"질문지법은 심층적 자료 수집에 유리하다" → 틀림',
  ]);

  const matrix: Matrix = {
    id: newId('mx_'),
    examId,
    subjectId: subject.id,
    topicId: topic.id,
    title: '자료수집방법 비교',
    rowLabel: '방법',
    archetype: 'concept',
    columns: cols,
    rows: [rowLit, rowInt, rowQ],
    note: '1차 자료인지 2차 자료인지가 거의 모든 선지를 가른다.',
    createdAt: stamp,
    updatedAt: stamp,
  };

  const base = { examId, subjectId: subject.id, topicId: topic.id, createdAt: stamp };

  /* ---- items, one per intake reason worth showing ------------------------ */
  // 1. the acceptance test from the brief: O/X, unsure-but-correct
  const oxLit = createItem({
    ...base,
    prompt: '문헌연구법은 면접법보다 시간과 장소의 제약이 큰가?',
    answer: 'X',
    rationale:
      '기존 자료를 활용하므로, 직접 대상자를 만나야 하는 면접법보다 시간·장소 제약이 작다.',
    correctedStatement: '문헌연구법은 면접법보다 시간과 장소의 제약이 작다.',
    examinerWording: '문헌연구법은 다른 자료수집방법에 비해 시간과 공간의 제약을 크게 받는다.',
    itemType: 'ox',
    intakeReason: 'unsure_right',
    markers: ['trap', 'distinction'],
    source: { type: 'past_paper', title: '기출', year: '2024', questionNumber: '17' },
    cellRef: { matrixId: matrix.id, rowId: rowLit.id, columnId: cols[2]!.id },
  });

  // 2. the partner it gets confused with
  const oxInt = createItem({
    ...base,
    prompt: '면접법은 문헌연구법과 달리 1차 자료를 수집하는 방법인가?',
    answer: 'O',
    rationale: '연구자가 연구 대상에게 직접 자료를 얻기 때문이다.',
    itemType: 'ox',
    intakeReason: 'confused_pair',
    markers: ['distinction'],
    source: { type: 'past_paper', title: '기출', year: '2024', questionNumber: '17' },
    cellRef: { matrixId: matrix.id, rowId: rowInt.id, columnId: cols[0]!.id },
  });

  // 3. short answer — got wrong outright
  const primary = createItem({
    ...base,
    prompt: '1차 자료를 수집하는 자료수집 방법을 모두 말해보세요.',
    answer: '질문지법, 면접법, 참여관찰법, 실험법',
    rationale: '연구자가 연구 대상에게 직접 자료를 얻기 때문이다.',
    itemType: 'short_answer',
    intakeReason: 'wrong',
    markers: ['core'],
    source: { type: 'textbook', title: '교재', page: '78', questionNumber: 'Q62' },
  });

  // 4. the trap wording one
  const trap = createItem({
    ...base,
    prompt: '"질문지법은 심층적인 자료를 얻는 데 유리하다" — 맞는 설명인가?',
    answer: 'X',
    rationale:
      '질문지법은 넓게·빠르게 얻는 데 유리하고, 깊이 있는 자료는 면접법·참여관찰법이 유리하다.',
    examinerWording: '질문지법은 심층적인 자료를 수집하는 데 유리하다.',
    itemType: 'statement_judgement',
    intakeReason: 'wording_trap',
    markers: ['trap'],
    source: { type: 'mock', title: '모의고사 3회', questionNumber: '12' },
    cellRef: { matrixId: matrix.id, rowId: rowQ.id, columnId: cols[4]!.id },
  });

  // 5. the discrimination prompt
  const decisive = createItem({
    ...base,
    prompt: '문헌연구법과 면접법 — 하나만 고른다면 무엇으로 구분하나요?',
    answer: '자료를 연구자가 직접 만들어내는지(1차), 이미 있는 것을 쓰는지(2차).',
    rationale: '이 축 하나로 시간·장소 제약, 신뢰성 통제 가능성이 모두 따라 결정된다.',
    itemType: 'comparison',
    intakeReason: 'confused_pair',
    markers: ['distinction'],
    decisiveDistinction: '1차 자료냐 2차 자료냐',
  });

  // 6. an exception, not yet practised
  const exception = createItem({
    ...base,
    prompt: '참여관찰법은 언제나 연구 대상의 동의를 받아야 하는가?',
    answer: '원칙은 그렇지만, 비참여·비공개 관찰이 허용되는 예외가 있다.',
    rationale: '연구 윤리에서 원칙과 예외를 나눠 묻는 자리다.',
    itemType: 'ox',
    intakeReason: 'missed_exception',
    markers: ['exception'],
    source: { type: 'lecture', title: '개념 강의 7강' },
  });

  const items = [oxLit, oxInt, primary, trap, decisive, exception];

  oxLit.confusedWithIds = [oxInt.id];
  oxInt.confusedWithIds = [oxLit.id];
  const relations = [
    makeRelation(examId, oxLit.id, oxInt.id, 'confused_with', '1차/2차 자료 구분에서 갈린다.'),
  ];

  /* ---- a little history, so Today is not empty on first run -------------- */
  const reviews: ReviewEvent[] = [];

  // 애매하게 맞음, yesterday → due again today with a visible reason
  reviews.push(fakeReview(oxLit, true, 2, addDays(now, -1), 'today', 'X'));
  applyReview(oxLit, reviews[reviews.length - 1]!);

  // 확신하고 틀림, two days ago → the dangerous quadrant
  reviews.push(fakeReview(primary, false, 4, addDays(now, -2), 'today', '질문지법, 면접법'));
  applyReview(primary, reviews[reviews.length - 1]!);
  reviews[reviews.length - 1]!.failureReason = 'did_not_know';

  // 틀림 twice → the repeated-error list
  reviews.push(fakeReview(trap, false, 2, addDays(now, -5), 'today', 'O'));
  applyReview(trap, reviews[reviews.length - 1]!);
  reviews[reviews.length - 1]!.failureReason = 'fooled_by_wording';
  reviews.push(fakeReview(trap, false, 2, addDays(now, -2), 'wrong_only', 'O'));
  applyReview(trap, reviews[reviews.length - 1]!);
  reviews[reviews.length - 1]!.failureReason = 'fooled_by_wording';

  // 확신하고 맞음 → shows the other end of the scale
  reviews.push(fakeReview(oxInt, true, 4, addDays(now, -3), 'today', 'O'));
  applyReview(oxInt, reviews[reviews.length - 1]!);

  return { exam, subjects: [subject], topics: [topic], items, relations, matrices: [matrix], reviews };
}

/* Build a review event through the real scheduler, so the sample data obeys the
 * same rules everything else does — nothing here is hand-tuned. */
function fakeReview(
  item: StudyItem,
  correct: boolean,
  confidence: 1 | 2 | 3 | 4,
  at: Date,
  mode: ReviewEvent['mode'],
  submitted: string,
): ReviewEvent {
  const r = schedule(
    { step: item.step, streak: item.streak, lapses: item.lapses, reviewCount: item.reviewCount, status: item.status },
    { correct, confidence },
    at,
  );
  return {
    id: newId('rev_'),
    itemId: item.id,
    examId: item.examId,
    reviewedAt: at.toISOString(),
    submittedAnswer: submitted,
    correct,
    confidence,
    responseTimeMs: correct ? 9_000 : 21_000,
    resultClass: r.resultClass,
    slow: r.slow,
    stepAfter: r.step,
    intervalDays: r.intervalDays,
    nextReviewAt: r.nextReviewAt,
    mode,
  };
}

function applyReview(item: StudyItem, ev: ReviewEvent): void {
  item.step = ev.stepAfter;
  item.reviewCount += 1;
  item.lastReviewedAt = ev.reviewedAt;
  item.nextReviewAt = ev.nextReviewAt;
  item.status = 'active';
  if (!ev.correct) { item.lapses += 1; item.streak = 0; }
  else if (ev.resultClass === 'confident_correct') item.streak += 1;
  else item.streak = 0;
}
