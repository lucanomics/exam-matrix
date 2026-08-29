/**
 * Study-item construction and small pure helpers over it.
 *
 * One factory, used by Quick Capture, by every importer and by the sample
 * data, so an item created three different ways cannot end up with three
 * different defaults.
 */

import type {
  ID, IntakeReason, ItemSource, ItemType, MarkerKey, StudyItem,
} from './models.ts';
import { newId } from './ids.ts';

export interface NewItemInput {
  examId: ID;
  prompt: string;
  answer: string;
  subjectId?: ID;
  topicId?: ID;
  rationale?: string;
  correctedStatement?: string;
  examinerWording?: string;
  source?: Partial<ItemSource>;
  itemType?: ItemType;
  intakeReason?: IntakeReason;
  markers?: MarkerKey[];
  tags?: string[];
  decisiveDistinction?: string;
  confusionNote?: string;
  cellRef?: StudyItem['cellRef'];
  /** Anything an importer could not map. Preserved verbatim (§7). */
  legacy?: unknown;
  createdAt?: string;
  id?: ID;
}

/**
 * A captured item starts due immediately. That is the point: something the
 * learner just got wrong should be answerable again today, not tomorrow.
 */
export function createItem(input: NewItemInput): StudyItem {
  const stamp = input.createdAt ?? new Date().toISOString();
  return {
    id: input.id ?? newId('item_'),
    examId: input.examId,
    ...(input.subjectId ? { subjectId: input.subjectId } : {}),
    ...(input.topicId ? { topicId: input.topicId } : {}),
    source: { type: 'other', ...input.source },
    prompt: input.prompt.trim(),
    answer: input.answer.trim(),
    ...(input.rationale?.trim() ? { rationale: input.rationale.trim() } : {}),
    ...(input.correctedStatement?.trim() ? { correctedStatement: input.correctedStatement.trim() } : {}),
    ...(input.examinerWording?.trim() ? { examinerWording: input.examinerWording.trim() } : {}),
    itemType: input.itemType ?? inferItemType(input.answer),
    intakeReason: input.intakeReason ?? 'manual',
    markers: input.markers ?? [],
    tags: input.tags ?? [],
    confusedWithIds: [],
    ...(input.decisiveDistinction?.trim() ? { decisiveDistinction: input.decisiveDistinction.trim() } : {}),
    ...(input.confusionNote?.trim() ? { confusionNote: input.confusionNote.trim() } : {}),
    ...(input.cellRef ? { cellRef: input.cellRef } : {}),
    status: 'inbox',
    step: 0,
    streak: 0,
    lapses: 0,
    reviewCount: 0,
    createdAt: stamp,
    updatedAt: stamp,
    nextReviewAt: stamp,
    ...(input.legacy !== undefined ? { legacy: input.legacy } : {}),
  };
}

/** O/X answers are common enough to be worth detecting rather than asking about. */
export function inferItemType(answer: string): ItemType {
  const a = answer.trim().toUpperCase();
  if (['O', 'X', '○', '×', 'ㅇ', 'Ｏ', 'Ｘ'].includes(a)) return 'ox';
  if (a.length <= 20 && !a.includes('\n')) return 'short_answer';
  return 'concept_prompt';
}

/** True when the two strings are the same answer, modulo the ways people type. */
export function answersMatch(submitted: string, expected: string): boolean {
  const clean = (s: string) =>
    s.trim().toLowerCase()
      .replace(/[○ㅇＯ]/g, 'o')
      .replace(/[×ㄨＸ]/g, 'x')
      .replace(/[\s.,·・、，。]/g, '');
  const a = clean(submitted);
  const b = clean(expected);
  if (!a) return false;
  return a === b;
}

/** A one-line label for lists. Prompts can be long; lists cannot. */
export function itemLabel(item: StudyItem, max = 70): string {
  const s = item.prompt.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export const isOX = (item: StudyItem): boolean => item.itemType === 'ox';
