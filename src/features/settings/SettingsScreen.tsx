/**
 * 설정 — exams, data ownership, and the review ladder made visible.
 *
 * The import flow is the safety-critical part (§30): a file is parsed and
 * migrated in memory, the learner is shown counts and warnings, and only then
 * is anything written. 덮어쓰기 is offered but is never the default, and the
 * confirm sheet names what will be lost.
 */

import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.tsx';
import { Modal } from '../../components/Modal.tsx';
import { Confirm } from '../../components/Confirm.tsx';
import { useToast } from '../../components/Toast.tsx';
import { useApp, useMutate } from '../../app/hooks.ts';
import { store } from '../../data/store.ts';
import {
  clearAll, createExam, deleteExam, exportBackup, importPayload, putExam,
  type ImportStrategy,
} from '../../data/repo.ts';
import { backupFilename, downloadText, serialiseBackup } from '../../data/export/backup.ts';
import { inspect, type ImportPreview } from '../../data/import/index.ts';
import { buildSampleExam, SAMPLE_TITLE } from '../../data/seed.ts';
import { ladderDescription, REVIEW_LADDER } from '../../domain/review/scheduler.ts';
import { PrintMenu } from '../exam-eve/PrintMenu.tsx';
import type { Settings } from '../../domain/models.ts';

export function SettingsScreen() {
  const { exams, snapshot, settings, activeExamId } = useApp();
  const mutate = useMutate();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [strategy, setStrategy] = useState<ImportStrategy>('merge');
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmDeleteExam, setConfirmDeleteExam] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const set = useCallback(
    (p: Partial<Settings>) => { void store.updateSettings(p); },
    [],
  );

  const onFile = useCallback(async (file: File) => {
    setImportError(null);
    try {
      setPreview(inspect(await file.text(), file.name));
    } catch (err) {
      setImportError((err as Error).message);
    }
  }, []);

  const commitImport = useCallback(async () => {
    if (!preview) return;
    const result = await mutate(() => importPayload(preview.payload, strategy));
    const added = Object.values(result.added).reduce((a, b) => a + b, 0);
    const skipped = Object.values(result.skipped).reduce((a, b) => a + b, 0);
    const first = preview.payload.exams[0];
    if (first) await store.selectExam(first.id);
    setPreview(null);
    toast.show(`${added}개를 가져왔습니다${skipped ? ` · 이미 있던 ${skipped}개는 건너뜀` : ''}.`);
  }, [preview, strategy, mutate, toast]);

  const addSample = useCallback(async () => {
    const s = buildSampleExam();
    await mutate(() => importPayload({
      format: 'exam-matrix-backup', schemaVersion: 2, exportedAt: new Date().toISOString(),
      exams: [s.exam], subjects: s.subjects, topics: s.topics, items: s.items,
      relations: s.relations, matrices: s.matrices, reviews: s.reviews, cellStats: [],
    }, 'merge'));
    await store.selectExam(s.exam.id);
    toast.show('예시 시험을 추가했습니다. 언제든 삭제할 수 있습니다.');
  }, [mutate, toast]);

  return (
    <div className="page page--narrow">
      <div className="stack">
        {/* ---- exams ------------------------------------------------------- */}
        <section className="card stack">
          <h2>시험</h2>
          <ul className="examlist">
            {exams.map((e) => (
              <li key={e.id} className={e.id === activeExamId ? 'is-active' : ''}>
                <button
                  type="button" className="examlist__pick"
                  onClick={() => void store.selectExam(e.id)}
                  aria-current={e.id === activeExamId ? 'true' : undefined}
                >
                  <span className="examlist__title">{e.title}</span>
                  {e.isSample ? <span className="tag">예시</span> : null}
                  {e.examDate ? <span className="small muted num">{e.examDate}</span> : null}
                </button>
              </li>
            ))}
          </ul>

          {snapshot.exam ? (
            <div className="row">
              <div className="field" style={{ flex: 2, minWidth: 180 }}>
                <label className="field__label" htmlFor="ex-title">이름</label>
                <input
                  id="ex-title" className="input" defaultValue={snapshot.exam.title}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== snapshot.exam!.title) {
                      void mutate(() => putExam({ ...snapshot.exam!, title: e.target.value.trim() }));
                    }
                  }}
                />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 150 }}>
                <label className="field__label" htmlFor="ex-date">시험 날짜</label>
                <input
                  id="ex-date" className="input" type="date" defaultValue={snapshot.exam.examDate ?? ''}
                  onChange={(e) => void mutate(() => putExam({ ...snapshot.exam!, examDate: e.target.value || undefined }))}
                />
              </div>
            </div>
          ) : null}

          <div className="row">
            <input
              className="input" style={{ flex: 1, minWidth: 180 }}
              placeholder="새 시험 이름" value={newTitle}
              aria-label="새 시험 이름"
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <button
              type="button" className="btn" disabled={!newTitle.trim()}
              onClick={() => {
                void mutate(() => createExam({ title: newTitle.trim() }))
                  .then((e) => store.selectExam(e.id));
                setNewTitle('');
              }}
            >
              <Icon name="plus" size={16} /> 시험 추가
            </button>
            {exams.length > 1 && snapshot.exam ? (
              <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirmDeleteExam(true)}>
                이 시험 삭제
              </button>
            ) : null}
          </div>
        </section>

        {/* ---- data -------------------------------------------------------- */}
        <section className="card stack" id="data">
          <h2>내 데이터</h2>
          <p className="small muted">
            모든 내용은 이 브라우저 안에만 저장됩니다. 계정도, 서버도 없습니다.
            그래서 <strong>백업은 직접 받아두셔야 합니다.</strong>
          </p>
          <div className="row">
            <button
              type="button" className="btn btn--primary"
              onClick={async () => {
                downloadText(serialiseBackup(await exportBackup()), backupFilename());
                toast.show('백업 파일을 내려받았습니다.');
              }}
            >
              <Icon name="download" size={16} /> 전체 백업 내려받기
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={16} /> 파일 가져오기
            </button>
            {snapshot.exam ? (
              <PrintMenu
                label="인쇄 · YAML"
                build={{
                  exam: snapshot.exam,
                  subjects: snapshot.subjects,
                  topics: snapshot.topics,
                  items: snapshot.items,
                  matrices: snapshot.matrices,
                  cellStats: snapshot.cellStats,
                }}
              />
            ) : null}
            <input
              ref={fileRef} type="file" accept=".json,.yaml,.yml,application/json,text/yaml"
              className="visually-hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = '';
              }}
            />
          </div>
          <p className="xsmall muted">
            백업(.json)과 예전 형식(.yaml) 모두 읽습니다. 가져오기 전에 무엇이 들어오는지 먼저 보여드립니다.
          </p>
          {importError ? <p className="small" style={{ color: 'var(--c-trap)' }}>{importError}</p> : null}
        </section>

        {/* ---- how review works -------------------------------------------- */}
        <section className="card stack">
          <h2>복습 간격</h2>
          <p className="small muted">
            숨겨진 알고리즘은 없습니다. 아래 사다리를 오르내릴 뿐이고,
            항목마다 <strong>왜 지금 나왔는지</strong> 확인할 수 있습니다.
          </p>
          <div className="ladder">
            {ladderDescription().map((s) => (
              <span key={s.step} className="ladder__step">
                <span className="ladder__n num">{s.step}</span>
                {s.label}
              </span>
            ))}
          </div>
          <ul className="small rules">
            <li>틀리면 → 이번 복습 안에서 다시, 그다음은 0단계부터.</li>
            <li>찍어서 맞으면 → 1일. 맞았어도 아는 게 아니기 때문입니다.</li>
            <li>애매하게 맞으면 → 한 칸만, 최대 {REVIEW_LADDER[3]}일까지.</li>
            <li>확실하게 맞으면 → 두 칸.</li>
            <li>맞았지만 오래 걸리면 → 애매하게 맞은 것으로 봅니다.</li>
          </ul>

          <div className="row">
            <div className="field" style={{ flex: 1, minWidth: 170 }}>
              <label className="field__label" htmlFor="st-size">한 번에 볼 문항 수</label>
              <input
                id="st-size" className="input" type="number" min={5} max={100}
                value={settings.sessionSize}
                onChange={(e) => set({ sessionSize: Math.max(5, Math.min(100, Number(e.target.value) || 20)) })}
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 170 }}>
              <label className="field__label" htmlFor="st-slow">
                오래 걸림 기준 <span className="field__hint">초</span>
              </label>
              <input
                id="st-slow" className="input" type="number" min={5} max={180}
                value={Math.round(settings.slowAnswerMs / 1000)}
                onChange={(e) => set({ slowAnswerMs: Math.max(5, Number(e.target.value) || 25) * 1000 })}
              />
            </div>
          </div>
          <label className="row small" style={{ gap: 'var(--s-2)' }}>
            <input
              type="checkbox" checked={settings.resurfaceMastered}
              onChange={(e) => set({ resurfaceMastered: e.target.checked })}
            />
            마스터한 항목도 가끔 다시 보여주기
          </label>
        </section>

        {/* ---- appearance --------------------------------------------------- */}
        <section className="card stack">
          <h2>화면</h2>
          <div className="field" style={{ maxWidth: 220 }}>
            <label className="field__label" htmlFor="st-theme">테마</label>
            <select
              id="st-theme" className="select" value={settings.theme}
              onChange={(e) => set({ theme: e.target.value as Settings['theme'] })}
            >
              <option value="system">시스템 설정 따르기</option>
              <option value="light">밝게</option>
              <option value="dark">어둡게</option>
            </select>
          </div>
        </section>

        {/* ---- sample + danger ---------------------------------------------- */}
        <section className="card stack" id="sample">
          <h2>예시와 초기화</h2>
          <p className="small muted">
            예시 데이터는 앱을 둘러보기 위한 것입니다. 검증된 학습 자료가 아닙니다.
          </p>
          <div className="row">
            <button
              type="button" className="btn"
              disabled={exams.some((e) => e.title === SAMPLE_TITLE)}
              onClick={() => void addSample()}
            >
              예시 시험 불러오기
            </button>
            <div className="spacer" />
            <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirmWipe(true)}>
              전부 지우기
            </button>
          </div>
        </section>

        <p className="xsmall muted">
          <Link to="/">오늘 화면</Link> · 예전 브라우저 편집기는{' '}
          <a href="./legacy-editor.html">legacy-editor.html</a> 에 그대로 남아 있습니다.
        </p>
      </div>

      {/* ---- import preview ------------------------------------------------- */}
      {preview ? (
        <Modal
          title="가져오기 전에 확인하세요"
          onClose={() => setPreview(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setPreview(null)}>취소</button>
              <button type="button" className="btn btn--primary" onClick={() => void commitImport()}>
                {strategy === 'replace' ? '전부 바꾸기' : '합쳐서 가져오기'}
              </button>
            </>
          }
        >
          <div className="stack">
            <p className="small">
              {preview.kind === 'backup' ? '백업 파일' : '예전 형식 파일'}
              {preview.report.steps.length ? ` · ${preview.report.steps.join(', ')} 변환` : ''}
            </p>
            {preview.examTitles.length ? (
              <p><strong>{preview.examTitles.join(', ')}</strong></p>
            ) : null}
            <dl className="shrink">
              {Object.entries(preview.counts).filter(([, v]) => v > 0).map(([k, v]) => (
                <div key={k}>
                  <dt>{COUNT_LABEL[k] ?? k}</dt>
                  <dd className="num">{v}</dd>
                </div>
              ))}
            </dl>
            {preview.warnings.length ? (
              <ul className="small warnlist">
                {preview.warnings.map((w) => (
                  <li key={w}><Icon name="warn" size={14} /> {w}</li>
                ))}
              </ul>
            ) : null}
            <fieldset className="stack stack--tight">
              <legend className="field__label">지금 있는 내용은?</legend>
              <label className="row small" style={{ gap: 'var(--s-2)' }}>
                <input type="radio" name="strat" checked={strategy === 'merge'} onChange={() => setStrategy('merge')} />
                그대로 두고 합치기 <span className="muted">(같은 항목은 건너뜁니다)</span>
              </label>
              <label className="row small" style={{ gap: 'var(--s-2)' }}>
                <input type="radio" name="strat" checked={strategy === 'replace'} onChange={() => setStrategy('replace')} />
                전부 지우고 이 파일로 바꾸기
              </label>
              {strategy === 'replace' ? (
                <p className="small" style={{ color: 'var(--c-trap)' }}>
                  지금 있는 시험 {exams.length}개와 모든 복습 기록이 사라집니다. 먼저 백업을 받아두세요.
                </p>
              ) : null}
            </fieldset>
          </div>
        </Modal>
      ) : null}

      {confirmWipe ? (
        <Confirm
          title="정말 전부 지울까요?" danger confirmLabel="전부 지우기"
          body={
            <p>
              시험 {exams.length}개, 항목 {snapshot.items.length}개, 복습 기록 {snapshot.reviews.length}건이
              모두 사라지고 되돌릴 수 없습니다. 먼저 백업을 받아두세요.
            </p>
          }
          onCancel={() => setConfirmWipe(false)}
          onConfirm={() => {
            void mutate(() => clearAll()).then(() => {
              setConfirmWipe(false);
              toast.show('전부 지웠습니다.');
            });
          }}
        />
      ) : null}

      {confirmDeleteExam && snapshot.exam ? (
        <Confirm
          title="이 시험을 삭제할까요?" danger confirmLabel="삭제"
          body={
            <p>
              <strong>{snapshot.exam.title}</strong> 의 항목 {snapshot.items.length}개와
              복습 기록 {snapshot.reviews.length}건이 함께 사라집니다.
            </p>
          }
          onCancel={() => setConfirmDeleteExam(false)}
          onConfirm={() => {
            void mutate(() => deleteExam(snapshot.exam!.id)).then(() => {
              setConfirmDeleteExam(false);
              toast.show('시험을 삭제했습니다.');
            });
          }}
        />
      ) : null}
    </div>
  );
}

const COUNT_LABEL: Record<string, string> = {
  exams: '시험', subjects: '과목', topics: '주제', items: '항목',
  relations: '헷갈리는 짝', matrices: '비교표', reviews: '복습 기록',
};
