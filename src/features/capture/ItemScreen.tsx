/**
 * One item, in full.
 *
 * Everything Quick Capture deliberately left out lives here: the examiner's
 * wording, the corrected statement, the confusion links, the marker set, and
 * the retrieval history that explains why the app keeps showing it.
 */

import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../components/Icon.tsx';
import { MarkerTag, ResultTag } from '../../components/Tag.tsx';
import { Confirm } from '../../components/Confirm.tsx';
import { useToast } from '../../components/Toast.tsx';
import { useApp, useMutate } from '../../app/hooks.ts';
import { useCapture } from '../../app/CaptureContext.tsx';
import {
  CONFIDENCE_LABEL, FAILURE_LABEL, INTAKE_LABEL, ITEM_TYPE_LABEL,
  MARKER_ORDER, SOURCE_LABEL, STATUS_LABEL,
} from '../../domain/labels.ts';
import { addRelation, deleteItem, putItem, removeRelation } from '../../data/repo.ts';
import { makeRelation } from '../../domain/confusion.ts';
import { explainDue, ladderDays } from '../../domain/review/scheduler.ts';
import { formatDate, relativeDayLabel } from '../../domain/time.ts';
import { itemLabel } from '../../domain/item.ts';
import type { ItemStatus, MarkerKey, StudyItem } from '../../domain/models.ts';

const STATUSES: ItemStatus[] = ['inbox', 'active', 'stable', 'mastered', 'archived'];

export function ItemScreen() {
  const { itemId } = useParams();
  const { snapshot } = useApp();
  const mutate = useMutate();
  const navigate = useNavigate();
  const toast = useToast();
  const capture = useCapture();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [linking, setLinking] = useState('');

  const item = snapshot.items.find((i) => i.id === itemId);

  const history = useMemo(
    () => snapshot.reviews.filter((r) => r.itemId === itemId).slice().reverse(),
    [snapshot.reviews, itemId],
  );
  const partners = useMemo(
    () => snapshot.relations
      .filter((r) => r.aId === itemId || r.bId === itemId)
      .map((r) => ({
        relation: r,
        other: snapshot.items.find((i) => i.id === (r.aId === itemId ? r.bId : r.aId)),
      }))
      .filter((p) => p.other),
    [snapshot.relations, snapshot.items, itemId],
  );

  const patch = useCallback(
    (p: Partial<StudyItem>) => { if (item) void mutate(() => putItem({ ...item, ...p })); },
    [item, mutate],
  );

  if (!item) {
    return (
      <div className="page page--narrow">
        <div className="empty">
          <p className="empty__title">항목을 찾지 못했습니다.</p>
          <Link to="/" className="btn">오늘 화면으로</Link>
        </div>
      </div>
    );
  }

  const reason = explainDue(item, snapshot.lastReviews.get(item.id), new Date());
  const matrix = item.cellRef ? snapshot.matrices.find((m) => m.id === item.cellRef!.matrixId) : undefined;

  return (
    <div className="page page--narrow">
      <div className="row" style={{ marginBottom: 'var(--s-4)' }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate(-1)}>
          <Icon name="back" size={16} /> 뒤로
        </button>
        <div className="spacer" />
        <button
          type="button" className="btn btn--sm" aria-pressed={!!item.pinned}
          onClick={() => patch({ pinned: !item.pinned })}
        >
          <Icon name="pin" size={14} /> {item.pinned ? '고정됨' : '시험 전날 고정'}
        </button>
        <Link className="btn btn--sm" to={`/drill?mode=all&itemIds=${item.id}`}>
          <Icon name="drill" size={14} /> 지금 풀기
        </Link>
      </div>

      <div className="stack">
        <section className="card stack">
          <div className="row">
            <span className="tag">{ITEM_TYPE_LABEL[item.itemType]}</span>
            <span className="tag">{STATUS_LABEL[item.status]}</span>
            <span className="tag">{INTAKE_LABEL[item.intakeReason]}</span>
            {item.markers.map((m) => <MarkerTag key={m} marker={m} />)}
          </div>

          <Field label="문제 · 헷갈린 표현" value={item.prompt} rows={2} onChange={(v) => patch({ prompt: v })} />
          <Field label="정답" value={item.answer} rows={2} onChange={(v) => patch({ answer: v })} />
          <Field
            label="왜" hint="이게 없으면 다음에 또 틀립니다"
            value={item.rationale ?? ''} rows={3} onChange={(v) => patch({ rationale: v })}
          />
          <Field
            label="고쳐 쓰면" hint="틀린 문장을 맞게 바꾼 형태"
            value={item.correctedStatement ?? ''} rows={2} onChange={(v) => patch({ correctedStatement: v })}
          />
          <Field
            label="기출 표현" hint="출제자가 쓴 문장 그대로"
            value={item.examinerWording ?? ''} rows={2} onChange={(v) => patch({ examinerWording: v })}
          />
          <Field
            label="결정적 차이" hint="하나만 고른다면 무엇으로 구분하나요"
            value={item.decisiveDistinction ?? ''} rows={2} onChange={(v) => patch({ decisiveDistinction: v })}
          />

          <div className="field">
            <span className="field__label">표시</span>
            <div className="row" style={{ gap: 'var(--s-2)' }}>
              {MARKER_ORDER.map((m) => (
                <button
                  key={m} type="button" className="chip"
                  aria-pressed={item.markers.includes(m)}
                  onClick={() => patch({
                    markers: item.markers.includes(m)
                      ? item.markers.filter((x) => x !== m)
                      : [...item.markers, m as MarkerKey],
                  })}
                >
                  <MarkerTag marker={m} title />
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="card stack">
          <h2>헷갈리는 짝</h2>
          {partners.length ? (
            <ul className="itemlist">
              {partners.map(({ relation, other }) => (
                <li key={relation.id} className="row row--between">
                  <Link to={`/item/${other!.id}`} className="itemlist__link" style={{ flex: 1 }}>
                    <span className="itemlist__prompt">{itemLabel(other!, 56)}</span>
                  </Link>
                  <Link className="btn btn--sm" to={`/drill?mode=confusion&itemIds=${item.id},${other!.id}`}>
                    나란히 풀기
                  </Link>
                  <button
                    type="button" className="btn btn--sm btn--ghost" aria-label="연결 해제"
                    onClick={() => void mutate(() => removeRelation(relation.id))}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">아직 연결한 항목이 없습니다.</p>
          )}
          <div className="row">
            <select
              className="select" style={{ flex: 1 }} value={linking}
              aria-label="헷갈리는 항목 고르기"
              onChange={(e) => setLinking(e.target.value)}
            >
              <option value="">항목 고르기…</option>
              {snapshot.items
                .filter((i) => i.id !== item.id && !item.confusedWithIds.includes(i.id))
                .slice(0, 200)
                .map((i) => <option key={i.id} value={i.id}>{itemLabel(i, 60)}</option>)}
            </select>
            <button
              type="button" className="btn" disabled={!linking}
              onClick={() => {
                void mutate(() => addRelation(makeRelation(item.examId, item.id, linking)));
                setLinking('');
                toast.show('연결했습니다. 복습에서 가까이 붙어 나옵니다.');
              }}
            >
              연결
            </button>
            <button type="button" className="btn" onClick={() => capture.open({ confusedWithId: item.id, ...(item.topicId ? { topicId: item.topicId } : {}) })}>
              새로 만들어 연결
            </button>
          </div>
        </section>

        <section className="card stack">
          <h2>복습 기록</h2>
          <p className="small muted">
            {reason.text} 다음 예정: {relativeDayLabel(item.nextReviewAt, new Date())}
            {' · '}지금 간격 {ladderDays(item.step)}일 · 틀린 횟수 {item.lapses}
          </p>
          {history.length ? (
            <ul className="history">
              {history.slice(0, 12).map((h) => (
                <li key={h.id}>
                  <span className="history__date small muted">{formatDate(h.reviewedAt)}</span>
                  <ResultTag result={h.resultClass} />
                  <span className="small muted">{CONFIDENCE_LABEL[h.confidence]}</span>
                  {h.slow ? <span className="tag tag--unsure">오래 걸림</span> : null}
                  {h.failureReason ? <span className="small muted">{FAILURE_LABEL[h.failureReason]}</span> : null}
                  <span className="spacer" />
                  <span className="xsmall muted">{h.intervalDays === 0 ? '오늘 다시' : `+${h.intervalDays}일`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">아직 풀어본 적이 없습니다.</p>
          )}
        </section>

        <section className="card stack">
          <h2>분류</h2>
          <div className="row">
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label className="field__label" htmlFor="it-status">상태</label>
              <select
                id="it-status" className="select" value={item.status}
                onChange={(e) => patch({ status: e.target.value as ItemStatus })}
              >
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label className="field__label" htmlFor="it-topic">주제</label>
              <select
                id="it-topic" className="select" value={item.topicId ?? ''}
                onChange={(e) => patch({ topicId: e.target.value || undefined })}
              >
                <option value="">없음</option>
                {snapshot.topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
          </div>
          <p className="small muted">
            출처: {SOURCE_LABEL[item.source.type]}
            {item.source.title ? ` · ${item.source.title}` : ''}
            {item.source.year ? ` · ${item.source.year}` : ''}
            {item.source.page ? ` · p.${item.source.page}` : ''}
            {item.source.questionNumber ? ` · ${item.source.questionNumber}` : ''}
          </p>
          {matrix && item.cellRef ? (
            <p className="small">
              비교표 칸과 연결됨 —{' '}
              <Link to={`/matrix/${matrix.id}`}>
                {matrix.title} · {matrix.rows.find((r) => r.id === item.cellRef!.rowId)?.label}
                {' · '}
                {matrix.columns.find((c) => c.id === item.cellRef!.columnId)?.label}
              </Link>
            </p>
          ) : null}
          {item.legacy ? (
            <details>
              <summary className="small muted" style={{ cursor: 'pointer' }}>
                옮겨올 때 자리를 못 찾은 원본 데이터
              </summary>
              <pre className="legacy-dump">{JSON.stringify(item.legacy, null, 2)}</pre>
            </details>
          ) : null}
        </section>

        <div className="row">
          <div className="spacer" />
          <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={14} /> 항목 삭제
          </button>
        </div>
      </div>

      {confirmDelete ? (
        <Confirm
          title="이 항목을 삭제할까요?" danger confirmLabel="삭제"
          body={
            <p>
              복습 기록은 남지만 항목은 사라집니다. 다시 안 보고 싶은 것뿐이라면
              상태를 <strong>보관</strong>으로 바꾸는 편이 낫습니다.
            </p>
          }
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void mutate(() => deleteItem(item.id)).then(() => {
              toast.show('삭제했습니다.');
              navigate('/');
            });
          }}
        />
      ) : null}
    </div>
  );
}

function Field({
  label, hint, value, rows, onChange,
}: { label: string; hint?: string; value: string; rows: number; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const id = `f-${label.replace(/\s/g, '')}`;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}{hint ? <span className="field__hint">{hint}</span> : null}
      </label>
      <textarea
        id={id} className="textarea" rows={rows} value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onChange(local); }}
      />
    </div>
  );
}
