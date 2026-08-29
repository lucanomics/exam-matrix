/**
 * 복습 — retrieval, then judgement, then feedback.
 *
 * The order of operations is the product, and it is enforced by the component
 * rather than by discipline:
 *
 *   1. the prompt is on screen and the answer is not in the DOM at all;
 *   2. the learner commits an answer;
 *   3. the learner commits a confidence, *before* anything is revealed;
 *   4. only then does the answer and its reasoning appear;
 *   5. a wrong or unsure result offers one tap to say what went wrong;
 *   6. the app says when this will come back, and why.
 *
 * Grading is automatic where it can be honest — O/X, and a typed answer that
 * matches — and is handed to the learner where it cannot be, since no string
 * comparison can tell whether "직접 접촉 여부" and "1차 자료인지" are the same
 * answer. The confidence is already recorded by then, so self-grading cannot
 * be flattered by seeing the answer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon.tsx';
import { MarkerTag, ResultTag } from '../../components/Tag.tsx';
import { useApp, useMutate } from '../../app/hooks.ts';
import { useCapture } from '../../app/CaptureContext.tsx';
import { buildQueue, requeueFailed, type QueueEntry } from '../../domain/review/queue.ts';
import { classifyResult, explainNext } from '../../domain/review/scheduler.ts';
import { answersMatch, isOX } from '../../domain/item.ts';
import { recordAnswer, setFailureReason } from '../../data/repo.ts';
import {
  CONFIDENCE_HINT, CONFIDENCE_LABEL, FAILURE_LABEL, FAILURE_ORDER, MODE_LABEL,
} from '../../domain/labels.ts';
import type {
  Confidence, DrillMode, FailureReason, ResultClass, StudyItem,
} from '../../domain/models.ts';

type Phase = 'answer' | 'reveal' | 'graded';

const CONFIDENCES: Confidence[] = [1, 2, 3, 4];

export function DrillScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { snapshot, settings } = useApp();
  const mutate = useMutate();
  const capture = useCapture();

  const mode = (params.get('mode') ?? 'today') as DrillMode;
  const filters = useMemo(() => ({
    ...(params.get('subjectId') ? { subjectId: params.get('subjectId')! } : {}),
    ...(params.get('topicId') ? { topicId: params.get('topicId')! } : {}),
    ...(params.get('sourceTitle') ? { sourceTitle: params.get('sourceTitle')! } : {}),
    ...(params.get('sourceYear') ? { sourceYear: params.get('sourceYear')! } : {}),
    ...(params.get('matrixId') ? { matrixId: params.get('matrixId')! } : {}),
    ...(params.get('itemIds') ? { itemIds: params.get('itemIds')!.split(',') } : {}),
  }), [params]);

  /* The queue is built once per session. Rebuilding it after every answer
     would make items jump around under the learner's hands. */
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [cursor, setCursor] = useState(0);
  const [started, setStarted] = useState(false);
  const [log, setLog] = useState<Array<{ item: StudyItem; result: ResultClass }>>([]);

  useEffect(() => {
    const built = buildQueue({
      mode,
      items: snapshot.items,
      lastReviews: snapshot.lastReviews,
      relations: snapshot.relations,
      filters,
      limit: settings.sessionSize,
      includeMastered: settings.resurfaceMastered || mode !== 'today',
    });
    setQueue(built);
    setCursor(0);
    setLog([]);
    setStarted(true);
    // Intentionally not re-running on snapshot changes: see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, JSON.stringify(filters), settings.sessionSize]);

  const entry = queue[cursor];

  const advance = useCallback((failedEntry?: QueueEntry) => {
    setQueue((q) => (failedEntry ? requeueFailed(q, cursor, failedEntry) : q));
    setCursor((c) => c + 1);
  }, [cursor]);

  if (!started) return null;

  if (!entry) {
    return <DrillSummary mode={mode} log={log} total={queue.length} />;
  }

  return (
    <Card
      key={`${entry.item.id}:${cursor}`}
      entry={entry}
      index={cursor}
      total={queue.length}
      mode={mode}
      onDone={(item, result, failed) => {
        setLog((l) => [...l, { item, result }]);
        advance(failed ? entry : undefined);
      }}
      onEdit={() => navigate(`/item/${entry.item.id}`)}
      onLink={() => capture.open({
        confusedWithId: entry.item.id,
        ...(entry.item.topicId ? { topicId: entry.item.topicId } : {}),
      })}
      mutate={mutate}
      slowAnswerMs={settings.slowAnswerMs}
    />
  );
}

/* ------------------------------------------------------------------ card - */

interface CardProps {
  entry: QueueEntry;
  index: number;
  total: number;
  mode: DrillMode;
  onDone: (item: StudyItem, result: ResultClass, failed: boolean) => void;
  onEdit: () => void;
  onLink: () => void;
  mutate: <T>(fn: () => Promise<T>) => Promise<T>;
  slowAnswerMs: number;
}

function Card({ entry, index, total, mode, onDone, onEdit, onLink, mutate }: CardProps) {
  const item = entry.item;
  const ox = isOX(item);

  const [phase, setPhase] = useState<Phase>('answer');
  const [typed, setTyped] = useState('');
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [reason, setReason] = useState<FailureReason | null>(null);
  const [nextText, setNextText] = useState('');
  const [eventId, setEventId] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  useEffect(() => {
    startedAt.current = Date.now();
    if (!ox) window.setTimeout(() => inputRef.current?.focus(), 40);
  }, [ox]);

  const autoGradable = ox || (typed.trim().length > 0 && answersMatch(typed, item.answer));

  const reveal = useCallback(() => {
    if (confidence === null || phase !== 'answer') return;
    setPhase('reveal');
    if (autoGradable) setCorrect(answersMatch(typed, item.answer));
    window.setTimeout(() => revealRef.current?.focus(), 30);
  }, [confidence, phase, autoGradable, typed, item.answer]);

  const commit = useCallback(
    async (isCorrect: boolean, failureReason: FailureReason | null) => {
      if (busy.current || confidence === null) return;
      busy.current = true;
      const responseTimeMs = Date.now() - startedAt.current;
      const res = await mutate(() =>
        recordAnswer({
          item,
          correct: isCorrect,
          confidence,
          submittedAnswer: typed.trim() || undefined,
          responseTimeMs,
          ...(failureReason ? { failureReason } : {}),
          mode,
        }));
      setNextText(explainNext(res.scheduled));
      setEventId(res.event.id);
      setCorrect(isCorrect);
      setPhase('graded');
      busy.current = false;
      return res;
    },
    [confidence, item, mutate, typed, mode],
  );

  const grade = useCallback((isCorrect: boolean) => {
    setCorrect(isCorrect);
    // A clean confident-correct needs no post-mortem; go straight through.
    if (isCorrect && (confidence ?? 0) >= 3) void commit(true, null);
    else { setPhase('graded'); void commit(isCorrect, null); }
  }, [commit, confidence]);

  const finish = useCallback(() => {
    if (correct === null || confidence === null) return;
    onDone(item, classifyResult(correct, confidence), !correct);
  }, [correct, confidence, item, onDone]);

  /* ---- keyboard ---------------------------------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement | null)?.tagName === 'TEXTAREA'
        || (e.target as HTMLElement | null)?.tagName === 'INPUT';

      if (phase === 'answer') {
        if (!inField && (e.key === 'o' || e.key === 'O' || e.key === 'ㅐ')) { setTyped('O'); e.preventDefault(); return; }
        if (!inField && (e.key === 'x' || e.key === 'X' || e.key === 'ㅌ')) { setTyped('X'); e.preventDefault(); return; }
        if (/^[1-4]$/.test(e.key) && !inField) { setConfidence(Number(e.key) as Confidence); e.preventDefault(); return; }
        if (e.key === 'Enter' && (!inField || e.metaKey || e.ctrlKey)) { e.preventDefault(); reveal(); }
        return;
      }
      if (phase === 'reveal' && correct === null) {
        if (e.key === 'o' || e.key === 'O') { e.preventDefault(); grade(true); return; }
        if (e.key === 'x' || e.key === 'X') { e.preventDefault(); grade(false); return; }
        if (e.key === 'Enter') { e.preventDefault(); grade(true); }
        return;
      }
      if (e.key === 'Enter') { e.preventDefault(); finish(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, correct, reveal, grade, finish]);

  const revealed = phase !== 'answer';
  const resultClass = correct !== null && confidence !== null ? classifyResult(correct, confidence) : null;

  return (
    <div className="drill">
      <div className="drill__bar">
        <Link to="/" className="btn btn--ghost btn--sm" aria-label="복습 그만두기">
          <Icon name="back" size={16} /> 그만
        </Link>
        <span className="drill__progress num" aria-live="off">
          {index + 1} / {total}
        </span>
        <span className="chip" style={{ pointerEvents: 'none' }}>{MODE_LABEL[mode]}</span>
        <div className="spacer" />
        <span className="progress" aria-hidden="true">
          <span className="progress__fill" style={{ width: `${(index / Math.max(total, 1)) * 100}%` }} />
        </span>
      </div>

      <article className="drill__card">
        <header className="drill__meta">
          {item.markers.map((m) => <MarkerTag key={m} marker={m} />)}
          {item.source.title ? (
            <span className="small muted">
              {[item.source.title, item.source.year, item.source.questionNumber && `${item.source.questionNumber}`]
                .filter(Boolean).join(' · ')}
            </span>
          ) : null}
          <div className="spacer" />
          <details className="whynow">
            <summary className="whynow__toggle">왜 지금 나왔나요?</summary>
            <p className="whynow__body small">{entry.reason.text}</p>
          </details>
        </header>

        <h2 className="drill__prompt">{item.prompt}</h2>

        {phase === 'answer' ? (
          <div className="stack">
            {ox ? (
              <div className="ox" role="group" aria-label="답 고르기">
                {(['O', 'X'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="ox__btn"
                    aria-pressed={typed === v}
                    onClick={() => setTyped(v)}
                  >
                    <span aria-hidden="true">{v}</span>
                    <span className="visually-hidden">{v === 'O' ? '맞다' : '아니다'}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="field">
                <label className="field__label" htmlFor="drill-answer">
                  답을 적어보세요
                  <span className="field__hint">머릿속으로만 해도 되지만, 적으면 더 정확히 채점됩니다</span>
                </label>
                <textarea
                  id="drill-answer"
                  ref={inputRef}
                  className="textarea"
                  rows={3}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="기억나는 대로"
                />
              </div>
            )}

            <fieldset className="conf">
              <legend className="field__label">얼마나 확신하나요?</legend>
              <div className="conf__row">
                {CONFIDENCES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="conf__btn"
                    aria-pressed={confidence === c}
                    onClick={() => setConfidence(c)}
                  >
                    <span className="conf__num num" aria-hidden="true">{c}</span>
                    <span className="conf__label">{CONFIDENCE_LABEL[c]}</span>
                    <span className="conf__hint">{CONFIDENCE_HINT[c]}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <button
              type="button"
              className="btn btn--primary btn--lg btn--block"
              disabled={confidence === null}
              onClick={reveal}
            >
              답 확인 <kbd className="mono drill__kbd">Enter</kbd>
            </button>
            {confidence === null ? (
              <p className="xsmall muted" style={{ textAlign: 'center' }}>
                확신도를 먼저 고르면 답이 나옵니다. 이 순서가 중요합니다.
              </p>
            ) : null}
          </div>
        ) : null}

        {revealed ? (
          <div className="reveal" ref={revealRef} tabIndex={-1}>
            {typed.trim() ? (
              <div className="reveal__mine">
                <span className="eyebrow">내가 쓴 답</span>
                <p>{typed}</p>
              </div>
            ) : null}

            <div className="reveal__answer">
              <span className="eyebrow">정답</span>
              <p className="reveal__answer-text">{item.answer}</p>
            </div>

            {item.rationale ? (
              <div className="reveal__why">
                <span className="eyebrow">왜</span>
                <p>{item.rationale}</p>
              </div>
            ) : null}

            {item.correctedStatement ? (
              <div className="reveal__why">
                <span className="eyebrow">고쳐 쓰면</span>
                <p>{item.correctedStatement}</p>
              </div>
            ) : null}

            {item.examinerWording ? (
              <div className="reveal__why">
                <span className="eyebrow">기출 표현</span>
                <p className="reveal__wording">{item.examinerWording}</p>
              </div>
            ) : null}

            {phase === 'reveal' && correct === null ? (
              <div className="stack stack--tight">
                <span className="field__label">맞혔나요?</span>
                <div className="row" style={{ gap: 'var(--s-2)' }}>
                  <button type="button" className="btn btn--lg" style={{ flex: 1 }} onClick={() => grade(true)}>
                    <Icon name="check" size={18} /> 맞음
                  </button>
                  <button type="button" className="btn btn--lg" style={{ flex: 1 }} onClick={() => grade(false)}>
                    <Icon name="cross" size={18} /> 틀림
                  </button>
                </div>
              </div>
            ) : null}

            {phase === 'graded' && resultClass ? (
              <div className="stack">
                <div className="row">
                  <ResultTag result={resultClass} />
                  <span className="small muted">{nextText}</span>
                </div>

                {(correct === false || (confidence ?? 4) <= 2) ? (
                  <fieldset className="stack stack--tight">
                    <legend className="field__label">
                      왜 그랬나요?
                      <span className="field__hint">선택 — 나중에 약점 화면에서 모아 보여줍니다</span>
                    </legend>
                    <div className="row" style={{ gap: 'var(--s-2)' }}>
                      {FAILURE_ORDER.map((r) => (
                        <button
                          key={r}
                          type="button"
                          className="chip"
                          aria-pressed={reason === r}
                          onClick={() => {
                            const next = reason === r ? null : r;
                            setReason(next);
                            // Patches the event just written — never a second one.
                            if (eventId) void mutate(() => setFailureReason(eventId, next ?? undefined));
                          }}
                        >
                          {FAILURE_LABEL[r]}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : null}

                <div className="row">
                  <button type="button" className="btn btn--sm" onClick={onEdit}>
                    <Icon name="edit" size={15} /> 고치기
                  </button>
                  <button type="button" className="btn btn--sm" onClick={onLink}>
                    <Icon name="link" size={15} /> 헷갈리는 것 연결
                  </button>
                  <div className="spacer" />
                  <button type="button" className="btn btn--primary btn--lg" onClick={finish} autoFocus>
                    다음 <kbd className="mono drill__kbd">Enter</kbd>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </article>
    </div>
  );
}

/* --------------------------------------------------------------- summary - */

function DrillSummary({
  mode, log, total,
}: { mode: DrillMode; log: Array<{ item: StudyItem; result: ResultClass }>; total: number }) {
  const counts = log.reduce<Record<string, number>>((acc, l) => {
    acc[l.result] = (acc[l.result] ?? 0) + 1;
    return acc;
  }, {});

  if (total === 0) {
    return (
      <div className="page page--narrow">
        <div className="empty">
          <p className="empty__title">지금 복습할 항목이 없습니다.</p>
          <p className="empty__body muted">
            {mode === 'today'
              ? '오늘 예정된 것을 모두 마쳤습니다. 새로 헷갈린 것이 생기면 추가해두세요.'
              : '이 조건에 맞는 항목이 아직 없습니다.'}
          </p>
          <div className="row">
            <Link to="/" className="btn btn--primary">오늘 화면으로</Link>
            <Link to="/weakness" className="btn">약점 보기</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <div className="stack">
        <div className="card">
          <h2>복습을 마쳤습니다</h2>
          <p className="muted small">{log.length}번 답했습니다.</p>
          <hr className="rule" />
          <div className="stack stack--tight">
            {(['confident_wrong', 'unsure_wrong', 'unsure_correct', 'confident_correct'] as ResultClass[])
              .filter((k) => counts[k])
              .map((k) => (
                <div className="row row--between" key={k}>
                  <ResultTag result={k} />
                  <span className="num">{counts[k]}</span>
                </div>
              ))}
          </div>
          {counts.confident_wrong ? (
            <p className="small" style={{ marginTop: 'var(--s-4)' }}>
              확신하고 틀린 것이 {counts.confident_wrong}개 있습니다. 가장 먼저 고쳐야 할 항목입니다.
            </p>
          ) : null}
        </div>
        <div className="row">
          <Link to="/" className="btn btn--primary btn--lg">오늘 화면으로</Link>
          <Link to="/drill?mode=wrong_only" className="btn btn--lg">틀린 것만 다시</Link>
          <Link to="/weakness" className="btn btn--lg">약점 보기</Link>
        </div>
      </div>
    </div>
  );
}
