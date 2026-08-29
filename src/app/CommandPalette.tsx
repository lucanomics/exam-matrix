/**
 * ⌘K / Ctrl+K.
 *
 * Search plus the handful of actions that are otherwise two clicks away.
 * Arrow keys and Enter only — the list is a listbox, so a screen reader gets
 * the active option announced as it moves.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../components/Icon.tsx';
import { useSearchIndex } from './hooks.ts';
import { useCapture } from './CaptureContext.tsx';
import { search, type SearchHit } from '../domain/search.ts';

interface Action { id: string; title: string; subtitle: string; icon: IconName; run: () => void }

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const capture = useCapture();
  const docs = useSearchIndex();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const actions = useMemo<Action[]>(() => [
    { id: 'a-capture', title: '헷갈린 것 추가', subtitle: '지금 바로 하나 담기', icon: 'plus', run: () => { onClose(); capture.open(); } },
    { id: 'a-today', title: '오늘 복습 시작', subtitle: '예정된 것부터', icon: 'drill', run: () => { onClose(); navigate('/drill?mode=today'); } },
    { id: 'a-wrong', title: '오답만 복습', subtitle: '틀린 적 있는 항목', icon: 'drill', run: () => { onClose(); navigate('/drill?mode=wrong_only'); } },
    { id: 'a-unsure', title: '애매하게 맞은 것', subtitle: '숨은 약점', icon: 'drill', run: () => { onClose(); navigate('/drill?mode=unsure_correct'); } },
    { id: 'a-matrix', title: '비교표', subtitle: '헷갈리는 것 나란히 놓기', icon: 'matrix', run: () => { onClose(); navigate('/matrix'); } },
    { id: 'a-weak', title: '약점 보기', subtitle: '무엇이 아직 위험한가', icon: 'weakness', run: () => { onClose(); navigate('/weakness'); } },
    { id: 'a-eve', title: '시험 전날', subtitle: 'L1 · L2 · L3', icon: 'eve', run: () => { onClose(); navigate('/eve'); } },
    { id: 'a-export', title: '내보내기 · 가져오기', subtitle: '백업 · YAML · 인쇄', icon: 'download', run: () => { onClose(); navigate('/settings'); } },
  ], [capture, navigate, onClose]);

  const hits = useMemo<SearchHit[]>(() => (q.trim() ? search(docs, q, 24) : []), [docs, q]);

  const rows = useMemo(() => {
    if (!q.trim()) return actions.map((a) => ({ kind: 'action' as const, action: a }));
    const matchingActions = actions.filter((a) => a.title.includes(q.trim()));
    return [
      ...matchingActions.map((a) => ({ kind: 'action' as const, action: a })),
      ...hits.map((h) => ({ kind: 'hit' as const, hit: h })),
    ];
  }, [q, actions, hits]);

  useEffect(() => { setActive(0); }, [q]);

  const choose = (i: number) => {
    const row = rows[i];
    if (!row) return;
    if (row.kind === 'action') row.action.run();
    else { onClose(); navigate(row.hit.href); }
  };

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="검색">
        <div className="palette__input">
          <Icon name="search" size={17} />
          <input
            ref={inputRef}
            className="palette__field"
            placeholder="문제, 답, 주제, 출처로 찾기"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={rows[active] ? `palette-row-${active}` : undefined}
            aria-autocomplete="list"
            onKeyDown={(e) => {
              if (e.key === 'Escape') { onClose(); return; }
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === 'Enter') { e.preventDefault(); choose(active); }
            }}
          />
          <kbd className="mono">Esc</kbd>
        </div>

        <ul className="palette__list" id="palette-list" role="listbox" ref={listRef} aria-label="결과">
          {rows.length === 0 ? (
            <li className="palette__empty muted small">찾는 내용이 없습니다.</li>
          ) : rows.map((row, i) => (
            <li
              key={row.kind === 'action' ? row.action.id : row.hit.id}
              id={`palette-row-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'palette__row is-active' : 'palette__row'}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(i); }}
            >
              <Icon name={row.kind === 'action' ? row.action.icon : iconFor(row.hit.kind)} size={16} />
              <span className="palette__title">
                {row.kind === 'action' ? row.action.title : row.hit.title}
              </span>
              <span className="palette__sub">
                {row.kind === 'action' ? row.action.subtitle : row.hit.subtitle}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const iconFor = (kind: SearchHit['kind']): IconName =>
  kind === 'matrix' ? 'matrix' : kind === 'source' ? 'sources' : kind === 'topic' ? 'today' : 'drill';
