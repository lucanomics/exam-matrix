/**
 * 약점 — diagnostics that change what you do next.
 *
 * Every block here is a link into a drill session containing exactly the items
 * it describes. A number you cannot act on has no business being on this page,
 * which is why there are no streaks, no totals-studied and no percentages of
 * effort.
 *
 * The 확신하고 틀림 quadrant leads, because it is the one that costs marks:
 * the learner had no reason to look it up.
 */

import { Link } from 'react-router-dom';
import { BarList } from '../../components/Meter.tsx';
import { MarkerTag } from '../../components/Tag.tsx';
import { Icon } from '../../components/Icon.tsx';
import { useWeaknessReport } from '../../app/hooks.ts';
import { CONFIDENCE_LABEL, FAILURE_LABEL, RESULT_HINT, RESULT_LABEL } from '../../domain/labels.ts';
import { itemLabel } from '../../domain/item.ts';
import type { ResultClass, StudyItem } from '../../domain/models.ts';

const QUADRANTS: Array<{ key: ResultClass; tone: 'trap' | 'unsure' | 'stable' }> = [
  { key: 'confident_wrong', tone: 'trap' },
  { key: 'unsure_wrong', tone: 'trap' },
  { key: 'unsure_correct', tone: 'unsure' },
  { key: 'confident_correct', tone: 'stable' },
];

export function WeaknessScreen() {
  const r = useWeaknessReport();
  const totalAnswers = Object.values(r.quadrants).reduce((a, b) => a + b, 0);

  if (totalAnswers === 0) {
    return (
      <div className="page page--narrow">
        <div className="empty">
          <p className="empty__title">아직 복습 기록이 없습니다.</p>
          <p className="empty__body muted">
            한 번 복습하고 나면 무엇이 아직 위험한지 여기 모입니다.
          </p>
          <Link to="/drill?mode=today" className="btn btn--primary btn--lg">복습 시작</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page__head">
        <p className="page__title">약점</p>
        <p className="page__sub">답한 {totalAnswers}번을 네 가지로 나눠 봅니다.</p>
      </div>

      <div className="quads">
        {QUADRANTS.map(({ key, tone }) => (
          <div className={`quad quad--${tone}`} key={key}>
            <span className="quad__value num">{r.quadrants[key]}</span>
            <span className="quad__label">{RESULT_LABEL[key]}</span>
            <span className="quad__hint">{RESULT_HINT[key]}</span>
          </div>
        ))}
      </div>

      <div className="weak__cols">
        <div className="stack">
          <ItemBlock
            id="misconception"
            title="확신하고 틀린 것"
            hint="맞다고 믿고 있어서 다시 찾아볼 이유조차 없던 항목입니다."
            items={r.misconceptions}
            tone="trap"
            drill={`/drill?mode=wrong_only`}
          />
          <ItemBlock
            title="애매하게 맞은 것"
            hint="채점만 보면 정답이지만, 시험장에서는 흔들립니다."
            items={r.hiddenWeakness}
            tone="unsure"
            drill="/drill?mode=unsure_correct"
          />
          <ItemBlock
            title="반복해서 틀린 것"
            hint="두 번 이상 틀린 항목. 문장을 더 작게 쪼개보세요."
            items={r.repeatedlyWrong}
            tone="trap"
            drill="/drill?mode=wrong_only"
          />
        </div>

        <div className="stack">
          <section className="card">
            <h2 style={{ marginBottom: 'var(--s-3)' }}>아직 안 갈린 짝</h2>
            {r.unresolvedPairs.length === 0 ? (
              <p className="small muted">연결해둔 헷갈리는 짝이 없습니다.</p>
            ) : (
              <ul className="pairlist">
                {r.unresolvedPairs.map((p) => (
                  <li key={p.relation.id}>
                    <Link to={`/drill?mode=confusion&itemIds=${p.a.id},${p.b.id}`} className="pairlist__link">
                      <span className="pairlist__a">{itemLabel(p.a, 26)}</span>
                      <span className="pairlist__vs" aria-hidden="true">↔</span>
                      <span className="pairlist__b">{itemLabel(p.b, 26)}</span>
                      {p.misses > 0 ? <span className="tag tag--trap num">{p.misses}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {r.worstTopics.length ? (
            <section className="card">
              <h2 style={{ marginBottom: 'var(--s-3)' }}>많이 틀리는 주제</h2>
              <BarList
                rows={r.worstTopics.map((t) => ({
                  label: t.title,
                  value: Math.round((1 - t.accuracy) * 100),
                  display: `${Math.round(t.accuracy * 100)}%`,
                  tone: t.accuracy < 0.5 ? 'trap' : t.accuracy < 0.75 ? 'unsure' : 'neutral',
                }))}
                max={100}
                caption="정답률 — 낮을수록 막대가 깁니다"
              />
            </section>
          ) : null}

          {r.failureReasons.length ? (
            <section className="card">
              <h2 style={{ marginBottom: 'var(--s-3)' }}>왜 틀렸나</h2>
              <BarList
                rows={r.failureReasons.map((f) => ({
                  label: FAILURE_LABEL[f.reason],
                  value: f.count,
                  tone: f.reason === 'confused_with_similar' ? 'trap' : 'neutral',
                }))}
              />
              {r.failureReasons[0]?.reason === 'confused_with_similar' ? (
                <p className="small" style={{ marginTop: 'var(--s-3)' }}>
                  가장 흔한 원인이 <strong>비슷한 개념과 혼동</strong>입니다.{' '}
                  <Link to="/matrix">비교표</Link>로 둘을 나란히 놓아보세요.
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="card">
            <h2 style={{ marginBottom: 'var(--s-2)' }}>확신과 실제</h2>
            <p className="small muted" style={{ marginBottom: 'var(--s-3)' }}>
              "확실함"이라고 하고 자주 틀린다면, 확신 자체를 못 믿는 상태입니다.
            </p>
            <BarList
              rows={r.calibration.filter((c) => c.attempts > 0).map((c) => ({
                label: CONFIDENCE_LABEL[c.confidence],
                value: Math.round(c.accuracy * 100),
                display: `${Math.round(c.accuracy * 100)}% · ${c.attempts}회`,
                tone: c.confidence >= 3 && c.accuracy < 0.7 ? 'trap' : 'dist',
              }))}
              max={100}
            />
          </section>

          {r.recentlyStabilised.length ? (
            <section className="card">
              <h2 style={{ marginBottom: 'var(--s-2)' }}>최근에 안정된 것</h2>
              <p className="small muted">
                2주 안에 {r.recentlyStabilised.length}개가 복습 대상에서 빠졌습니다. 목표는 이 목록이 길어지는 것입니다.
              </p>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ItemBlock({
  id, title, hint, items, tone, drill,
}: {
  id?: string; title: string; hint: string; items: StudyItem[];
  tone: 'trap' | 'unsure'; drill: string;
}) {
  return (
    <section className={`card weakblock weakblock--${tone}`} id={id}>
      <div className="row row--between" style={{ marginBottom: 'var(--s-2)' }}>
        <h2>{title} <span className="num muted">{items.length}</span></h2>
        {items.length ? (
          <Link to={drill} className="btn btn--sm">
            <Icon name="drill" size={14} /> 이것만 복습
          </Link>
        ) : null}
      </div>
      <p className="small muted" style={{ marginBottom: items.length ? 'var(--s-3)' : 0 }}>{hint}</p>
      {items.length ? (
        <ul className="itemlist">
          {items.slice(0, 6).map((i) => (
            <li key={i.id}>
              <Link to={`/item/${i.id}`} className="itemlist__link">
                <span className="itemlist__prompt">{itemLabel(i, 70)}</span>
                <span className="itemlist__meta">
                  {i.markers.slice(0, 2).map((m) => <MarkerTag key={m} marker={m} />)}
                  {i.lapses > 0 ? <span className="xsmall muted">{i.lapses}번 틀림</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {items.length > 6 ? (
        <p className="xsmall muted" style={{ marginTop: 'var(--s-2)' }}>외 {items.length - 6}개</p>
      ) : null}
    </section>
  );
}
