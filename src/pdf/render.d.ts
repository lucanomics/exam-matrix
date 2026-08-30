import type { ExamModel } from './lib/normalize.d.ts';
export type Edition = 'full' | 'recall' | 'key';
export declare const EDITIONS: Record<Edition, { file: string }>;
export declare function renderDocument(model: ExamModel, edition: Edition, css: string): string;
export declare function footerTemplate(model: ExamModel, edition: Edition): string;
