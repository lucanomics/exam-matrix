/**
 * First run.
 *
 * Four steps, and the fourth is a real review of the item just created (§9).
 * Explaining the product with slides would teach nothing; performing the loop
 * once teaches all of it — capture, hide, retrieve, judge, reveal.
 */

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.tsx';
import { useApp, useMutate } from '../../app/hooks.ts';
import { store } from '../../data/store.ts';
import { createExam, putItem, putSubject, findOrCreateTopic, importPayload } from '../../data/repo.ts';
import { createItem } from '../../domain/item.ts';
import { newId } from '../../domain/ids.ts';
import { buildSampleExam } from '../../data/seed.ts';
import { CONFIDENCE_HINT, CONFIDENCE_LABEL } from '../../domain/labels.ts';
import type { Confidence, ID, StudyItem } from '../../domain/models.ts';
import { recordAnswer } from '../../data/repo.ts';
import { explainNext } from '../../domain/review/scheduler.ts';
import { schedule } from '../../domain/review/scheduler.ts';

const STEPS = ['시험 만들기', '과목 정하기', '헷갈린 것 하나', '한 번 풀어보기'] as const;

export function Onboarding() {
  const navigate = useNavigate();
  const mutate = useMutate();
  const { settings } = useApp();

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [subjectText, setSubjectText] = useState('');
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [why, setWhy] = useState('');
  const [examId, setExamId] = useState<ID | null>(null);
  const [item, setItem] = useState<StudyItem | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = useCallback(async () => {
    await store.updateSettings({ ...settings, onboarded: true });
    await store.refresh();
    navigate('/');
  }, [navigate, settings]);

  const loadSample = useCallback(async () => {
    setBusy(true);
    const s = buildSampleExam();
    await mutate(() => importPayload({
      format: 'exam-matrix-backup', schemaVersion: 2, exportedAt: new Date().toISOString(),
      exams: [s.exam], subjects: s.subjects, topics: s.topics, items: s.items,
      relations: s.relations, matrices: s.matrices, reviews: s.reviews, cellStats: [],
    }, 'merge'));
    await store.selectExam(s.exam.id);
    await store.updateSettings({ onboarded: true });
    navigate('/');
  }, [mutate, navigate]);

  const createTheExam = useCallback(async () => {
    if (!title.trim()) return;
    setBusy(true);
    const exam = await mutate(() => createExam({
      title: title.trim(),
      ...(date ? { examDate: date } : {}),
    }));
    setExamId(exam.id);
    await store.selectExam(exam.id);
    setBusy(false);
    setStep(1);
  }, [title, date, mutate]);

  const saveSubjects = useCallback(async () => {
    if (!examId) return;
    setBusy(true);
    const names = subjectText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    await mutate(async () => {
      for (const [i, name] of names.entries()) {
        await putSubject({ id: newId('subj_'), examId, title: name, order: i });
      }
    });
    setBusy(false);
    setStep(2);
  }, [examId, subjectText, mutate]);

  const saveItem = useCallback(async () => {
    if (!examId || !prompt.trim() || !answer.trim()) return;
    setBusy(true);
    const saved = await mutate(async () => {
      const topic = await findOrCreateTopic(examId, '첫 주제');
      return putItem(createItem({
        examId, topicId: topic.id,
        prompt, answer, rationale: why,
        intakeReason: 'unsure_right',
        source: { type: 'other' },
      }));
    });
    setItem(saved);
    setBusy(false);
    setStep(3);
  }, [examId, prompt, answer, why, mutate]);

  return (
    <div className="onboard">
      <div className="onboard__card">
        <ol className="onboard__steps" aria-label="진행 단계">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? 'step' : undefined} className={i <= step ? 'is-done' : ''}>
              <span className="onboard__dot num" aria-hidden="true">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <div className="stack">
            <div>
              <h2>무슨 시험을 준비하세요?</h2>
              <p className="muted small">나중에 바꿀 수 있습니다.</p>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="ob-title">시험 이름</label>
              <input
                id="ob-title" className="input" autoFocus
                placeholder="예: 관광통역안내사 1차"
                value={title} onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="ob-date">
                시험 날짜 <span className="field__hint">선택 — 넣으면 남은 날짜가 보입니다</span>
              </label>
              <input id="ob-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="row">
              <button type="button" className="btn btn--primary btn--lg" disabled={!title.trim() || busy} onClick={createTheExam}>
                다음 <Icon name="chevron" size={16} />
              </button>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={loadSample}>
                예시부터 둘러보기
              </button>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="stack">
            <div>
              <h2>과목이 나뉘어 있나요?</h2>
              <p className="muted small">한 줄에 하나씩. 없으면 그냥 넘어가세요.</p>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="ob-subjects">과목</label>
              <textarea
                id="ob-subjects" className="textarea" rows={4} autoFocus
                placeholder={'관광국사\n관광자원해설\n관광법규\n관광학개론'}
                value={subjectText} onChange={(e) => setSubjectText(e.target.value)}
              />
            </div>
            <div className="row">
              <button type="button" className="btn btn--primary btn--lg" disabled={busy} onClick={saveSubjects}>
                다음 <Icon name="chevron" size={16} />
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setStep(2)}>건너뛰기</button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="stack">
            <div>
              <h2>최근에 헷갈렸던 것 하나만 적어보세요</h2>
              <p className="muted small">
                틀린 것도 좋고, 찍어서 맞았거나 애매했던 것도 좋습니다. 그게 이 앱이 다루는 재료입니다.
              </p>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="ob-prompt">문제 · 헷갈린 표현</label>
              <textarea
                id="ob-prompt" className="textarea" rows={2} autoFocus
                placeholder="예: 문헌연구법은 면접법보다 시간과 장소의 제약이 큰가?"
                value={prompt} onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="ob-answer">정답</label>
              <input id="ob-answer" className="input" placeholder="예: X" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="ob-why">왜?</label>
              <textarea
                id="ob-why" className="textarea" rows={2}
                placeholder="예: 기존 자료를 활용하므로 직접 만나야 하는 면접법보다 제약이 작다."
                value={why} onChange={(e) => setWhy(e.target.value)}
              />
            </div>
            <button
              type="button" className="btn btn--primary btn--lg"
              disabled={!prompt.trim() || !answer.trim() || busy} onClick={saveItem}
            >
              저장하고 바로 풀어보기 <Icon name="chevron" size={16} />
            </button>
          </div>
        ) : null}

        {step === 3 && item ? <FirstReview item={item} onDone={finish} /> : null}
      </div>
    </div>
  );
}

/**
 * The fourth step. Deliberately the real thing: the answer is hidden, the
 * confidence comes first, and the scheduler decides when it comes back.
 */
function FirstReview({ item, onDone }: { item: StudyItem; onDone: () => void }) {
  const mutate = useMutate();
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const grade = useCallback(async (correct: boolean) => {
    if (confidence === null) return;
    const res = await mutate(() => recordAnswer({ item, correct, confidence, submittedAnswer: typed, mode: 'today' }));
    setDone(explainNext(res.scheduled));
  }, [confidence, item, mutate, typed]);

  const preview = confidence
    ? explainNext(schedule({ step: 0, streak: 0, lapses: 0, reviewCount: 0, status: 'inbox' }, { correct: true, confidence }))
    : '';

  return (
    <div className="stack">
      <div>
        <h2>이제 답을 가리고 한 번 해봅니다</h2>
        <p className="muted small">이 순서가 이 앱의 전부입니다. 답은 확신도를 고른 뒤에 나옵니다.</p>
      </div>

      <p className="drill__prompt" style={{ fontSize: 'var(--fs-lg)' }}>{item.prompt}</p>

      {!revealed ? (
        <div className="stack">
          <div className="field">
            <label className="field__label" htmlFor="ob-try">기억나는 대로 적어보세요</label>
            <input id="ob-try" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
          <fieldset className="conf">
            <legend className="field__label">얼마나 확신하나요?</legend>
            <div className="conf__row">
              {([1, 2, 3, 4] as Confidence[]).map((c) => (
                <button
                  key={c} type="button" className="conf__btn"
                  aria-pressed={confidence === c} onClick={() => setConfidence(c)}
                >
                  <span className="conf__num num" aria-hidden="true">{c}</span>
                  <span className="conf__label">{CONFIDENCE_LABEL[c]}</span>
                  <span className="conf__hint">{CONFIDENCE_HINT[c]}</span>
                </button>
              ))}
            </div>
          </fieldset>
          {confidence ? <p className="xsmall muted">맞히면 → {preview}</p> : null}
          <button
            type="button" className="btn btn--primary btn--lg"
            disabled={confidence === null} onClick={() => setRevealed(true)}
          >
            답 확인
          </button>
        </div>
      ) : (
        <div className="reveal">
          <div className="reveal__answer">
            <span className="eyebrow">정답</span>
            <p className="reveal__answer-text">{item.answer}</p>
          </div>
          {item.rationale ? (
            <div className="reveal__why"><span className="eyebrow">왜</span><p>{item.rationale}</p></div>
          ) : null}

          {done === null ? (
            <div className="row">
              <button type="button" className="btn btn--lg" style={{ flex: 1 }} onClick={() => grade(true)}>
                <Icon name="check" size={18} /> 맞음
              </button>
              <button type="button" className="btn btn--lg" style={{ flex: 1 }} onClick={() => grade(false)}>
                <Icon name="cross" size={18} /> 틀림
              </button>
            </div>
          ) : (
            <div className="stack">
              <p className="small">{done}</p>
              <p className="small muted">
                이게 전부입니다. 헷갈린 것을 넣고, 답을 가리고, 확신도를 고르고, 다시 봅니다.
              </p>
              <button type="button" className="btn btn--primary btn--lg" onClick={onDone}>
                시작하기
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
