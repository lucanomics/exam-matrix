/**
 * The application frame.
 *
 * Desktop gets a left rail, phones get a bottom bar, and the middle sizes get
 * an icon rail — the same five destinations either way, so muscle memory
 * survives a change of device. Nothing here reserves space it does not use.
 */

import { NavLink, useLocation } from 'react-router-dom';
import { useMemo, type ReactNode } from 'react';
import { Icon, type IconName } from '../components/Icon.tsx';
import { useApp, useTodayCounts } from './hooks.ts';
import { useCapture } from './CaptureContext.tsx';
import { daysToExam } from '../domain/examEve.ts';

interface Dest { to: string; label: string; icon: IconName; primary?: boolean }

const DESTS: Dest[] = [
  { to: '/', label: '오늘', icon: 'today', primary: true },
  { to: '/drill', label: '복습', icon: 'drill', primary: true },
  { to: '/matrix', label: '비교표', icon: 'matrix', primary: true },
  { to: '/weakness', label: '약점', icon: 'weakness', primary: true },
  { to: '/sources', label: '출처', icon: 'sources' },
  { to: '/eve', label: '시험 전날', icon: 'eve' },
];

export function Shell({ children, onSearch }: { children: ReactNode; onSearch: () => void }) {
  const { exams, snapshot } = useApp();
  const counts = useTodayCounts();
  const capture = useCapture();
  const location = useLocation();

  const examLabel = snapshot.exam?.title ?? '시험 없음';
  const dDay = useMemo(() => {
    const d = daysToExam(snapshot.exam?.examDate);
    return d === null ? null : d >= 0 ? `D-${d}` : `D+${-d}`;
  }, [snapshot.exam?.examDate]);

  const title = DESTS.find((d) => d.to === location.pathname)?.label
    ?? (location.pathname.startsWith('/matrix') ? '비교표'
      : location.pathname.startsWith('/item') ? '항목'
        : location.pathname.startsWith('/settings') ? '설정' : 'Exam Matrix');

  return (
    <div className="shell">
      <a className="skip-link" href="#main">본문으로 건너뛰기</a>

      <nav className="nav" aria-label="주요 메뉴">
        <div className="nav__brand">
          <BrandMark />
          <span>Exam&nbsp;Matrix</span>
        </div>

        <NavLink to="/settings" className="exam-switch" title={`${examLabel} — 시험 바꾸기`}>
          {/* In the icon rail the labels are hidden, so the initial stands in
              for the exam and keeps the control from collapsing to a blank box. */}
          <span className="exam-switch__mark" aria-hidden="true">{examLabel.trim().slice(0, 1) || '?'}</span>
          <span className="exam-switch__title">{examLabel}</span>
          {dDay ? <span className="exam-switch__meta num">{dDay}</span>
            : exams.length > 1 ? <Icon name="chevron" size={14} /> : null}
        </NavLink>

        <button
          type="button"
          className="btn btn--primary nav__capture"
          onClick={() => capture.open()}
          title="헷갈린 것 추가"
        >
          <Icon name="plus" size={16} />
          <span>헷갈린 것 추가</span>
        </button>

        <ul className="nav__list">
          {DESTS.map((d) => (
            <li key={d.to}>
              <NavLink to={d.to} className="nav__link" end={d.to === '/'}>
                <Icon name={d.icon} className="nav__icon" />
                <span>{d.label}</span>
                {d.to === '/drill' && counts.due > 0 ? (
                  <span className="nav__count nav__count--due num">{counts.due}</span>
                ) : null}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="nav__foot">
          <div className="nav__sep" />
          <NavLink to="/settings" className="nav__link">
            <Icon name="settings" className="nav__icon" />
            <span>설정 · 내보내기</span>
          </NavLink>
        </div>
      </nav>

      <div className="main">
        <header className="topbar">
          <h1 className="topbar__title">{title}</h1>
          <div className="spacer" />
          <button type="button" className="search-btn" onClick={onSearch} aria-label="검색 (Ctrl 또는 Cmd + K)">
            <Icon name="search" size={15} />
            <span>검색</span>
            <kbd>⌘K</kbd>
          </button>
        </header>

        <main id="main" tabIndex={-1}>{children}</main>
      </div>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        {DESTS.filter((d) => d.primary).map((d) => (
          <NavLink key={d.to} to={d.to} end={d.to === '/'}>
            <Icon name={d.icon} size={20} />
            {d.label}
            {d.to === '/drill' && counts.due > 0 ? (
              <span className="nav__count nav__count--due num">{counts.due}</span>
            ) : null}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => capture.open()}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 3, background: 'none', border: 0,
            color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Icon name="capture" size={20} />
          추가
        </button>
      </nav>
    </div>
  );
}

function BrandMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="3.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M2.5 9.5h19M9.5 2.5v19" stroke="currentColor" strokeWidth="1.7" />
      <rect x="12" y="12" width="6.5" height="6.5" rx="1" fill="var(--accent)" opacity=".9" />
    </svg>
  );
}
