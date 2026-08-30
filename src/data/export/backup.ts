/**
 * Getting data out.
 *
 * Three formats, because they answer three different questions:
 *
 *   backup JSON   "if this browser dies tomorrow, can I get everything back?"
 *                 — every record including retrieval history.
 *   exam YAML     "can I use this with the command-line build, or edit it in a
 *                 text editor?" — the v1 format the repository has always used.
 *   PDF           "can I take it into a room with no phone?" — see pdf/print.ts.
 */

import yaml from 'js-yaml';
import type { BackupPayload } from '../../domain/models.ts';
import { buildExamFile, type BuildExamFileInput } from './examFile.ts';

export function backupFilename(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `exam-matrix-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}.json`;
}

export function serialiseBackup(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2);
}

/** v1 YAML, readable by `node scripts/build.js` and by a human. */
export function serialiseExamYaml(input: BuildExamFileInput): string {
  const raw = buildExamFile(input);
  const header = [
    `# ${input.exam.title}`,
    '# Exam Matrix 에서 내보냄 — node scripts/build.js 로 PDF 를 만들 수 있습니다.',
    '',
  ].join('\n');
  return header + yaml.dump(raw, {
    lineWidth: 92,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
}

/**
 * Hand the file to the browser. Kept in one place so every export path uses
 * the same revoke timing — a URL revoked too early gives an empty file on
 * mobile Safari.
 */
export function downloadText(text: string, filename: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
