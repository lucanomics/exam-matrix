/**
 * The comparison table, as something you can be tested on.
 *
 * Two modes over one grid:
 *
 *   보기/편집 — cells are editable in place. A cell the learner has repeatedly
 *              failed is drawn as unstable, so the table itself reports where
 *              the damage is.
 *   빈칸으로 풀기 — chosen cells are emptied and have to be rebuilt from the row
 *              and column labels alone. Each reconstruction is graded and
 *              recorded against that exact cell, which then biases both the
 *              next blanking pass and the drill queue (§22, §43).
 *
 * The blanking uses the same marker weighting as the printed Recall Edition, so
 * the paper sheet and the screen exercise agree about what is worth hiding.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../../components/Icon.tsx';
import { MarkerTag } from '../../components/Tag.tsx';
import { Confirm } from '../../components/Confirm.tsx';
import { useToast } from '../../components/Toast.tsx';
import { useApp, useMutate } from '../../app/hooks.ts';
import { useCapture } from '../../app/CaptureContext.tsx';
import {
  addrKey, cellMarker, fillRate, isUnstable, newColumn, newRow, planBlanks, setCell,
} from '../../domain/matrix.ts';
import { cellStatId } from '../../domain/ids.ts';
import { MARKER_LABEL, MARKER_ORDER } from '../../domain/labels.ts';
import { deleteMatrix, putMatrix, recordCellOutcome } from '../../data/repo.ts';
import { answersMatch } from '../../domain/item.ts';
import type { ID, MarkerKey, Matrix } from '../../domain/models.ts';
import { PrintMenu } from '../exam-eve/PrintMenu.tsx';

type Mode = 'edit' | 'blank';

export function MatrixScreen() {
  const { matrixId } = useParams();
  const { snapshot } = useApp();
  const mutate = useMutate();
  const toast = useToast();
  const capture = useCapture();

  const matrix = snapshot.matrices.find((m) => m.id === matrixId);
  const [mode, setMode] = useState<Mode>('edit');
  const [seed, setSeed] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [graded, setGraded] = useState<Record<string, boolean>>({});
  const [onlyMarkers, setOnlyMarkers] = useState<MarkerKey[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stats = useMemo(
    () => new Map(snapshot.cellStats.map((s) => [s.id, s])),
    [snapshot.cellStats],
  );

  const plan = useMemo(() => {
    if (!matrix || mode !== 'blank') return null;
    return planBlanks(matrix, {
      stats,
      ...(onlyMarkers.length ? { onlyMarkers } : {}),
      ...(seed ? { seed } : {}),
    });
  }, [matrix, mode, stats, onlyMarkers, seed]);

  const save = useCallback(
    (next: Matrix) => { void mutate(() => putMatrix(next)); },
    [mutate],
  );

  const startBlank = useCallback((markers: MarkerKey[] = []) => {
    setOnlyMarkers(markers);
    setAnswers({});
    setGraded({});
    setSeed(Date.now());
    setMode('blank');
  }, []);

  const gradeCell = useCallback(
    async (rowId: ID, columnId: ID, expected: string) => {
      if (!matrix) return;
      const key = addrKey(rowId, columnId);
      const typed = answers[key] ?? '';
      const correct = answersMatch(typed, expected);
      setGraded((g) => ({ ...g, [key]: correct }));
      await mutate(() => recordCellOutcome(
        { matrixId: matrix.id, rowId, columnId, examId: matrix.examId }, correct,
      ));
    },
    [matrix, answers, mutate],
  );

  const gradeAll = useCallback(async () => {
    if (!matrix || !plan) return;
    for (const { rowId, columnId } of plan.order) {
      const key = addrKey(rowId, columnId);
      if (graded[key] !== undefined) continue;
      const expected = matrix.rows.find((r) => r.id === rowId)?.cells[columnId]?.value ?? '';
      await gradeCell(rowId, columnId, expected);
    }
  }, [matrix, plan, graded, gradeCell]);

  if (!matrix) {
    return (
      <div className="page page--narrow">
        <div className="empty">
          <p className="empty__title">비교표를 찾지 못했습니다.</p>
          <Link to="/matrix" className="btn">비교표 목록으로</Link>
        </div>
      </div>
    );
  }

  const { filled, total } = fillRate(matrix);
  const blanked = plan?.blanked ?? new Set<string>();
  const answeredCount = plan ? plan.order.filter((a) => graded[addrKey(a.rowId, a.columnId)] !== undefined).length : 0;
  const correctCount = plan ? plan.order.filter((a) => graded[addrKey(a.rowId, a.columnId)] === true).length : 0;

  return (
    <div className="page page--wide">
      <div className="page__head row row--between">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 'var(--s-2)' }}>
            <Link to="/matrix" className="btn btn--ghost btn--sm" aria-label="비교표 목록">
              <Icon name="back" size={16} />
            </Link>
            <input
              className="matrix__title"
              value={matrix.title}
              aria-label="비교표 이름"
              onChange={(e) => save({ ...matrix, title: e.target.value })}
            />
          </div>
          <p className="page__sub">
            {matrix.rows.length}행 × {matrix.columns.length}열 · {filled}/{total}칸 채움
            {matrix.note ? ` · ${matrix.note}` : ''}
          </p>
        </div>
        <div className="row">
          {mode === 'edit' ? (
            <>
              <PrintMenu
                label="인쇄"
                build={{
                  exam: snapshot.exam!,
                  subjects: snapshot.subjects,
                  topics: snapshot.topics,
                  items: snapshot.items,
                  matrices: [matrix],
                  cellStats: snapshot.cellStats,
                }}
              />
              <button type="button" className="btn btn--primary" onClick={() => startBlank()}>
                <Icon name="eye-off" size={16} /> 빈칸으로 풀기
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setMode('edit')}>
              <Icon name="eye" size={16} /> 표로 돌아가기
            </button>
          )}
        </div>
      </div>

      {mode === 'blank' ? (
        <div className="matrix__drillbar">
          <span className="small">
            빈칸 {plan?.order.length ?? 0}개 중 <strong className="num">{answeredCount}</strong>개 채점 ·
            맞은 것 <strong className="num">{correctCount}</strong>
          </span>
          <div className="spacer" />
          <div className="row" style={{ gap: 'var(--s-2)' }}>
            <button type="button" className="chip" aria-pressed={onlyMarkers.length === 0} onClick={() => startBlank()}>전체</button>
            <button type="button" className="chip" aria-pressed={onlyMarkers.includes('trap')} onClick={() => startBlank(['trap'])}>함정만</button>
            <button type="button" className="chip" aria-pressed={onlyMarkers.includes('distinction')} onClick={() => startBlank(['distinction'])}>갈림만</button>
            <button type="button" className="chip" aria-pressed={onlyMarkers.includes('exception')} onClick={() => startBlank(['exception'])}>예외만</button>
            <button type="button" className="btn btn--sm" onClick={() => startBlank(onlyMarkers)}>
              <Icon name="shuffle" size={14} /> 다른 칸으로
            </button>
            <button type="button" className="btn btn--sm btn--primary" onClick={() => void gradeAll()}>
              전부 채점
            </button>
          </div>
        </div>
      ) : null}

      <div className="scroll-x matrix__wrap">
        <table className="matrix">
          <caption className="visually-hidden">
            {matrix.title} — {mode === 'blank' ? '빈칸 채우기' : '비교표 편집'}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="matrix__corner">
                <AutoText
                  className="matrix__colinput"
                  value={matrix.rowLabel}
                  label="행 제목"
                  onChange={(v) => save({ ...matrix, rowLabel: v })}
                />
              </th>
              {matrix.columns.map((c) => (
                <th scope="col" key={c.id}>
                  <div className="matrix__colhead">
                    <AutoText
                      className="matrix__colinput"
                      value={c.label}
                      label={`${c.label} 열 이름`}
                      onChange={(v) => save({
                        ...matrix,
                        columns: matrix.columns.map((x) => x.id === c.id ? { ...x, label: v } : x),
                      })}
                    />
                    <div className="matrix__coltools">
                    <MarkerPicker
                      value={c.marker}
                      onChange={(m) => save({
                        ...matrix,
                        columns: matrix.columns.map((x) => x.id === c.id ? { ...x, marker: m } : x),
                      })}
                    />
                    <Link
                      className="matrix__colbtn"
                      to={`/drill?mode=matrix&matrixId=${matrix.id}`}
                      title={`${c.label} 열 연습`}
                    >
                      <Icon name="drill" size={13} />
                    </Link>
                    {matrix.columns.length > 1 ? (
                      <button
                        type="button" className="matrix__colbtn" title={`${c.label} 열 삭제`}
                        onClick={() => save({
                          ...matrix,
                          columns: matrix.columns.filter((x) => x.id !== c.id),
                          rows: matrix.rows.map((r) => {
                            const { [c.id]: _drop, ...rest } = r.cells;
                            return { ...r, cells: rest };
                          }),
                        })}
                      >
                        <Icon name="close" size={13} />
                      </button>
                    ) : null}
                    </div>
                  </div>
                </th>
              ))}
              <th scope="col" className="matrix__add">
                <button
                  type="button" className="btn btn--ghost btn--sm"
                  onClick={() => save({ ...matrix, columns: [...matrix.columns, newColumn('새 기준')] })}
                >
                  <Icon name="plus" size={14} /> 기준
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <AutoText
                    className="matrix__rowinput"
                    value={row.label}
                    label="행 이름"
                    onChange={(v) => save({
                      ...matrix,
                      rows: matrix.rows.map((r) => r.id === row.id ? { ...r, label: v } : r),
                    })}
                  />
                  <div className="matrix__rowtools">
                    <Link
                      className="matrix__colbtn"
                      to={`/drill?mode=matrix&matrixId=${matrix.id}`}
                      title={`${row.label} 행 연습`}
                    >
                      <Icon name="drill" size={13} />
                    </Link>
                    <button
                      type="button" className="matrix__colbtn" title="행 삭제"
                      onClick={() => save({ ...matrix, rows: matrix.rows.filter((r) => r.id !== row.id) })}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                </th>
                {matrix.columns.map((col) => {
                  const key = addrKey(row.id, col.id);
                  const cell = row.cells[col.id];
                  const marker = cellMarker(matrix, row.id, col.id);
                  const stat = stats.get(cellStatId(matrix.id, row.id, col.id));
                  const unstable = isUnstable(stat);
                  const hidden = blanked.has(key);
                  const result = graded[key];

                  return (
                    <td
                      key={col.id}
                      className={[
                        'matrix__cell',
                        `mk-${marker}`,
                        unstable ? 'is-unstable' : '',
                        hidden ? 'is-blank' : '',
                        result === true ? 'is-right' : result === false ? 'is-wrong' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      {hidden ? (
                        <BlankCell
                          value={answers[key] ?? ''}
                          expected={cell?.value ?? ''}
                          result={result}
                          rowLabel={row.label}
                          colLabel={col.label}
                          onChange={(v) => setAnswers((a) => ({ ...a, [key]: v }))}
                          onGrade={() => void gradeCell(row.id, col.id, cell?.value ?? '')}
                          onCapture={() => capture.open({
                            prompt: `${row.label} — ${col.label}?`,
                            answer: cell?.value ?? '',
                            ...(matrix.topicId ? { topicId: matrix.topicId } : {}),
                            cellRef: { matrixId: matrix.id, rowId: row.id, columnId: col.id },
                          })}
                        />
                      ) : (
                        <EditableCell
                          value={cell?.value ?? ''}
                          unstable={unstable}
                          misses={stat?.misses ?? 0}
                          onChange={(v) => save(setCell(matrix, row.id, col.id, { value: v }))}
                          label={`${row.label} · ${col.label}`}
                        />
                      )}
                    </td>
                  );
                })}
                <td className="matrix__add" />
              </tr>
            ))}
            <tr>
              <th scope="row" className="matrix__add">
                <button
                  type="button" className="btn btn--ghost btn--sm"
                  onClick={() => save({ ...matrix, rows: [...matrix.rows, newRow('새 항목')] })}
                >
                  <Icon name="plus" size={14} /> 항목
                </button>
              </th>
              <td colSpan={matrix.columns.length + 1} />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="row" style={{ marginTop: 'var(--s-4)' }}>
        <span className="xsmall muted">
          칸을 눌러 바로 고칠 수 있습니다. 자주 틀린 칸은 <span className="tag tag--trap">불안정</span> 으로 표시됩니다.
        </span>
        <div className="spacer" />
        <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirmDelete(true)}>
          <Icon name="trash" size={14} /> 비교표 삭제
        </button>
      </div>

      {confirmDelete ? (
        <Confirm
          title="비교표를 삭제할까요?"
          danger
          confirmLabel="삭제"
          body={
            <p>
              <strong>{matrix.title}</strong> 과(와) 이 표의 칸별 기록이 사라집니다.
              이 표에서 만든 문제 항목은 그대로 남습니다.
            </p>
          }
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            void mutate(() => deleteMatrix(matrix.id)).then(() => {
              toast.show('비교표를 삭제했습니다.');
              window.location.hash = '#/matrix';
            });
          }}
        />
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- cells --- */

function EditableCell({
  value, onChange, label, unstable, misses,
}: { value: string; onChange: (v: string) => void; label: string; unstable: boolean; misses: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="cell">
      <textarea
        ref={ref}
        className="cell__input"
        rows={1}
        value={value}
        aria-label={label}
        placeholder="—"
        onChange={(e) => onChange(e.target.value)}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight}px`;
        }}
      />
      {unstable ? (
        <span className="cell__flag" title={`이 칸을 ${misses}번 틀렸습니다`}>
          <Icon name="warn" size={12} /> {misses}회
        </span>
      ) : null}
    </div>
  );
}

function BlankCell({
  value, expected, result, rowLabel, colLabel, onChange, onGrade, onCapture,
}: {
  value: string; expected: string; result: boolean | undefined;
  rowLabel: string; colLabel: string;
  onChange: (v: string) => void; onGrade: () => void; onCapture: () => void;
}) {
  if (result === undefined) {
    return (
      <div className="cell">
        <textarea
          className="cell__input cell__input--blank"
          rows={1}
          value={value}
          aria-label={`${rowLabel} · ${colLabel} — 빈칸 채우기`}
          placeholder="기억나는 대로"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onGrade(); } }}
        />
        <button type="button" className="cell__check" onClick={onGrade}>확인</button>
      </div>
    );
  }
  return (
    <div className="cell cell--graded">
      {value ? <p className="cell__mine">{value}</p> : null}
      <p className="cell__answer">{expected}</p>
      <span className={result ? 'tag tag--stable' : 'tag tag--trap'}>
        {result ? '맞음' : '틀림'}
      </span>
      {!result ? (
        <button type="button" className="cell__check" onClick={onCapture}>따로 담기</button>
      ) : null}
    </div>
  );
}

/**
 * A single-line-looking field that actually wraps. Row and column labels are
 * Korean noun phrases that routinely run past a column width, and an <input>
 * clips them with no indication that there is more text.
 */
function AutoText({
  value, onChange, label, className,
}: { value: string; onChange: (v: string) => void; label: string; className: string }) {
  return (
    <textarea
      className={className}
      rows={1}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
    />
  );
}

function MarkerPicker({ value, onChange }: { value: MarkerKey; onChange: (m: MarkerKey) => void }) {
  return (
    <label className="matrix__marker">
      <span className="visually-hidden">열 표시</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as MarkerKey)}
        aria-label="열 표시"
      >
        {MARKER_ORDER.map((m) => <option key={m} value={m}>{MARKER_LABEL[m]}</option>)}
      </select>
      <MarkerTag marker={value} />
    </label>
  );
}
