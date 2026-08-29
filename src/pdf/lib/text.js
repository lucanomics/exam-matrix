/**
 * Pure text measurement. Kept separate from model.js so that layout.js and the
 * renderer can be bundled into the browser editor without dragging in fs, ajv
 * or js-yaml.
 */

/** Display width in half-width units: CJK/Hangul count double. */
export function visualLen(s = '') {
  let n = 0;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    n += (c >= 0x1100 && (
      c <= 0x115f ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6)
    )) ? 2 : 1;
  }
  return n;
}
