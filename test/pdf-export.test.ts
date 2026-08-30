/**
 * The bridge to the preserved renderer.
 *
 * `buildExamFile` turns app data back into the v1 exam shape, which is what the
 * PDF engine, the YAML export and `node scripts/build.js` all consume. If it
 * drifts, a learner's printout stops matching their screen and the CLI stops
 * being able to read what the app writes — neither of which would be visible
 * without a test.
 *
 * The renderer itself is exercised end to end in scripts/e2e.js and in
 * legacy/editor/test-editor.js, which compare rendered HTML byte for byte.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import { buildExamFile } from '../src/data/export/examFile.ts';
import { serialiseExamYaml } from '../src/data/export/backup.ts';
import { migrate } from '../src/data/migrations/index.ts';
import { normalizeExam, stripEmpty } from '../src/pdf/lib/normalize.js';
import { applyRecall } from '../src/pdf/lib/recall.js';
import { renderDocument } from '../src/pdf/render.js';
import { buildSampleExam } from '../src/data/seed.ts';
import { createItem } from '../src/domain/item.ts';
import type { BuildExamFileInput } from '../src/data/export/examFile.ts';

const CSS = fs.readFileSync(path.join(process.cwd(), 'src', 'pdf', 'print.css'), 'utf8');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'schema', 'exam.schema.json'), 'utf8'),
);
const validate = new Ajv({ allErrors: true, strict: false }).compile(SCHEMA);

const sample = buildSampleExam(new Date('2026-03-01T00:00:00Z'));
const input: BuildExamFileInput = {
  exam: sample.exam,
  subjects: sample.subjects,
  topics: sample.topics,
  items: sample.items,
  matrices: sample.matrices,
  cellStats: [],
};

describe('buildExamFile', () => {
  it('produces a file the committed v1 schema accepts', () => {
    const file = stripEmpty(buildExamFile(input));
    const ok = validate(file);
    expect(validate.errors?.map((e) => `${e.instancePath} ${e.message}`) ?? [], 'schema errors').toEqual([]);
    expect(ok).toBe(true);
  });

  it('renders every matrix row and cell into the document', () => {
    const file = buildExamFile(input) as any;
    const topic = file.topics.find((t: any) => t.title === sample.matrices[0]!.title);
    expect(topic).toBeDefined();
    expect(topic.matrix.rows.map((r: any) => r.label))
      .toEqual(sample.matrices[0]!.rows.map((r) => r.label));
    expect(topic.matrix.columns.map((c: any) => c.label_ko))
      .toEqual(sample.matrices[0]!.columns.map((c) => c.label));
  });

  it('prints items that belong to no matrix as their own recall table', () => {
    const looseTopicId = 'loose';
    const withLoose: BuildExamFileInput = {
      ...input,
      topics: [...input.topics, { id: looseTopicId, examId: sample.exam.id, title: '표 없는 주제', order: 9 }],
      items: [
        ...input.items,
        createItem({ examId: sample.exam.id, topicId: looseTopicId, prompt: '표 밖의 문제', answer: '표 밖의 답' }),
      ],
    };
    const file = buildExamFile(withLoose) as any;
    const topic = file.topics.find((t: any) => t.title === '표 없는 주제');
    expect(topic).toBeDefined();
    expect(topic.matrix.rows[0].label).toBe('표 밖의 문제');
    expect(topic.matrix.rows[0].cells.answer.v).toBe('표 밖의 답');
  });

  it('marks a repeatedly-missed cell as a trap so the paper inherits the diagnosis', () => {
    const m = sample.matrices[0]!;
    const row = m.rows[0]!;
    const col = m.columns[0]!;
    const file = buildExamFile({
      ...input,
      cellStats: [{
        id: `${m.id}:${row.id}:${col.id}`, matrixId: m.id, rowId: row.id, columnId: col.id,
        examId: sample.exam.id, attempts: 3, misses: 3,
      }],
    }) as any;
    const topic = file.topics.find((t: any) => t.title === m.title);
    expect(topic.matrix.rows[0].cells[col.key]).toMatchObject({ mark: 'trap' });
  });

  it('restores exam metadata an import had parked in legacy', () => {
    const { payload } = migrate(
      yaml.load(fs.readFileSync(path.join(process.cwd(), 'examples', 'law.yaml'), 'utf8')),
    );
    const file = buildExamFile({
      exam: payload.exams[0]!,
      subjects: payload.subjects,
      topics: payload.topics,
      items: payload.items,
      matrices: payload.matrices,
    }) as any;
    expect(file.exam.blueprint).toBeDefined();
    expect(file.exam.passing).toBeDefined();
    expect(stripEmpty(file)).toBeTruthy();
    expect(validate(stripEmpty(file))).toBe(true);
  });

  it('carries pinned items into the compression ladder', () => {
    const pinned = { ...sample.items[0]!, pinned: true };
    const file = buildExamFile({ ...input, items: [pinned, ...sample.items.slice(1)] }) as any;
    expect(file.compression.l2).toHaveLength(1);
    expect(file.compression.l3).toHaveLength(1);
  });

  it('honours an item subset, which is how L2 and L3 are exported', () => {
    const subset = new Set([sample.items[0]!.id]);
    const file = buildExamFile({ ...input, itemIds: subset, subtitle: 'L3 · 마지막 10분' }) as any;
    expect(file.exam.name_sub).toBe('L3 · 마지막 10분');
    expect((file.error_log ?? []).length).toBeLessThanOrEqual(1);
  });

  it('never emits an empty topics array — the renderer requires one', () => {
    const file = buildExamFile({
      exam: sample.exam, subjects: [], topics: [], items: [], matrices: [],
    }) as any;
    expect(file.topics.length).toBeGreaterThan(0);
    expect(validate(stripEmpty(file))).toBe(true);
  });
});

describe('the renderer accepts what the app hands it', () => {
  it.each(['full', 'recall', 'key'] as const)('renders the %s edition', (edition) => {
    const model = normalizeExam(stripEmpty(buildExamFile(input)));
    if (edition !== 'full') applyRecall(model);
    const html = renderDocument(model, edition, CSS);
    expect(html.startsWith('<!doctype html>') || html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain(sample.exam.title);
    expect(html).toContain('</html>');
    // Korean must survive into the document; a tofu-only render is a failure.
    expect(html).toMatch(/[가-힣]/);
  });

  it('the recall edition withholds cells and the key restores them', () => {
    const model = normalizeExam(stripEmpty(buildExamFile(input)));
    const key = applyRecall(model);
    expect(key.length).toBeGreaterThan(0);
    const blanked = model.topics.flatMap((t: any) =>
      t.matrix.rows.flatMap((r: any) => r.cells.filter((c: any) => c.blank)));
    expect(blanked.length).toBeGreaterThan(0);
    const answers = key.flatMap((k) => k.items.map((i) => i.answer));
    for (const cell of blanked) expect(answers).toContain(cell.v);
  });

  it('blanking is deterministic, so a reprint matches the sheet already written on', () => {
    const a = normalizeExam(stripEmpty(buildExamFile(input)));
    const b = normalizeExam(stripEmpty(buildExamFile(input)));
    applyRecall(a);
    applyRecall(b);
    expect(renderDocument(a, 'recall', CSS)).toBe(renderDocument(b, 'recall', CSS));
  });
});

describe('YAML export', () => {
  const text = serialiseExamYaml(input);

  it('round-trips back through the schema', () => {
    const parsed = stripEmpty(yaml.load(text));
    expect(validate(parsed), JSON.stringify(validate.errors)).toBe(true);
  });

  it('is readable: header comment, exam name, and no anchors', () => {
    expect(text).toContain('# ' + sample.exam.title);
    expect(text).toContain('scripts/build.js');
    expect(text).not.toContain('&ref_');
    expect(text).not.toContain('*ref_');
  });

  it('keeps Korean as Korean rather than escaping it', () => {
    expect(text).toContain('문헌연구법');
  });
});
