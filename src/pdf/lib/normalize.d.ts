/** The loose YAML-shaped source object the renderer consumes. */
export type RawExamFile = Record<string, unknown>;
/** The normalised model. Kept loose on purpose: the renderer owns its shape. */
export type ExamModel = Record<string, any>;

export declare function stripEmpty<T>(node: T): T;
export declare function normalizeExam(raw: RawExamFile, opts?: { today?: Date }): ExamModel;
