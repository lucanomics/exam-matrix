/**
 * The only chart primitive in the app.
 *
 * §Weakness asks for a small number of useful charts, so there is one shape:
 * a labelled horizontal bar. Every number is also printed, because a bar the
 * learner cannot read a value off is decoration.
 */

interface Row {
  label: string;
  value: number;
  /** Printed at the end of the row. Defaults to the value. */
  display?: string;
  tone?: 'neutral' | 'dist' | 'unsure' | 'trap' | 'stable';
}

const TONE: Record<NonNullable<Row['tone']>, string> = {
  neutral: 'var(--c-neutral)',
  dist: 'var(--c-dist)',
  unsure: 'var(--c-unsure)',
  trap: 'var(--c-trap)',
  stable: 'var(--c-stable)',
};

export function BarList({ rows, max, caption }: { rows: Row[]; max?: number; caption?: string }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="barlist">
      {caption ? <div className="xsmall muted" style={{ marginBottom: 'var(--s-2)' }}>{caption}</div> : null}
      {rows.map((r) => (
        <div className="barlist__row" key={r.label}>
          <span className="barlist__label" title={r.label}>{r.label}</span>
          <span className="barlist__track" aria-hidden="true">
            <span
              className="barlist__fill"
              style={{
                width: `${Math.max(2, (r.value / top) * 100)}%`,
                background: TONE[r.tone ?? 'neutral'],
              }}
            />
          </span>
          <span className="barlist__value num">{r.display ?? r.value}</span>
        </div>
      ))}
    </div>
  );
}
