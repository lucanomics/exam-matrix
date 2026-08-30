/**
 * Identifiers. Time-ordered so that a plain sort by id is a sort by creation,
 * which keeps every "deterministic given the same data" claim in the domain
 * layer honest without a separate sequence column.
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomPart(len: number): string {
  const bytes = new Uint8Array(len);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

export function newId(prefix = ''): string {
  const t = Date.now().toString(36).padStart(9, '0');
  return `${prefix}${t}${randomPart(6)}`;
}

export const cellStatId = (matrixId: string, rowId: string, columnId: string): string =>
  `${matrixId}:${rowId}:${columnId}`;

/** Slug usable as a YAML topic id, for export. Falls back to a hash. */
export function slugify(input: string, fallback = 'topic'): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return /^[a-z0-9]/.test(s) ? s.slice(0, 48) : `${fallback}-${hash32(input).toString(36)}`;
}

/** FNV-1a. Same function the recall generator uses, kept for stable seeding. */
export function hash32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — small deterministic PRNG, matching src/pdf/lib/recall.js. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
