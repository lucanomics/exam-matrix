/**
 * 출처 — study by where it came from.
 *
 * "2025 기출에서 헷갈렸던 것만 다시 풀기" is a real sentence a learner says out
 * loud the week before an exam, and it should be one tap. Grouping is by
 * source title and year because that is how people refer to their materials —
 * not by an internal id.
 */

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon.tsx';
import { MarkerTag } from '../../components/Tag.tsx';
import { useApp } from '../../app/hooks.ts';
import { SOURCE_LABEL } from '../../domain/labels.ts';
import { itemLabel } from '../../domain/item.ts';
import type { SourceType, StudyItem } from '../../domain/models.ts';

interface Group {
  key: string;
  title: string;
  year?: string;
  type: SourceType;
  items: StudyItem[];
  wrong: number;
  unsure: number;
}

export function SourcesScreen() {
  const { snapshot } = useApp();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const item of snapshot.items) {
      if (item.status === 'archived') continue;
      const title = item.source.title?.trim() || '출처 없음';
      const year = item.source.year?.trim();
      const key = `${title}${year ? ` · ${year}` : ''}`;
      let g = map.get(key);
      if (!g) {
        g = { key, title, ...(year ? { year } : {}), type: item.source.type, items: [], wrong: 0, unsure: 0 };
        map.set(key, g);
      }
      g.items.push(item);
      if (item.lapses > 0) g.wrong++;
      const last = snapshot.lastReviews.get(item.id);
      if (last?.resultClass === 'unsure_correct' || last?.slow) g.unsure++;
    }
    return [...map.values()].sort(
      (a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key, 'ko'),
    );
  }, [snapshot.items, snapshot.lastReviews]);

  const filtered = useMemo(
    () => (q.trim() ? groups.filter((g) => g.key.toLowerCase().includes(q.trim().toLowerCase())) : groups),
    [groups, q],
  );

  if (snapshot.items.length === 0) {
    return (
      <div className="page page--narrow">
        <div className="empty">
          <p className="empty__title">아직 항목이 없습니다.</p>
          <p className="empty__body muted">
            항목을 추가할 때 출처를 적어두면, 나중에 "2024 기출에서 헷갈렸던 것만" 다시 풀 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page__head row row--between">
        <div>
          <p className="page__title">출처</p>
          <p className="page__sub">어디서 나온 헷갈림인지로 모아 봅니다.</p>
        </div>
        <div className="field" style={{ minWidth: 220 }}>
          <label className="visually-hidden" htmlFor="src-q">출처 검색</label>
          <input
            id="src-q" className="input" type="search" placeholder="출처 이름으로 찾기"
            value={q} onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty"><p className="empty__title">찾는 출처가 없습니다.</p></div>
      ) : (
        <div className="srclist">
          {filtered.map((g) => (
            <details className="srcgroup" key={g.key} open={filtered.length <= 3}>
              <summary className="srcgroup__head">
                <span className="srcgroup__title">{g.title}</span>
                {g.year ? <span className="tag">{g.year}</span> : null}
                <span className="tag">{SOURCE_LABEL[g.type]}</span>
                <span className="spacer" />
                <span className="small muted num">{g.items.length}개</span>
                {g.wrong > 0 ? <span className="tag tag--trap num">틀림 {g.wrong}</span> : null}
                {g.unsure > 0 ? <span className="tag tag--unsure num">애매 {g.unsure}</span> : null}
              </summary>
              <div className="srcgroup__body">
                <div className="row" style={{ marginBottom: 'var(--s-3)' }}>
                  <Link
                    className="btn btn--sm btn--primary"
                    to={`/drill?mode=source&sourceTitle=${encodeURIComponent(g.title)}${g.year ? `&sourceYear=${encodeURIComponent(g.year)}` : ''}`}
                  >
                    <Icon name="drill" size={14} /> 이 출처만 복습
                  </Link>
                  {g.wrong > 0 ? (
                    <Link
                      className="btn btn--sm"
                      to={`/drill?mode=wrong_only&sourceTitle=${encodeURIComponent(g.title)}${g.year ? `&sourceYear=${encodeURIComponent(g.year)}` : ''}`}
                    >
                      틀렸던 것만
                    </Link>
                  ) : null}
                </div>
                <ul className="itemlist">
                  {g.items.slice(0, 12).map((i) => (
                    <li key={i.id}>
                      <Link to={`/item/${i.id}`} className="itemlist__link">
                        <span className="itemlist__prompt">{itemLabel(i, 76)}</span>
                        <span className="itemlist__meta">
                          {i.source.questionNumber ? (
                            <span className="xsmall muted">{i.source.questionNumber}</span>
                          ) : null}
                          {i.source.page ? <span className="xsmall muted">p.{i.source.page}</span> : null}
                          {i.markers.slice(0, 2).map((m) => <MarkerTag key={m} marker={m} />)}
                          {i.lapses > 0 ? <span className="xsmall muted">{i.lapses}번 틀림</span> : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {g.items.length > 12 ? (
                  <p className="xsmall muted" style={{ marginTop: 'var(--s-2)' }}>외 {g.items.length - 12}개</p>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
