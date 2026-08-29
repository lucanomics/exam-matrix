/**
 * Quick Capture.
 *
 * The design constraint is a stopwatch: a learner who has just marked a
 * practice question should be able to record what confused them, and why, in
 * fifteen to thirty seconds — otherwise they will not do it, and an app nobody
 * puts anything into cannot help anyone.
 *
 * So: five fields visible, everything else behind 자세히. The 왜? field is
 * given real prominence because an O/X with no reason is the failure mode the
 * whole method exists to prevent. Source and topic remember what was used last,
 * because a study session is fifty questions from one place.
 *
 * Cmd/Ctrl+Enter saves and reopens for the next one, which is the shape of a
 * marking session.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../components/Modal.tsx';
import { Icon } from '../../components/Icon.tsx';
import { MarkerTag } from '../../components/Tag.tsx';
import { useToast } from '../../components/Toast.tsx';
import { useApp, useMutate } from '../../app/hooks.ts';
import { useCapture } from '../../app/CaptureContext.tsx';
import {
  INTAKE_LABEL, INTAKE_QUICK, MARKER_ORDER, SOURCE_LABEL, SOURCE_ORDER,
} from '../../domain/labels.ts';
import type {
  ID, IntakeReason, MarkerKey, SourceType, StudyItem,
} from '../../domain/models.ts';
import { createItem } from '../../domain/item.ts';
import { makeRelation } from '../../domain/confusion.ts';
import { addRelation, findOrCreateTopic, putItem } from '../../data/repo.ts';
import { itemLabel } from '../../domain/item.ts';

const LAST_KEY = 'em.capture.last';

interface Sticky {
  sourceType: SourceType;
  sourceTitle: string;
  sourceYear: string;
  topicTitle: string;
  subjectId: string;
}

const emptySticky: Sticky = {
  sourceType: 'past_paper', sourceTitle: '', sourceYear: '', topicTitle: '', subjectId: '',
};

function readSticky(): Sticky {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? { ...emptySticky, ...JSON.parse(raw) } : emptySticky;
  } catch { return emptySticky; }
}

/** Intake reason implies a marker often enough to be worth defaulting. */
const IMPLIED_MARKER: Partial<Record<IntakeReason, MarkerKey>> = {
  wording_trap: 'trap',
  missed_exception: 'exception',
  confused_pair: 'distinction',
};

export function CaptureSheet() {
  const { seed, close, isOpen } = useCapture();
  const { snapshot, activeExamId } = useApp();
  const mutate = useMutate();
  const toast = useToast();

  const [sticky, setSticky] = useState<Sticky>(readSticky);
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [rationale, setRationale] = useState('');
  const [intake, setIntake] = useState<IntakeReason>('wrong');
  const [markers, setMarkers] = useState<MarkerKey[]>([]);
  const [confusedWith, setConfusedWith] = useState<ID | ''>('');
  const [examinerWording, setExaminerWording] = useState('');
  const [page, setPage] = useState('');
  const [qNo, setQNo] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  /* Seed from wherever capture was opened (a matrix cell, a drill item, …). */
  useEffect(() => {
    if (!seed) return;
    setPrompt(seed.prompt ?? '');
    setAnswer(seed.answer ?? '');
    setConfusedWith(seed.confusedWithId ?? '');
    if (seed.sourceTitle) setSticky((s) => ({ ...s, sourceTitle: seed.sourceTitle! }));
    if (seed.topicId) {
      const t = snapshot.topics.find((x) => x.id === seed.topicId);
      if (t) setSticky((s) => ({ ...s, topicTitle: t.title }));
    }
    window.setTimeout(() => promptRef.current?.focus(), 40);
  }, [seed, snapshot.topics]);

  const topicOptions = useMemo(
    () => [...new Set(snapshot.topics.map((t) => t.title))].sort((a, b) => a.localeCompare(b, 'ko')),
    [snapshot.topics],
  );
  const sourceOptions = useMemo(
    () => [...new Set(snapshot.items.map((i) => i.source.title).filter(Boolean) as string[])]
      .sort((a, b) => a.localeCompare(b, 'ko')),
    [snapshot.items],
  );
  const confusionOptions = useMemo(
    () => snapshot.items.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200),
    [snapshot.items],
  );

  const reset = useCallback(() => {
    setPrompt(''); setAnswer(''); setRationale(''); setExaminerWording('');
    setMarkers([]); setConfusedWith(''); setQNo('');
  }, []);

  const canSave = prompt.trim().length > 0 && answer.trim().length > 0 && !!activeExamId;

  const save = useCallback(
    async (again: boolean) => {
      if (!canSave || !activeExamId || saving) return;
      setSaving(true);
      try {
        const created = await mutate(async (): Promise<StudyItem> => {
          const topic = sticky.topicTitle.trim()
            ? await findOrCreateTopic(
              activeExamId, sticky.topicTitle,
              sticky.subjectId || undefined,
            )
            : undefined;

          const implied = IMPLIED_MARKER[intake];
          const finalMarkers = markers.length
            ? markers
            : implied ? [implied] : [];

          const item = createItem({
            examId: activeExamId,
            ...(topic ? { topicId: topic.id } : {}),
            ...(sticky.subjectId ? { subjectId: sticky.subjectId } : {}),
            prompt,
            answer,
            rationale,
            examinerWording,
            intakeReason: intake,
            markers: finalMarkers,
            source: {
              type: sticky.sourceType,
              ...(sticky.sourceTitle.trim() ? { title: sticky.sourceTitle.trim() } : {}),
              ...(sticky.sourceYear.trim() ? { year: sticky.sourceYear.trim() } : {}),
              ...(page.trim() ? { page: page.trim() } : {}),
              ...(qNo.trim() ? { questionNumber: qNo.trim() } : {}),
            },
            ...(seed?.cellRef ? { cellRef: seed.cellRef } : {}),
          });
          const saved = await putItem(item);

          if (confusedWith) {
            await addRelation(makeRelation(activeExamId, saved.id, confusedWith, 'confused_with'));
          }
          return saved;
        });

        localStorage.setItem(LAST_KEY, JSON.stringify(sticky));
        toast.show(`저장했습니다 — ${itemLabel(created, 26)}`);

        if (again) { reset(); window.setTimeout(() => promptRef.current?.focus(), 30); }
        else close();
      } finally {
        setSaving(false);
      }
    },
    [canSave, activeExamId, saving, mutate, sticky, intake, markers, prompt, answer,
      rationale, examinerWording, page, qNo, seed, confusedWith, toast, reset, close],
  );

  if (!isOpen) return null;

  return (
    <Modal
      title="헷갈린 것 추가"
      onClose={close}
      wide
      footer={
        <>
          <span className="xsmall muted" style={{ marginRight: 'auto' }}>
            <kbd className="mono">⌘/Ctrl</kbd> + <kbd className="mono">Enter</kbd> 저장하고 계속
          </span>
          <button type="button" className="btn" onClick={close}>취소</button>
          <button type="button" className="btn" disabled={!canSave || saving} onClick={() => save(true)}>
            저장하고 계속
          </button>
          <button type="button" className="btn btn--primary" disabled={!canSave || saving} onClick={() => save(false)}>
            저장
          </button>
        </>
      }
    >
      <form
        className="capture"
        onSubmit={(e) => { e.preventDefault(); void save(false); }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void save(true); }
        }}
      >
        {/* ---- 출처 · 주제 : one row, both remembered ----------------------- */}
        <div className="capture__row">
          <div className="field">
            <label className="field__label" htmlFor="cap-src-type">출처</label>
            <div className="row" style={{ gap: 'var(--s-2)', flexWrap: 'nowrap' }}>
              <select
                id="cap-src-type"
                className="select"
                style={{ maxWidth: 110 }}
                value={sticky.sourceType}
                onChange={(e) => setSticky((s) => ({ ...s, sourceType: e.target.value as SourceType }))}
              >
                {SOURCE_ORDER.map((t) => <option key={t} value={t}>{SOURCE_LABEL[t]}</option>)}
              </select>
              <input
                className="input"
                aria-label="출처 이름"
                list="cap-sources"
                placeholder="예: 2024 기출"
                value={sticky.sourceTitle}
                onChange={(e) => setSticky((s) => ({ ...s, sourceTitle: e.target.value }))}
              />
              <datalist id="cap-sources">
                {sourceOptions.map((s) => <option key={s} value={s} />)}
              </datalist>
              <input
                className="input"
                aria-label="문항 번호"
                style={{ maxWidth: 92 }}
                placeholder="17번"
                value={qNo}
                onChange={(e) => setQNo(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="cap-topic">주제</label>
            <input
              id="cap-topic"
              className="input"
              list="cap-topics"
              placeholder="예: 자료수집방법"
              value={sticky.topicTitle}
              onChange={(e) => setSticky((s) => ({ ...s, topicTitle: e.target.value }))}
            />
            <datalist id="cap-topics">
              {topicOptions.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
        </div>

        {/* ---- 왜 들어왔나 -------------------------------------------------- */}
        <div className="field">
          <span className="field__label" id="cap-intake-label">
            왜 들어왔나요?
            <span className="field__hint">틀린 것만이 아니라 애매했던 것도 넣습니다</span>
          </span>
          <div className="row" role="group" aria-labelledby="cap-intake-label" style={{ gap: 'var(--s-2)' }}>
            {INTAKE_QUICK.map((r) => (
              <button
                key={r}
                type="button"
                className="chip chip--tap"
                aria-pressed={intake === r}
                onClick={() => setIntake(r)}
              >
                {INTAKE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>

        {/* ---- the three that matter --------------------------------------- */}
        <div className="field">
          <label className="field__label" htmlFor="cap-prompt">
            문제 · 헷갈린 표현
            <span className="field__hint">나중에 답 없이 이것만 보게 됩니다</span>
          </label>
          <textarea
            id="cap-prompt"
            ref={promptRef}
            className="textarea"
            rows={2}
            placeholder="예: 문헌연구법은 면접법보다 시간과 장소의 제약이 큰가?"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            required
          />
        </div>

        <div className="capture__row">
          <div className="field">
            <label className="field__label" htmlFor="cap-answer">정답</label>
            <textarea
              id="cap-answer"
              className="textarea"
              rows={2}
              style={{ minHeight: 62 }}
              placeholder="예: X"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="cap-why">
              왜?
              <span className="field__hint">이게 없으면 다음에 또 틀립니다</span>
            </label>
            <textarea
              id="cap-why"
              className="textarea"
              rows={2}
              style={{ minHeight: 62 }}
              placeholder="예: 기존 자료를 활용하므로 직접 만나야 하는 면접법보다 제약이 작다."
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
          </div>
        </div>

        {/* ---- 뭐랑 헷갈렸나 ------------------------------------------------ */}
        <div className="field">
          <label className="field__label" htmlFor="cap-confused">
            뭐랑 헷갈렸나요?
            <span className="field__hint">선택 — 연결해두면 나중에 나란히 나옵니다</span>
          </label>
          <select
            id="cap-confused"
            className="select"
            value={confusedWith}
            onChange={(e) => setConfusedWith(e.target.value)}
          >
            <option value="">연결 안 함</option>
            {confusionOptions.map((i) => (
              <option key={i.id} value={i.id}>{itemLabel(i, 60)}</option>
            ))}
          </select>
        </div>

        {/* ---- advanced ----------------------------------------------------- */}
        <button
          type="button"
          className="btn btn--ghost btn--sm capture__more"
          aria-expanded={advanced}
          onClick={() => setAdvanced((v) => !v)}
        >
          <Icon name="chevron" size={14} />
          자세히 {advanced ? '접기' : '(표시 · 기출 표현 · 쪽수)'}
        </button>

        {advanced ? (
          <div className="stack">
            <div className="field">
              <span className="field__label" id="cap-mark-label">표시</span>
              <div className="row" role="group" aria-labelledby="cap-mark-label" style={{ gap: 'var(--s-2)' }}>
                {MARKER_ORDER.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="chip"
                    aria-pressed={markers.includes(m)}
                    onClick={() => setMarkers((prev) =>
                      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m])}
                  >
                    <MarkerTag marker={m} title />
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="cap-wording">
                기출 표현
                <span className="field__hint">출제자가 쓴 문장 그대로</span>
              </label>
              <textarea
                id="cap-wording"
                className="textarea"
                rows={2}
                value={examinerWording}
                onChange={(e) => setExaminerWording(e.target.value)}
              />
            </div>
            <div className="capture__row">
              <div className="field">
                <label className="field__label" htmlFor="cap-page">쪽수</label>
                <input id="cap-page" className="input" value={page} onChange={(e) => setPage(e.target.value)} />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="cap-year">연도</label>
                <input
                  id="cap-year"
                  className="input"
                  placeholder="2024"
                  value={sticky.sourceYear}
                  onChange={(e) => setSticky((s) => ({ ...s, sourceYear: e.target.value }))}
                />
              </div>
              {snapshot.subjects.length ? (
                <div className="field">
                  <label className="field__label" htmlFor="cap-subject">과목</label>
                  <select
                    id="cap-subject"
                    className="select"
                    value={sticky.subjectId}
                    onChange={(e) => setSticky((s) => ({ ...s, subjectId: e.target.value }))}
                  >
                    <option value="">지정 안 함</option>
                    {snapshot.subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
