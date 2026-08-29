/**
 * Migration is the promise that a learner who used the old editor does not
 * lose a year of notes. So these run against the *actual committed* example
 * files rather than hand-written fixtures — if the v1 format changes shape,
 * this fails rather than passing against a stale copy.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { detectVersion, migrate } from '../src/data/migrations/index.ts';
import {
  convertLegacyExamFile, normalizeEditorState, readLegacyLocalStorage,
  LEGACY_STORAGE_KEY,
} from '../src/data/import/legacy.ts';
import { inspect } from '../src/data/import/index.ts';
import { SCHEMA_VERSION } from '../src/data/db.ts';

const EXAMPLES = path.join(process.cwd(), 'examples');
const files = fs.readdirSync(EXAMPLES).filter((f) => f.endsWith('.yaml'));
const NOW = new Date('2026-03-01T00:00:00Z');

const load = (f: string) => yaml.load(fs.readFileSync(path.join(EXAMPLES, f), 'utf8')) as any;

describe('detectVersion', () => {
  it('recognises the v1 exam file by its shape', () => {
    expect(detectVersion(load(files[0]!))).toBe(1);
  });
  it('reads schemaVersion when present', () => {
    expect(detectVersion({ schemaVersion: 2, format: 'exam-matrix-backup' })).toBe(2);
  });
  it('rejects what it cannot identify', () => {
    expect(detectVersion(null)).toBe(0);
    expect(detectVersion({ hello: 'world' })).toBe(0);
    expect(() => migrate({ hello: 'world' })).toThrow(/알아볼 수 없는/);
  });
  it('refuses a payload from a future version rather than mangling it', () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 5 })).toThrow(/최신 버전/);
  });
});

describe.each(files)('v1 → v2: %s', (file) => {
  const raw = load(file);
  const { payload, report } = migrate(raw);

  it('lands on the current schema version', () => {
    expect(report.from).toBe(1);
    expect(report.to).toBe(SCHEMA_VERSION);
    expect(payload.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('produces exactly one exam, keeping title and date', () => {
    expect(payload.exams).toHaveLength(1);
    expect(payload.exams[0]!.title).toBe(raw.exam.name);
    if (raw.exam.date) expect(payload.exams[0]!.examDate).toBe(raw.exam.date);
  });

  it('keeps every topic and builds a matrix for each one that has a grid', () => {
    expect(payload.topics).toHaveLength(raw.topics.length);
    const withGrid = raw.topics.filter(
      (t: any) => (t.matrix?.rows?.length ?? 0) > 0 && (t.matrix?.columns?.length ?? 0) > 0,
    ).length;
    expect(payload.matrices).toHaveLength(withGrid);
  });

  it('carries every matrix cell across unchanged', () => {
    for (const t of raw.topics) {
      const cols: any[] = t.matrix?.columns ?? [];
      if (!cols.length || !t.matrix?.rows?.length) continue;
      const m = payload.matrices.find((x) => x.title === t.title);
      expect(m, `matrix for ${t.title}`).toBeDefined();

      for (const [ri, r] of t.matrix.rows.entries()) {
        const row = m!.rows[ri]!;
        expect(row.label).toBe(r.label);
        for (const c of cols) {
          const src = r.cells?.[c.key];
          const value = typeof src === 'object' && src !== null ? (src.v ?? src.value) : src;
          const col = m!.columns.find((x) => x.key === c.key)!;
          if (value === undefined || value === null || value === '') {
            expect(row.cells[col.id]).toBeUndefined();
          } else {
            expect(row.cells[col.id]!.value).toBe(String(value));
          }
        }
      }
    }
  });

  it('turns every trap into an item that keeps the examiner wording', () => {
    const traps = raw.topics.flatMap((t: any) => t.traps ?? [])
      .filter((tr: any) => tr.cue && (tr.exception || tr.usually));
    for (const tr of traps) {
      const found = payload.items.find((i) => i.examinerWording === tr.cue);
      expect(found, `trap "${tr.cue}"`).toBeDefined();
      expect(found!.markers).toContain('trap');
    }
  });

  it('turns each decisive pair into two linked comparison items and a relation', () => {
    const pairs = raw.topics.flatMap((t: any) => t.decisive?.pairs ?? [])
      .filter((p: any) => p.a && p.b && (p.clue || p.why));
    expect(payload.relations.length).toBeGreaterThanOrEqual(pairs.length);
    for (const p of pairs) {
      const a = payload.items.find((i) => i.prompt.startsWith(`${p.a} — ${p.b}`));
      const b = payload.items.find((i) => i.prompt.startsWith(`${p.b} — ${p.a}`));
      expect(a, `pair ${p.a}/${p.b}`).toBeDefined();
      expect(b).toBeDefined();
      expect(a!.confusedWithIds).toContain(b!.id);
      expect(payload.relations.some(
        (r) => (r.aId === a!.id && r.bId === b!.id) || (r.aId === b!.id && r.bId === a!.id),
      )).toBe(true);
    }
  });

  it('imports every error-log entry as an item that already carries a lapse', () => {
    const entries = (raw.error_log ?? []).filter((e: any) => e.question && e.correct);
    for (const e of entries) {
      const found = payload.items.find((i) => i.prompt === e.question && i.answer === e.correct);
      expect(found, `error_log "${e.question}"`).toBeDefined();
      expect(found!.lapses).toBe(1);
      expect(found!.status).toBe('active');
      expect(found!.legacy).toMatchObject({ from: 'error_log' });
    }
  });

  it('resolves error-log cell references to real matrix cells', () => {
    for (const e of raw.error_log ?? []) {
      const upd = e.matrix_update;
      if (!upd || typeof upd !== 'object' || !e.question) continue;
      const found = payload.items.find((i) => i.prompt === e.question);
      if (!found?.cellRef) continue;
      const m = payload.matrices.find((x) => x.id === found.cellRef!.matrixId)!;
      expect(m).toBeDefined();
      expect(m.rows.find((r) => r.id === found.cellRef!.rowId)!.label).toBe(upd.row);
      expect(m.columns.find((c) => c.id === found.cellRef!.columnId)!.key).toBe(upd.column);
    }
  });

  it('pins the compression ladder rather than dropping it', () => {
    const l2 = raw.compression?.l2 ?? [];
    const l3 = raw.compression?.l3 ?? [];
    const pinned = payload.items.filter((i) => i.pinned);
    expect(pinned.length).toBeGreaterThanOrEqual(l2.length + l3.length);
    for (const line of l3) {
      expect(payload.items.some((i) => i.legacy && (i.legacy as any).raw === line)).toBe(true);
    }
  });

  it('parks unmapped exam metadata in legacy instead of discarding it', () => {
    const legacy = payload.exams[0]!.legacy as Record<string, unknown> | undefined;
    for (const key of ['blueprint', 'passing', 'authority', 'what_it_tests', 'high_yield']) {
      if (raw.exam[key] !== undefined) {
        expect(legacy?.[key], `exam.${key}`).toEqual(raw.exam[key]);
      }
    }
  });

  it('gives every item and matrix a unique id', () => {
    const ids = [...payload.items, ...payload.matrices, ...payload.topics].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never fabricates retrieval history', () => {
    expect(payload.reviews).toEqual([]);
    expect(payload.cellStats).toEqual([]);
  });
});

describe('malformed and partial input', () => {
  it('survives a half-filled template where keys have no values', () => {
    const half = {
      exam: { name: '반쯤 채운 시험', lang: 'ko', authority: null, subjects: null },
      topics: [{ id: 'a', title: '주제', archetype: 'concept', matrix: { rows: [{ label: 'X' }] } }],
    };
    const { payload } = migrate(half);
    expect(payload.exams[0]!.title).toBe('반쯤 채운 시험');
    expect(payload.topics).toHaveLength(1);
  });

  it('handles a topic with no matrix at all', () => {
    const { payload } = migrate({
      exam: { name: 'x' },
      topics: [{ id: 'a', title: '주제', archetype: 'concept', one_sentence: '한 문장' }],
    });
    expect(payload.matrices).toHaveLength(0);
    expect(payload.items.some((i) => i.answer === '한 문장')).toBe(true);
  });

  it('drops an error-log row that has neither question nor answer, keeping the rest', () => {
    const { payload } = migrate({
      exam: { name: 'x' },
      topics: [{ id: 'a', title: 't', archetype: 'concept', matrix: { rows: [{ label: 'r' }] } }],
      error_log: [{ date: '2026-01-01' }, { question: '진짜 문제', correct: '진짜 답' }],
    });
    expect(payload.items.filter((i) => i.lapses === 1)).toHaveLength(1);
  });

  it('tolerates an unknown cell reference without throwing', () => {
    expect(() => migrate({
      exam: { name: 'x' },
      topics: [{
        id: 'a', title: 't', archetype: 'concept',
        matrix: { columns: [{ key: 'k', label_ko: 'K' }], rows: [{ label: 'r', cells: { k: 'v' } }] },
        evidence: [{ cell: { row: '없는행', column: 'k' }, tested_as: '표현' }],
      }],
    })).not.toThrow();
  });

  it('reports a parse failure in Korean rather than a stack trace', () => {
    expect(() => inspect('{ not: valid', 'x.json')).toThrow(/읽지 못했습니다|알아볼 수 없는/);
    expect(() => inspect('', 'x.json')).toThrow(/비어 있습니다/);
  });
});

describe('the browser editor’s localStorage save', () => {
  /** The shape `legacy/editor/editor.html` actually wrote: lists as strings. */
  const editorState = {
    exam: {
      name: '옛날 시험', lang: 'ko', date: '2026-05-05',
      subjects: '과목 하나\n과목 둘', sources: '', what_it_tests: '',
      high_yield: '', weak: '', volatile: '', blueprint: [],
    },
    topics: [{
      id: 'tcp-udp', title: 'TCP vs UDP', archetype: 'it',
      one_sentence: 'TCP는 연결을 먼저 맺는다',
      essentials: ['핵심 하나', '핵심 둘', '', '', ''],
      prerequisites: 'a, b',
      matrix: {
        row_label: '프로토콜',
        columns: [
          { key: 'header', label_ko: '헤더 크기', mark: 'trap' },
          { key: 'order', label_ko: '순서 보장', mark: 'distinction' },
        ],
        rows: [
          { label: 'TCP', cells: { header: { v: '20바이트', mark: 'trap' }, order: { v: '보장' } } },
          { label: 'UDP', cells: { header: { v: '8바이트' }, order: { v: '미보장' } } },
        ],
      },
      decisive: { answer: '연결 수립 여부', pairs: [{ a: 'TCP', b: 'UDP', why: '둘 다 전송계층', clue: '핸드셰이크' }] },
      traps: [{ cue: 'UDP는 항상 빠르다', usually: '보통 빠르다', exception: '손실 재전송이 필요하면 아니다', why: '재전송 비용' }],
      evidence: [],
    }],
    error_log: [{ date: '2026-02-01', question: '헤더 크기는?', correct: '20바이트', mine: '8바이트', error_type: 'confused-pair', topic: 'tcp-udp', matrix_update: { topic: 'tcp-udp', row: 'TCP', column: 'header' } }],
    compression: { l2: [{ item: 'TCP 헤더', detail: '20바이트' }], l3: '핸드셰이크 3-way\n포트 번호 범위' },
    ui: { step: 5, mode: 'easy', topic: 0 },
  };

  it('flattens the editor’s textarea strings back into lists', () => {
    const file = normalizeEditorState(editorState);
    expect(file.exam!.subjects).toEqual(['과목 하나', '과목 둘']);
    expect(file.compression!.l3).toEqual(['핸드셰이크 3-way', '포트 번호 범위']);
    expect((file.topics![0] as any).essentials).toEqual(['핵심 하나', '핵심 둘']);
  });

  it('migrates end to end through the same v1 path', () => {
    const { payload } = migrate(editorState);
    expect(payload.exams[0]!.title).toBe('옛날 시험');
    expect(payload.subjects.map((s) => s.title)).toEqual(['과목 하나', '과목 둘']);
    expect(payload.matrices).toHaveLength(1);
    expect(payload.matrices[0]!.rows.map((r) => r.label)).toEqual(['TCP', 'UDP']);

    const err = payload.items.find((i) => i.prompt === '헤더 크기는?')!;
    expect(err.lapses).toBe(1);
    expect(err.confusionNote).toContain('8바이트');
    expect(err.cellRef).toBeDefined();
    expect(payload.items.filter((i) => i.pinned)).toHaveLength(3);
  });

  it('reads the real storage key, and ignores an empty or broken save', () => {
    const store: Record<string, string> = {};
    const fake = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
    } as unknown as Storage;

    expect(readLegacyLocalStorage(fake)).toBeNull();
    fake.setItem(LEGACY_STORAGE_KEY, 'not json');
    expect(readLegacyLocalStorage(fake)).toBeNull();
    fake.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ exam: { name: '' }, topics: [] }));
    expect(readLegacyLocalStorage(fake)).toBeNull();
    fake.setItem(LEGACY_STORAGE_KEY, JSON.stringify(editorState));
    expect(readLegacyLocalStorage(fake)).not.toBeNull();
  });
});

describe('conversion is deterministic apart from ids', () => {
  it('produces the same content twice for the same input', () => {
    const raw = load(files[0]!);
    const strip = (o: unknown) =>
      JSON.parse(JSON.stringify(o), (k, v) =>
        (k === 'id' || k === 'examId' || k === 'topicId' || k === 'matrixId'
          || k === 'rowId' || k === 'columnId' || k === 'aId' || k === 'bId'
          || k === 'confusedWithIds' || k === 'cells')
          ? undefined : v);
    const a = convertLegacyExamFile(raw, { now: NOW });
    const b = convertLegacyExamFile(raw, { now: NOW });
    expect(strip(a)).toEqual(strip(b));
  });
});
