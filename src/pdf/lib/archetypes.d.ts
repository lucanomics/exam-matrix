export type MarkerKey = 'core' | 'distinction' | 'exception' | 'trap' | 'update' | 'evidence';
export type ArchetypeKey = 'concept' | 'law' | 'calculation' | 'it' | 'language' | 'procedure';

export interface MarkerDef { code: string; label_ko: string; sigil: string }
export interface ArchetypeColumn {
  key: string; label: string; label_ko: string; mark: MarkerKey; default: boolean;
}
export interface ArchetypeDef {
  label: string; label_ko: string; row_label: string; row_label_ko: string;
  blurb: string; columns: ArchetypeColumn[];
}

export declare const MARKERS: Record<MarkerKey, MarkerDef>;
export declare const MARKER_DIFFICULTY: Record<MarkerKey, 'high' | 'mid' | 'low'>;
export declare const ARCHETYPES: Record<ArchetypeKey, ArchetypeDef>;
export declare const ARCHETYPE_KEYS: ArchetypeKey[];
export declare function defaultColumns(archetype: ArchetypeKey): ArchetypeColumn[];
export declare function archetypeRowLabel(archetype: ArchetypeKey, lang?: 'en' | 'ko'): string;
