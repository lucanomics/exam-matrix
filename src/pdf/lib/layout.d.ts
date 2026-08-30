import type { ExamModel } from './normalize.d.ts';
export declare function planMatrix(matrix: any, edition?: 'full' | 'recall'): {
  orientation: 'portrait' | 'landscape';
  density: number;
  chunks: Array<{ columns: any[]; indices: number[]; index: number; total: number }>;
};
export declare function columnWidths(chunk: any, rows: any[], orientation: 'portrait' | 'landscape'): {
  label: string; cols: string[];
};
export type { ExamModel };
