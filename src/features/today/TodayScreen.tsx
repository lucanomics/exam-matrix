/**
 * 오늘 — the home screen.
 *
 * It answers exactly one question: what should I study right now. The counts
 * are not a dashboard; each one is a link into a drill session that contains
 * precisely those items, so reading the number and acting on it are the same
 * gesture. There is no "PDF 만들기" here, and that is the point of the rebuild.
 */

import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { MarkerTag } from '../../components/Tag.tsx';
import { useApp, useTodayCounts, useWeaknessReport } from '../../app/hooks.ts';
import { useCapture } from '../../app/CaptureContext.tsx';
import { itemLabel } from '../../domain/item.ts';
import { daysToExam } from '../../domain/examEve.ts';
import { relativeDayLabel } from '../../domain/time.ts';
import { explainDue } from '../../domain/review/scheduler.ts';
import { rankPairs } from '../../domain/confusion.ts';

export function TodayScreen() {
  const { snapshot, legacyNotice } = useApp();
  const counts = useTodayCounts();
  const report = useWeaknessReport();
  const capture = useCapture();

  const dDay = daysToExam(snapshot.exam?.examDate);
  const itemsById = useMemo(() => new Map(snapshot.items.map((i) => [i.id, i])), [snapshot.items]);
  const pairs = useMemo(
    () => rankPairs(snapshot.relations, itemsById, snapshot.lastReviews).filter((p) => p.unresolved).slice(0, 3),
    [snapshot.relations, itemsById, snapshot.lastReviews],
  );

  const upNext = useMemo(() => {
    const now = new Date();
    return snapshot.items
      .filter((i) => i.status !== 'archived' && i.status !== 'mastered')
      .filter((i) => !i.nextReviewAt || new Date(i.nextReviewAt) <= now)
      .map((i) => ({ item: i, reason: explainDue(i, snapshot.lastReviews.get(i.id), now) }))
      .sort((a, b) => b.reason.weight - a.reason.weight)
      .slice(0, 5);
  }, [snapshot.items, snapshot.lastReviews]);

  if (snapshot.items.length === 0) {
    return <EmptyToday onAdd={() => capture.open()} />;
  }

  return (
    <div className="page">
      {legacyNotice ? <LegacyBanner notice={legacyNotice} /> : null}

      <div className="page__head row row--between">
        <div>
          <p className="page__title">오늘 볼 것</p>
          <p className="page__sub">
            {snapshot.exam?.title}
            {dDay !== null ? ` · ${dDay >= 0 ? `시험까지 ${dDay}일` : `시험 ${-dDay}일 지남`}` : ''}
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => capture.open()}>
            <Icon name="plus" size={16} /> 헷갈린 것 추가
          </button>
          <Link className="btn btn--primary btn--lg" to="/drill?mode=today">
            복습 시작
            {counts.due > 0 ? <span className="num"> · {counts.due}</span> : null}
          </Link>
        </div>
      </div>

      <div className="tiles">
        <Tile
          to="/drill?mode=today" label="오늘 다시 볼 것" value={counts.due}
          tone="dist" hint="예정된 복습 + 밀린 것"
        />
        <Tile
          to="/drill?mode=unsure_correct" label="애매하게 맞은 것" value={counts.unsureCorrect}
          tone="unsure" hint="맞았지만 아직 불안정합니다"
        />
        <Tile
          to="/drill?mode=wrong_only" label="반복해서 틀린 것" value={counts.repeatedWrong}
          tone="trap" hint="두 번 이상 틀린 항목"
        />
        <Tile
          to="/weakness#misconception" label="확신하고 틀린 것" value={counts.confidentWrong}
          tone="trap" hint="위험한 착각 — 가장 먼저" danger
        />
      </div>

      <div className="today__cols">
        <section className="card" aria-labelledby="today-next">
          <div className="row row--between" style={{ marginBottom: 'var(--s-3)' }}>
            <h2 id="today-next">먼저 나올 항목</h2>
            <Link to="/drill?mode=today" className="btn btn--ghost btn--sm">전체 <Icon name="chevron" size={14} /></Link>
          </div>
          {upNext.length === 0 ? (
            <p className="muted small">지금 예정된 항목이 없습니다. 다음 복습은 가장 가까운 일정에 나옵니다.</p>
          ) : (
            <ul className="itemlist">
              {upNext.map(({ item, reason }) => (
                <li key={item.id}>
                  <Link to={`/item/${item.id}`} className="itemlist__link">
                    <span className="itemlist__prompt">{itemLabel(item, 64)}</span>
                    <span className="itemlist__meta">
                      {item.markers.slice(0, 2).map((m) => <MarkerTag key={m} marker={m} />)}
                      <span className="xsmall muted">{reason.text}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="stack">
          <section className="card" aria-labelledby="today-pairs">
            <div className="row row--between" style={{ marginBottom: 'var(--s-3)' }}>
              <h2 id="today-pairs">아직 안 갈린 짝</h2>
              <Link to="/matrix" className="btn btn--ghost btn--sm">비교표 <Icon name="chevron" size={14} /></Link>
            </div>
            {pairs.length === 0 ? (
              <p className="muted small">
                헷갈리는 두 개를 연결해두면 여기 모이고, 복습에서 가까이 붙어 나옵니다.
              </p>
            ) : (
              <ul className="pairlist">
                {pairs.map((p) => (
                  <li key={p.relation.id}>
                    <Link
                      to={`/drill?mode=confusion&itemIds=${p.a.id},${p.b.id}`}
                      className="pairlist__link"
                    >
                      <span className="pairlist__a">{itemLabel(p.a, 30)}</span>
                      <span className="pairlist__vs" aria-hidden="true">↔</span>
                      <span className="pairlist__b">{itemLabel(p.b, 30)}</span>
                      {p.misses > 0 ? <span className="tag tag--trap num">{p.misses}회</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card" aria-labelledby="today-shrink">
            <h2 id="today-shrink" style={{ marginBottom: 'var(--s-2)' }}>줄어드는 중</h2>
            <p className="small muted" style={{ marginBottom: 'var(--s-3)' }}>
              목표는 항목을 많이 모으는 게 아니라, 남은 헷갈림을 없애는 것입니다.
            </p>
            <dl className="shrink">
              <div><dt>안정 · 마스터</dt><dd className="num">
                {snapshot.items.filter((i) => i.status === 'stable' || i.status === 'mastered').length}
              </dd></div>
              <div><dt>복습 중</dt><dd className="num">
                {snapshot.items.filter((i) => i.status === 'active' || i.status === 'inbox').length}
              </dd></div>
              <div><dt>최근 2주에 안정된 것</dt><dd className="num">{report.recentlyStabilised.length}</dd></div>
            </dl>
            {snapshot.exam?.examDate ? (
              <p className="xsmall muted" style={{ marginTop: 'var(--s-3)' }}>
                시험일 {relativeDayLabel(snapshot.exam.examDate, new Date())} ·{' '}
                <Link to="/eve">시험 전날 준비</Link>
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function Tile({
  to, label, value, hint, tone, danger,
}: {
  to: string; label: string; value: number; hint: string;
  tone: 'dist' | 'unsure' | 'trap'; danger?: boolean;
}) {
  return (
    <Link to={to} className={`tile tile--${tone}${danger && value > 0 ? ' tile--alert' : ''}`}>
      <span className="tile__value num">{value}</span>
      <span className="tile__label">{label}</span>
      <span className="tile__hint">{hint}</span>
    </Link>
  );
}

function EmptyToday({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="page page--narrow">
      <div className="empty">
        <p className="empty__title">아직 오늘 복습할 항목이 없습니다.</p>
        <p className="empty__body muted">
          방금 문제를 풀다가 <strong>헷갈렸던 것</strong> 하나만 넣어보세요.
          틀린 것뿐 아니라 <em>찍어서 맞은 것</em>, <em>애매하게 맞은 것</em>도 넣습니다.
        </p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn--primary btn--lg" onClick={onAdd}>
            <Icon name="plus" size={18} /> 헷갈린 것 추가
          </button>
          <Link to="/settings#sample" className="btn btn--lg">예시로 한 번 연습</Link>
        </div>
      </div>
    </div>
  );
}

function LegacyBanner({ notice }: { notice: { examTitle: string; items: number } }) {
  return (
    <div className="banner" role="status">
      <Icon name="check" size={18} />
      <span>
        이전에 쓰던 <strong>{notice.examTitle}</strong> 자료를 찾아서 옮겼습니다 — 항목 {notice.items}개.
        원본은 그대로 두었습니다.
      </span>
      <Link to="/settings" className="btn btn--sm">확인</Link>
    </div>
  );
}
