/**
 * 시험 전날 — the compression ladder.
 *
 * The old product ended here, at a PDF. This one starts from the retrieval
 * record: what still fails, what was answered without confidence, what carries
 * a trap marker. The system ranks and the learner overrides — pinning always
 * wins, because on the night before an exam the learner knows something the
 * scheduler does not.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon.tsx';
import { MarkerTag } from '../../components/Tag.tsx';
import { useApp, useMutate } from '../../app/hooks.ts';
import { LEVEL_HINT, LEVEL_LABEL, daysToExam, rankForExam, sliceLevel, type Level } from '../../domain/examEve.ts';
import { putItem } from '../../data/repo.ts';
import { itemLabel } from '../../domain/item.ts';
import { PrintMenu } from './PrintMenu.tsx';

const LEVELS: Level[] = ['l1', 'l2', 'l3'];

export function ExamEveScreen() {
  const { snapshot } = useApp();
  const mutate = useMutate();
  const [level, setLevel] = useState<Level>('l2');

  const ranked = useMemo(
    () => rankForExam({ items: snapshot.items, lastReviews: snapshot.lastReviews }),
    [snapshot.items, snapshot.lastReviews],
  );
  const shown = useMemo(() => sliceLevel(ranked, level), [ranked, level]);
  const dDay = daysToExam(snapshot.exam?.examDate);

  const buildInput = useMemo(() => ({
    exam: snapshot.exam!,
    subjects: snapshot.subjects,
    topics: snapshot.topics,
    items: snapshot.items,
    matrices: level === 'l1' ? snapshot.matrices : [],
    cellStats: snapshot.cellStats,
    itemIds: new Set(shown.map((r) => r.item.id)),
    subtitle: LEVEL_LABEL[level],
  }), [snapshot, shown, level]);

  if (!snapshot.exam) {
    return <div className="page page--narrow"><div className="empty"><p className="empty__title">시험이 없습니다.</p></div></div>;
  }

  return (
    <div className="page">
      <div className="page__head row row--between">
        <div>
          <p className="page__title">시험 전날</p>
          <p className="page__sub">
            {dDay !== null
              ? dDay >= 0 ? `${snapshot.exam.title} · 시험까지 ${dDay}일` : `${snapshot.exam.title} · 시험 ${-dDay}일 지남`
              : `${snapshot.exam.title} · 시험 날짜를 넣으면 남은 날이 보입니다`}
          </p>
        </div>
        <div className="row">
          <Link className="btn" to={`/drill?mode=exam_eve&itemIds=${shown.slice(0, 30).map((r) => r.item.id).join(',')}`}>
            <Icon name="drill" size={16} /> 이대로 복습
          </Link>
          <PrintMenu build={buildInput} label="인쇄 · 내보내기" />
        </div>
      </div>

      <div className="levels" role="tablist" aria-label="압축 단계">
        {LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={level === l}
            className={level === l ? 'levels__tab is-on' : 'levels__tab'}
            onClick={() => setLevel(l)}
          >
            <strong>{LEVEL_LABEL[l]}</strong>
            <span className="small muted">{LEVEL_HINT[l]}</span>
            <span className="num small">{sliceLevel(ranked, l).length}개</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <p className="empty__title">아직 모을 것이 없습니다.</p>
          <p className="empty__body muted">
            몇 번 복습하고 나면 아직 불안정한 항목이 여기 모입니다. 지금 꼭 넣고 싶은 것은
            항목 화면에서 <Icon name="pin" size={14} /> 로 고정하세요.
          </p>
        </div>
      ) : (
        <ol className="evelist">
          {shown.map(({ item, why, pinned }, i) => (
            <li key={item.id} className={pinned ? 'evelist__row is-pinned' : 'evelist__row'}>
              <span className="evelist__n num" aria-hidden="true">{i + 1}</span>
              <div className="evelist__body">
                <Link to={`/item/${item.id}`} className="evelist__prompt">{itemLabel(item, 90)}</Link>
                <p className="evelist__answer small">{item.answer}</p>
                <div className="row" style={{ gap: 'var(--s-2)' }}>
                  {item.markers.map((m) => <MarkerTag key={m} marker={m} />)}
                  <span className="xsmall muted">{why}</span>
                </div>
              </div>
              <button
                type="button"
                className="evelist__pin"
                aria-pressed={!!item.pinned}
                aria-label={item.pinned ? '고정 해제' : '고정'}
                title={item.pinned ? '고정 해제' : '항상 포함시키기'}
                onClick={() => void mutate(() => putItem({ ...item, pinned: !item.pinned }))}
              >
                <Icon name="pin" size={16} />
              </button>
            </li>
          ))}
        </ol>
      )}

      <p className="xsmall muted" style={{ marginTop: 'var(--s-5)' }}>
        무엇이 정말 중요한지는 학습자가 정합니다. 순위는 제안일 뿐이고, 고정한 항목은 언제나 먼저 옵니다.
      </p>
    </div>
  );
}
