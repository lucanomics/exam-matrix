#!/usr/bin/env node
/**
 * Post-build: fold the artefacts that are not part of the Vite graph into
 * dist/.
 *
 *   output/**.pdf        → dist/files/    the committed PDFs. They need Chromium
 *                                         and CJK fonts to generate, which a
 *                                         serverless build image has neither of,
 *                                         so they are built locally and
 *                                         committed — the same arrangement the
 *                                         original site build used.
 *   legacy/editor/*.html → dist/legacy-editor.html
 *                                         the previous single-file editor, kept
 *                                         reachable until the rebuild has been
 *                                         in use long enough to be trusted.
 *
 *   node scripts/build-static.js
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found — run `vite build` first.');
  process.exit(1);
}

function copyTree(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let n = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) n += copyTree(s, d);
    else { fs.copyFileSync(s, d); n++; }
  }
  return n;
}

const pdfs = copyTree(path.join(ROOT, 'output'), path.join(DIST, 'files'));

const editor = path.join(ROOT, 'legacy', 'editor', 'editor.html');
if (fs.existsSync(editor)) {
  fs.copyFileSync(editor, path.join(DIST, 'legacy-editor.html'));
}

console.log(`  dist/files/            ${pdfs} file${pdfs === 1 ? '' : 's'}`);
console.log(`  dist/legacy-editor.html ${fs.existsSync(editor) ? 'copied' : 'skipped (not built)'}`);
