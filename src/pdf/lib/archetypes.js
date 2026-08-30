/**
 * Level 2 of the schema: exam-type-specific column sets.
 *
 * These are *defaults*, not a fixed vocabulary. A topic that declares its own
 * `matrix.columns` overrides this entirely (Level 3) — which is the intended
 * usage, because the axes must match what the exam actually discriminates.
 *
 * `default: true` columns are used when a topic names an archetype but no
 * columns. The rest are documented suggestions surfaced by `npm run init`.
 *
 * `mark` seeds the semantic marker for cells in that column; individual cells
 * override it. See MARKERS below.
 */

/** Semantic markers. Redundantly encoded: label + border + tint (never colour alone). */
export const MARKERS = {
  core: { code: 'CORE', label_ko: '기본', sigil: '' },
  distinction: { code: 'DIST', label_ko: '갈림', sigil: '◆' },
  exception: { code: 'EXC', label_ko: '예외', sigil: '▲' },
  trap: { code: 'TRAP', label_ko: '함정', sigil: '■' },
  update: { code: 'UPD', label_ko: '개정', sigil: '↻' },
  evidence: { code: 'EVD', label_ko: '근거', sigil: '§' },
};

/** Retrieval difficulty implied by a marker — drives the Recall Edition. */
export const MARKER_DIFFICULTY = {
  trap: 'high',
  exception: 'high',
  distinction: 'mid',
  update: 'mid',
  core: 'low',
  evidence: 'low',
};

const col = (key, label, label_ko, mark = 'core', isDefault = true) => ({
  key, label, label_ko, mark, default: isDefault,
});

export const ARCHETYPES = {
  concept: {
    label: 'Concept / Theory',
    label_ko: '개념 · 이론',
    row_label: 'Concept',
    row_label_ko: '개념',
    blurb: 'Social science, management, psychology, education, general theory.',
    columns: [
      col('definition', 'One-line definition', '한 줄 정의'),
      col('criterion', 'Defining criterion', '판단 기준', 'distinction'),
      col('characteristics', 'Key characteristics', '주요 특징'),
      col('decisive', 'Decisive distinction', '결정적 차이', 'distinction'),
      col('exception', 'Exception', '예외', 'exception'),
      col('trap', 'Common trap', '빈출 함정', 'trap'),
      col('purpose', 'Purpose', '목적', 'core', false),
      col('compared_with', 'Compared with', '비교 대상', 'distinction', false),
      col('wording', 'Tested wording', '기출 표현', 'evidence', false),
      col('source', 'Evidence', '근거', 'evidence', false),
    ],
  },

  law: {
    label: 'Law / Regulation / Public Administration',
    label_ko: '법령 · 규정 · 행정',
    row_label: 'Rule / doctrine',
    row_label_ko: '제도 · 법리',
    blurb: 'Statute-based exams. Version dates are mandatory: law changes.',
    columns: [
      col('basis', 'Legal basis', '법적 근거', 'evidence'),
      col('subject', 'Subject / party', '주체'),
      col('requirements', 'Requirements', '요건', 'distinction'),
      col('effect', 'Effect', '효과'),
      col('period', 'Deadline / period', '기간 · 기한', 'trap'),
      col('exception', 'Exception', '예외', 'exception'),
      col('authority', 'Competent authority', '관할', 'core', false),
      col('procedure', 'Procedure', '절차', 'core', false),
      col('confusion', 'Prohibited confusion', '혼동 금지', 'trap', false),
      col('as_of', 'Version date', '기준 시점', 'update', false),
    ],
  },

  calculation: {
    label: 'Calculation / Engineering / Finance',
    label_ko: '계산 · 공학 · 재무',
    row_label: 'Formula / method',
    row_label_ko: '공식 · 기법',
    blurb: 'The discrimination is "which method, and when" — not "what does it mean".',
    columns: [
      col('meaning', 'What it gives you', '의미'),
      col('variables', 'Variables & units', '변수 · 단위', 'trap'),
      col('prerequisites', 'Prerequisites', '적용 전제', 'distinction'),
      col('when', 'When to use', '사용 시점', 'distinction'),
      col('mistake', 'Common mistake', '빈출 실수', 'trap'),
      col('similar', 'Similar formula', '유사 공식', 'exception'),
      col('sequence', 'Calculation sequence', '계산 순서', 'core', false),
      col('shortcut', 'Shortcut', '단축 계산', 'core', false),
      col('trigger', 'Question trigger', '문제 신호어', 'evidence', false),
      col('verify', 'Verification', '검산법', 'core', false),
    ],
  },

  it: {
    label: 'IT / Computer Certification',
    label_ko: 'IT · 정보처리',
    row_label: 'Technology / command',
    row_label_ko: '기술 · 명령어',
    blurb: 'Protocols, commands, architectures. Version-sensitive.',
    columns: [
      col('purpose', 'Purpose', '용도'),
      col('mechanism', 'Syntax / mechanism', '동작 · 문법', 'distinction'),
      col('prerequisite', 'Prerequisite', '전제 조건'),
      col('result', 'Output / result', '결과'),
      col('limitation', 'Limitation', '한계', 'exception'),
      col('trap', 'Exam trap', '시험 함정', 'trap'),
      col('category', 'Category / layer', '분류 · 계층', 'core', false),
      col('advantage', 'Advantage', '장점', 'core', false),
      col('similar', 'Similar concept', '유사 개념', 'distinction', false),
      col('example', 'Practical example', '실무 예시', 'evidence', false),
    ],
  },

  language: {
    label: 'Language',
    label_ko: '어학',
    row_label: 'Expression',
    row_label_ko: '표현',
    blurb: 'Register and collocation are what separate near-synonyms.',
    columns: [
      col('meaning', 'Meaning', '의미'),
      col('function', 'Grammar / function', '문법 · 기능'),
      col('register', 'Register', '격식 · 어감', 'distinction'),
      col('collocation', 'Collocation', '연어'),
      col('contrast', 'Contrast with', '대조 표현', 'distinction'),
      col('error', 'Common error', '빈출 오류', 'trap'),
      col('exception', 'Exception', '예외', 'exception', false),
      col('example', 'Example', '예문', 'evidence', false),
      col('cue', 'Recall cue', '암기 단서', 'core', false),
    ],
  },

  procedure: {
    label: 'Practical / Procedure',
    label_ko: '실기 · 절차',
    row_label: 'Task',
    row_label_ko: '작업',
    blurb: 'Order matters, and examiners test order.',
    columns: [
      col('trigger', 'Trigger', '착수 조건'),
      col('steps', 'Step sequence', '단계 순서', 'distinction'),
      col('checkpoint', 'Checkpoint', '확인 지점'),
      col('error_condition', 'Error condition', '오류 상황', 'exception'),
      col('recovery', 'Recovery', '복구 조치', 'exception'),
      col('examiner_trap', 'Examiner trap', '감독관 함정', 'trap'),
      col('equipment', 'Equipment / input', '장비 · 준비물', 'core', false),
      col('completion', 'Completion criterion', '완료 기준', 'core', false),
      col('safety', 'Safety / constraint', '안전 · 제약', 'trap', false),
    ],
  },
};

export const ARCHETYPE_KEYS = Object.keys(ARCHETYPES);

/** Default (L2) columns for an archetype, used when a topic declares none. */
export function defaultColumns(archetype) {
  const a = ARCHETYPES[archetype];
  if (!a) throw new Error(`Unknown archetype: ${archetype}`);
  return a.columns.filter((c) => c.default);
}

export function archetypeRowLabel(archetype, lang = 'en') {
  const a = ARCHETYPES[archetype];
  if (!a) return lang === 'ko' ? '항목' : 'Item';
  return lang === 'ko' ? a.row_label_ko : a.row_label;
}
