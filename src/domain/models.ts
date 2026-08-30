/**
 * The domain vocabulary.
 *
 * Everything the learner owns is described here, and nothing in this file
 * knows about React, IndexedDB, or the PDF renderer. Storage adapters and UI
 * both depend on these types; they never depend on each other.
 *
 * The marker vocabulary (`core`/`distinction`/`exception`/`trap`/`update`/
 * `evidence`) is deliberately re-exported from the preserved PDF engine rather
 * than redeclared, so a marker can never mean one thing on screen and another
 * on paper.
 */

import type { MarkerKey, ArchetypeKey } from '../pdf/lib/archetypes.js';

export type { MarkerKey, ArchetypeKey };

export type ID = string;
/** ISO-8601 instant. Stored as a string so a backup file stays readable. */
export type Timestamp = string;

/* ------------------------------------------------------------------ exam -- */

export interface Exam {
  id: ID;
  title: string;
  /** YYYY-MM-DD. Absent means "no date set", which is allowed. */
  examDate?: string;
  description?: string;
  /** Marks the bundled illustrative data so it can be labelled and removed. */
  isSample?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /**
   * Exam-level fields an import could not map — blueprint weights, pass marks,
   * syllabus versions. Kept verbatim so no legacy file loses information (§7).
   */
  legacy?: unknown;
}

export interface Subject {
  id: ID;
  examId: ID;
  title: string;
  order: number;
}

/**
 * Topics nest, but shallowly. Two levels cover 관광국사 → 조선 → 정치제도
 * without turning capture into an outliner exercise.
 */
export interface Topic {
  id: ID;
  examId: ID;
  subjectId?: ID;
  parentId?: ID;
  title: string;
  order: number;
}

/* ------------------------------------------------------------ study item -- */

export type ItemType =
  | 'short_answer'
  | 'ox'
  | 'statement_judgement'
  | 'comparison'
  | 'fill_blank'
  | 'concept_prompt';

/**
 * Why this entered the system. Principle B: only unstable knowledge gets in,
 * and *how* it became unstable changes how it should be practised.
 */
export type IntakeReason =
  | 'wrong'
  | 'guessed_right'
  | 'unsure_right'
  | 'too_slow'
  | 'confused_pair'
  | 'missed_exception'
  | 'wording_trap'
  | 'reason_unclear'
  | 'manual';

export type ItemStatus = 'inbox' | 'active' | 'stable' | 'mastered' | 'archived';

export type SourceType =
  | 'textbook'
  | 'past_paper'
  | 'mock'
  | 'lecture'
  | 'handout'
  | 'other';

export interface ItemSource {
  type: SourceType;
  /** 교재명, 기출 회차, 강의명 … */
  title?: string;
  page?: string;
  questionNumber?: string;
  /** 기출 연도. Kept as a string: "2024", "2024-1회" are both real. */
  year?: string;
  choiceNumber?: string;
  url?: string;
}

/** Points at one cell of one matrix. The original repo's best idea. */
export interface CellRef {
  matrixId: ID;
  rowId: ID;
  columnId: ID;
}

export interface StudyItem {
  id: ID;
  examId: ID;
  subjectId?: ID;
  topicId?: ID;

  source: ItemSource;

  /** Shown alone. The answer must never travel with it to the screen. */
  prompt: string;
  answer: string;
  /** Why the answer is what it is. An O/X label alone is not enough. */
  rationale?: string;
  /** For a false statement: the same sentence, made true. */
  correctedStatement?: string;
  /** How the examiner phrased it. Content, not metadata. */
  examinerWording?: string;

  itemType: ItemType;
  intakeReason: IntakeReason;
  markers: MarkerKey[];
  tags: string[];

  /** Symmetric in meaning; the relation table is the authority. Cached here. */
  confusedWithIds: ID[];
  decisiveDistinction?: string;
  confusionNote?: string;

  cellRef?: CellRef;

  status: ItemStatus;
  /** Index into REVIEW_LADDER. See domain/review/scheduler.ts. */
  step: number;
  /** Consecutive confident-correct retrievals. Drives promotion to 안정. */
  streak: number;
  /** Total wrong answers, ever. Drives the 반복해서 틀린 것 list. */
  lapses: number;
  reviewCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastReviewedAt?: Timestamp;
  nextReviewAt?: Timestamp;
  /** Manually kept for the exam-eve sheet. */
  pinned?: boolean;

  /**
   * Anything an import could not map. Never silently dropped — §7.
   */
  legacy?: unknown;
}

/* ---------------------------------------------------------- confusion ----- */

export type ConfusionKind =
  | 'confused_with'
  | 'exception_to'
  | 'commonly_mistaken_for'
  | 'contrasts_with';

export interface ConfusionRelation {
  id: ID;
  examId: ID;
  aId: ID;
  bId: ID;
  kind: ConfusionKind;
  note?: string;
  createdAt: Timestamp;
}

/* -------------------------------------------------------------- matrix ---- */

export interface MatrixColumn {
  id: ID;
  /** Stable machine key, used when handing the matrix to the PDF engine. */
  key: string;
  label: string;
  marker: MarkerKey;
}

export interface MatrixCell {
  value: string;
  marker?: MarkerKey;
  note?: string;
}

export interface MatrixRow {
  id: ID;
  label: string;
  sub?: string;
  /** Optional link back to the item this row stands for. */
  itemId?: ID;
  cells: Record<ID, MatrixCell>;
}

export interface Matrix {
  id: ID;
  examId: ID;
  subjectId?: ID;
  topicId?: ID;
  title: string;
  rowLabel: string;
  archetype: ArchetypeKey;
  columns: MatrixColumn[];
  rows: MatrixRow[];
  note?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Per-cell retrieval history. Kept as its own record rather than derived on
 * every render, because §43 wants a failed cell to visibly change colour and
 * to bias the queue — both are read paths that must stay instant.
 */
export interface CellStat {
  /** `${matrixId}:${rowId}:${columnId}` */
  id: string;
  matrixId: ID;
  rowId: ID;
  columnId: ID;
  examId: ID;
  attempts: number;
  misses: number;
  lastAttemptAt?: Timestamp;
  lastMissAt?: Timestamp;
}

/* -------------------------------------------------------- review event ---- */

/** 1 찍음 · 2 애매함 · 3 아는 것 같음 · 4 확실함 */
export type Confidence = 1 | 2 | 3 | 4;

/**
 * The four quadrants of §23. `unsure_correct` is the one the product exists
 * for; `confident_wrong` is the one that costs marks.
 */
export type ResultClass =
  | 'confident_correct'
  | 'unsure_correct'
  | 'unsure_wrong'
  | 'confident_wrong';

export type FailureReason =
  | 'did_not_know'
  | 'confused_with_similar'
  | 'missed_condition'
  | 'missed_exception'
  | 'fooled_by_wording'
  | 'weak_rationale'
  | 'careless'
  | 'other';

export type DrillMode =
  | 'today'
  | 'wrong_only'
  | 'unsure_correct'
  | 'traps'
  | 'exceptions'
  | 'subject'
  | 'topic'
  | 'source'
  | 'matrix'
  | 'confusion'
  | 'exam_eve'
  | 'all';

export interface ReviewEvent {
  id: ID;
  itemId: ID;
  examId: ID;
  reviewedAt: Timestamp;
  submittedAnswer?: string;
  correct: boolean;
  confidence: Confidence;
  responseTimeMs?: number;
  resultClass: ResultClass;
  /** True when the answer was right but took long enough to count as unstable. */
  slow: boolean;
  failureReason?: FailureReason;
  /** The ladder step and interval this event produced. */
  stepAfter: number;
  intervalDays: number;
  nextReviewAt: Timestamp;
  mode: DrillMode;
  /** Set when the retrieval was a matrix cell rather than a standalone item. */
  cellRef?: CellRef;
}

/* ------------------------------------------------------------ settings ---- */

export interface Settings {
  id: 'settings';
  activeExamId?: ID;
  /** Items per drill session before the wrap-up screen. */
  sessionSize: number;
  /** Correct answers slower than this count as unstable. */
  slowAnswerMs: number;
  /** Let 마스터 items resurface occasionally. */
  resurfaceMastered: boolean;
  onboarded: boolean;
  theme: 'system' | 'light' | 'dark';
}

export interface Meta {
  id: 'meta';
  schemaVersion: number;
  createdAt: Timestamp;
  /** Set once, when legacy editor data was found and converted. */
  legacyImportedAt?: Timestamp;
}

/* --------------------------------------------------------------- misc ----- */

/** The whole database, as a backup file carries it. */
export interface BackupPayload {
  format: 'exam-matrix-backup';
  schemaVersion: number;
  exportedAt: Timestamp;
  exams: Exam[];
  subjects: Subject[];
  topics: Topic[];
  items: StudyItem[];
  relations: ConfusionRelation[];
  matrices: Matrix[];
  reviews: ReviewEvent[];
  cellStats: CellStat[];
  settings?: Partial<Settings>;
}
