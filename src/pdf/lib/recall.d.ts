import type { ExamModel } from './normalize.d.ts';
export declare const DIFFICULTY_GLYPH: Record<'high' | 'mid' | 'low', string>;
export declare function applyRecall(model: ExamModel): Array<{
  topic: any;
  items: Array<{ ref: number; where: string; answer: string; difficulty: 'high' | 'mid' | 'low' }>;
}>;
