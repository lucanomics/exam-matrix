/**
 * Payload migrations.
 *
 * A payload is whatever arrives from outside the running app: a backup file, a
 * legacy `localStorage` blob, an old export someone kept on a USB stick. Each
 * migration takes the whole payload from one `schemaVersion` to the next, and
 * they run in sequence, so v1 → v3 is v1 → v2 → v3 and never a special case.
 *
 * The rule for every migration in this file (§7): **when a field cannot be
 * mapped, it moves into `legacy`, never into the bin.** A learner who loses a
 * year of study notes to a silent field rename has been failed by the software,
 * and no amount of schema elegance repays that.
 */

import type { BackupPayload } from '../../domain/models.ts';
import { SCHEMA_VERSION } from '../db.ts';
import {
  convertLegacyExamFile, normalizeEditorState, type LegacyExamFile,
} from '../import/legacy.ts';

export interface MigrationReport {
  from: number;
  to: number;
  steps: string[];
  warnings: string[];
}

export interface MigrationOutcome {
  payload: BackupPayload;
  report: MigrationReport;
}

type Migration = (payload: any, warnings: string[]) => any;

/**
 * v1 → v2. v1 is the original YAML/editor era: one exam described as
 * `{ exam, topics, error_log, compression }`, with matrices but no items, no
 * retrieval history and no confidence. v2 is the learning model.
 */
const v1_to_v2: Migration = (payload, warnings) => {
  const raw = (payload.data ?? payload) as Record<string, unknown>;
  // The editor kept its list fields as textarea strings; flatten them back
  // first so there is one converter rather than two.
  const file = (raw.ui || typeof raw.compression === 'object' && typeof (raw.compression as any)?.l3 === 'string'
    ? normalizeEditorState(raw)
    : raw) as LegacyExamFile;
  const converted = convertLegacyExamFile(file, { warnings });
  return { ...converted, schemaVersion: 2 };
};

const MIGRATIONS: Record<number, Migration> = {
  1: v1_to_v2,
};

/** Detect the version of an unknown object. */
export function detectVersion(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0;
  const p = payload as Record<string, unknown>;
  if (typeof p.schemaVersion === 'number') return p.schemaVersion;
  // The v1 YAML/editor shape has no version field at all.
  if (p.exam && p.topics) return 1;
  if (p.format === 'exam-matrix-backup') return 1;
  return 0;
}

export function migrate(input: unknown): MigrationOutcome {
  const from = detectVersion(input);
  const warnings: string[] = [];
  const steps: string[] = [];

  if (from === 0) {
    throw new Error('알아볼 수 없는 파일입니다. Exam Matrix 백업 파일이나 시험 YAML 파일을 넣어주세요.');
  }
  if (from > SCHEMA_VERSION) {
    throw new Error(
      `이 파일은 더 최신 버전(v${from})입니다. 앱을 새로고침해 최신 버전으로 업데이트한 뒤 다시 시도해주세요.`,
    );
  }

  let current: any = input;
  for (let v = from; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`v${v} → v${v + 1} 마이그레이션이 없습니다.`);
    current = step(current, warnings);
    steps.push(`v${v} → v${v + 1}`);
  }

  const payload: BackupPayload = {
    format: 'exam-matrix-backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: current.exportedAt ?? new Date().toISOString(),
    exams: current.exams ?? [],
    subjects: current.subjects ?? [],
    topics: current.topics ?? [],
    items: current.items ?? [],
    relations: current.relations ?? [],
    matrices: current.matrices ?? [],
    reviews: current.reviews ?? [],
    cellStats: current.cellStats ?? [],
    ...(current.settings ? { settings: current.settings } : {}),
  };

  return { payload, report: { from, to: SCHEMA_VERSION, steps, warnings } };
}
