/**
 * The import pipeline: validate → preview → warn → migrate → commit (§30).
 *
 * Nothing here writes. `inspect()` produces a preview the learner has to look
 * at and confirm; only then does the caller invoke `importPayload()`. That
 * separation is the whole safety property — an import can never silently
 * replace a year of notes.
 */

import yaml from 'js-yaml';
import type { BackupPayload } from '../../domain/models.ts';
import { migrate, type MigrationReport } from '../migrations/index.ts';

export type ImportKind = 'backup' | 'legacy-yaml' | 'legacy-editor';

export interface ImportPreview {
  kind: ImportKind;
  payload: BackupPayload;
  report: MigrationReport;
  counts: {
    exams: number; subjects: number; topics: number; items: number;
    relations: number; matrices: number; reviews: number;
  };
  /** Exam titles, so the learner recognises what they are about to bring in. */
  examTitles: string[];
  warnings: string[];
}

export function parseFileText(text: string, filename = ''): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('파일이 비어 있습니다.');

  const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  if (looksJson || /\.json$/i.test(filename)) {
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      if (looksJson) throw new Error(`JSON 을 읽지 못했습니다: ${(err as Error).message}`);
    }
  }
  try {
    return yaml.load(trimmed);
  } catch (err) {
    throw new Error(`YAML 을 읽지 못했습니다: ${(err as Error).message}`);
  }
}

function kindOf(raw: unknown): ImportKind {
  const o = raw as Record<string, unknown> | null;
  if (o && typeof o === 'object') {
    if (o.format === 'exam-matrix-backup') return 'backup';
    if (o.ui && o.topics) return 'legacy-editor';
  }
  return 'legacy-yaml';
}

/** Read a file's text into a preview. Throws with a Korean message on failure. */
export function inspect(text: string, filename = ''): ImportPreview {
  const raw = parseFileText(text, filename);
  const kind = kindOf(raw);
  const { payload, report } = migrate(raw);

  const warnings = [...report.warnings];
  if (kind !== 'backup') {
    warnings.unshift('예전 형식(v1) 파일입니다. 새 형식으로 변환해서 가져옵니다.');
  }
  if (!payload.exams.length) warnings.push('시험 정보를 찾지 못했습니다.');

  return {
    kind,
    payload,
    report,
    counts: {
      exams: payload.exams.length,
      subjects: payload.subjects.length,
      topics: payload.topics.length,
      items: payload.items.length,
      relations: payload.relations.length,
      matrices: payload.matrices.length,
      reviews: payload.reviews.length,
    },
    examTitles: payload.exams.map((e) => e.title),
    warnings,
  };
}
