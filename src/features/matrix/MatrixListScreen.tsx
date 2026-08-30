/**
 * 비교표 목록, plus the suggestion strip.
 *
 * Suggestions come from what the learner has already told the app — pairs they
 * linked, topics they keep failing, failures they labelled 비슷한 개념과 혼동 —
 * and are never applied on their own (§11). Accept builds the table with the
 * items as rows and a starter set of axes; edit and dismiss are one click each.
 */

import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon.tsx';
import { useApp, useMutate } from '../../app/hooks.ts';
import { useToast } from '../../components/Toast.tsx';
import { suggestMatrices, type MatrixSuggestion } from '../../domain/confusion.ts';
import { fillRate, newColumn } from '../../domain/matrix.ts';
import { newId } from '../../domain/ids.ts';
import { putMatrix } from '../../data/repo.ts';
import { defaultColumns } from '../../pdf/lib/archetypes.js';
import { itemLabel } from '../../domain/item.ts';
import type { ArchetypeKey, Matrix, MatrixRow } from '../../domain/models.ts';

const DISMISSED_KEY = 'em.matrix.dismissed';

export function MatrixListScreen() {
  const { snapshot, activeExamId } = useApp();
  const mutate = useMutate();
  const navigate = useNavigate();
  const toast = useToast();

  const [dismissed, setDismissed] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]'); } catch { return []; }
  });

  const covered = useMemo(() => {
    const s = new Set<string>();
    for (const m of snapshot.matrices) for (const r of m.rows) if (r.itemId) s.add(r.itemId);
    return s;
  }, [snapshot.matrices]);

  const suggestions = useMemo(
    () => suggestMatrices(snapshot.items, snapshot.relations, snapshot.reviews, covered)
      .filter((s) => !dismissed.includes(s.key))
      .slice(0, 3),
    [snapshot.items, snapshot.relations, snapshot.reviews, covered, dismissed],
  );

  const dismiss = useCallback((key: string) => {
    setDismissed((prev) => {
      const next = [...prev, key];
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next.slice(-60)));
      return next;
    });
  }, []);

  const create = useCallback(
    async (suggestion?: MatrixSuggestion) => {
      if (!activeExamId) return;
      const stamp = new Date().toISOString();
      const archetype: ArchetypeKey = 'concept';
      const columns = defaultColumns(archetype)
        .slice(0, 5)
        .map((c) => newColumn(c.label_ko, c.mark));

      const rows: MatrixRow[] = suggestion
        ? suggestion.itemIds.map((id) => {
          const it = snapshot.items.find((x) => x.id === id);
          return {
            id: newId('row_'),
            label: it ? itemLabel(it, 30) : '항목',
            ...(id ? { itemId: id } : {}),
            cells: {},
          };
        })
        : [{ id: newId('row_'), label: '', cells: {} }, { id: newId('row_'), label: '', cells: {} }];

      const topicId = suggestion?.topicId
        ?? snapshot.items.find((i) => i.id === suggestion?.itemIds[0])?.topicId;

      const matrix: Matrix = {
        id: newId('mx_'),
        examId: activeExamId,
        ...(topicId ? { topicId } : {}),
        title: topicId
          ? snapshot.topics.find((t) => t.id === topicId)?.title ?? '새 비교표'
          : '새 비교표',
        rowLabel: '항목',
        archetype,
        columns,
        rows,
        createdAt: stamp,
        updatedAt: stamp,
      };
      await mutate(() => putMatrix(matrix));
      if (suggestion) dismiss(suggestion.key);
      toast.show('비교표를 만들었습니다. 기준(열)부터 내 시험에 맞게 바꿔보세요.');
      navigate(`/matrix/${matrix.id}`);
    },
    [activeExamId, snapshot.items, snapshot.topics, mutate, navigate, toast, dismiss],
  );

  return (
    <div className="page">
      <div className="page__head row row--between">
        <div>
          <p className="page__title">비교표</p>
          <p className="page__sub">헷갈리는 것을 나란히 놓고, 무엇이 다른지 칸을 채웁니다.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => void create()}>
          <Icon name="plus" size={16} /> 새 비교표
        </button>
      </div>

      {suggestions.length ? (
        <section className="stack" aria-labelledby="mx-sugg" style={{ marginBottom: 'var(--s-5)' }}>
          <h2 id="mx-sugg" className="eyebrow">이런 표는 어떨까요</h2>
          {suggestions.map((s) => (
            <div className="suggest" key={s.key}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="small" style={{ marginBottom: 4 }}>{s.reason}</p>
                <p className="suggest__items">{s.labels.join('  ·  ')}</p>
              </div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <button type="button" className="btn btn--sm btn--primary" onClick={() => void create(s)}>
                  만들기
                </button>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => dismiss(s.key)}>
                  안 볼래요
                </button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {snapshot.matrices.length === 0 ? (
        <div className="empty">
          <p className="empty__title">비슷해서 헷갈리는 개념을 연결하면 비교표가 만들어집니다.</p>
          <p className="empty__body muted">
            표는 정리용이 아니라 문제지입니다. 채워 넣은 칸을 다시 가리고 채워보는 것이 목적입니다.
          </p>
          <button type="button" className="btn btn--primary btn--lg" onClick={() => void create()}>
            헷갈리는 두 개 연결하기
          </button>
        </div>
      ) : (
        <ul className="mxlist">
          {snapshot.matrices.map((m) => {
            const { filled, total } = fillRate(m);
            const pct = total ? Math.round((filled / total) * 100) : 0;
            const unstable = snapshot.cellStats.filter(
              (s) => s.matrixId === m.id && (s.misses >= 2 || (s.attempts > 0 && s.misses / s.attempts >= 0.5)),
            ).length;
            return (
              <li key={m.id}>
                <Link to={`/matrix/${m.id}`} className="mxcard">
                  <span className="mxcard__title">{m.title}</span>
                  <span className="mxcard__meta small muted">
                    {m.rows.length}행 × {m.columns.length}열 · {pct}% 채움
                  </span>
                  <span className="mxcard__rows small muted">
                    {m.rows.map((r) => r.label).filter(Boolean).slice(0, 4).join(' · ') || '(비어 있음)'}
                  </span>
                  {unstable > 0 ? (
                    <span className="tag tag--trap">불안정한 칸 {unstable}</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
