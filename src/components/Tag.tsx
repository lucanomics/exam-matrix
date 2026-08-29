import type { MarkerKey, ResultClass } from '../domain/models.ts';
import { MARKER_LABEL, MARKER_HINT, RESULT_LABEL } from '../domain/labels.ts';

const MARKER_CLASS: Record<MarkerKey, string> = {
  core: '', distinction: 'tag--distinction', exception: 'tag--exception',
  trap: 'tag--trap', update: 'tag--update', evidence: 'tag--evidence',
};

/** Marker chip. The label is the meaning; the colour only reinforces it. */
export function MarkerTag({ marker, title }: { marker: MarkerKey; title?: boolean }) {
  return (
    <span className={`tag ${MARKER_CLASS[marker]}`} title={title ? MARKER_HINT[marker] : undefined}>
      {MARKER_LABEL[marker]}
    </span>
  );
}

const RESULT_CLASS: Record<ResultClass, string> = {
  confident_correct: 'tag--stable',
  unsure_correct: 'tag--unsure',
  unsure_wrong: 'tag--trap',
  confident_wrong: 'tag--danger',
};

export function ResultTag({ result }: { result: ResultClass }) {
  return <span className={`tag ${RESULT_CLASS[result]}`}>{RESULT_LABEL[result]}</span>;
}

export function StatusDot({ label, tone }: { label: string; tone: 'neutral' | 'dist' | 'unsure' | 'trap' | 'stable' }) {
  const color = {
    neutral: 'var(--c-neutral)', dist: 'var(--c-dist)', unsure: 'var(--c-unsure)',
    trap: 'var(--c-trap)', stable: 'var(--c-stable)',
  }[tone];
  return (
    <span className="row small" style={{ gap: 6 }}>
      <span aria-hidden="true" style={{
        width: 8, height: 8, borderRadius: 999, background: color, flex: 'none',
        border: '1px solid color-mix(in srgb, var(--ink) 18%, transparent)',
      }} />
      {label}
    </span>
  );
}
