#!/usr/bin/env node
/**
 * Builds legacy/editor/editor.html from legacy/editor/editor.template.html.
 *
 * Inlines two things, because the editor must work when opened straight from
 * the filesystem — no server, no npm, no network, which rules out both a CDN
 * and ES-module imports (file:// blocks those):
 *
 *   1. js-yaml, for the Load button's parser.
 *   2. The real renderer — the same archetypes, layout engine, recall generator
 *      and page templates the Node build uses, plus src/pdf/print.css. This is what
 *      lets the browser produce the actual PDF via the print dialog instead of
 *      handing the learner a YAML file and a terminal command.
 *
 * Bundling is a concatenation of ES modules with their import/export syntax
 * stripped, wrapped in an IIFE so nothing leaks into the editor's own scope
 * (both define `esc`, for one). The modules were split so this works: nothing
 * in the list below touches fs, ajv or js-yaml.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/** Dependency order. Every one of these must be free of Node built-ins. */
const MODULES = [
  'src/pdf/lib/text.js',
  'src/pdf/lib/archetypes.js',
  'src/pdf/lib/normalize.js',
  'src/pdf/lib/layout.js',
  'src/pdf/lib/recall.js',
  'src/pdf/render.js',
];

/** What the editor needs off the bundle. */
const EXPORTS = [
  'renderDocument', 'footerTemplate', 'EDITIONS',
  'normalizeExam', 'stripEmpty',
  'applyRecall', 'ARCHETYPES', 'ARCHETYPE_KEYS', 'MARKERS', 'defaultColumns',
];

/** Strip ESM syntax. The modules are hand-written and use only single-line forms. */
function toScript(src, file) {
  const out = [];
  for (const line of src.split('\n')) {
    if (/^\s*import\s.*from\s+['"].*['"];?\s*$/.test(line)) continue;
    if (/^\s*export\s*\{[^}]*\}\s*from\s+['"].*['"];?\s*$/.test(line)) continue;
    if (/^\s*export\s*\{[^}]*\};?\s*$/.test(line)) continue;
    out.push(line.replace(/^(\s*)export\s+(const|let|function|class|async)\b/, '$1$2'));
  }
  const text = out.join('\n');
  // A leftover `import`/`export` keyword would be a silent syntax error in the
  // browser, so fail the build here instead.
  const bad = text.match(/^\s*(import|export)\s/m);
  if (bad) throw new Error(`${file}: unstripped ESM syntax near "${bad[0].trim()}"`);
  return text;
}

const bundleBody = MODULES
  .map((f) => `\n/* ==== ${f} ==== */\n` + toScript(fs.readFileSync(path.join(ROOT, f), 'utf8'), f))
  .join('\n');

const css = fs.readFileSync(path.join(ROOT, 'src', 'pdf', 'print.css'), 'utf8');

const renderer = `/*! Exam Matrix renderer — bundled from src/. Do not edit by hand;
 * regenerate with: node scripts/build-editor.js */
var ExamMatrix = (function () {
${bundleBody}
  return { ${EXPORTS.join(', ')}, CSS: ${JSON.stringify(css)} };
})();
`;

const libPath = path.join(ROOT, 'node_modules', 'js-yaml', 'dist', 'js-yaml.min.js');
if (!fs.existsSync(libPath)) {
  console.error('js-yaml not found — run `npm install` first.');
  process.exit(1);
}
const lib = fs.readFileSync(libPath, 'utf8');
const version = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'node_modules', 'js-yaml', 'package.json'), 'utf8')
).version;
const yamlBanner = `/*! js-yaml ${version} — MIT License — https://github.com/nodeca/js-yaml
 * Vendored so this file works offline from file://. */\n`;

let out = fs.readFileSync(path.join(ROOT, 'legacy', 'editor', 'editor.template.html'), 'utf8');
for (const [token, payload] of [['/*JSYAML*/', yamlBanner + lib], ['/*RENDERER*/', renderer]]) {
  if (!out.includes(token)) throw new Error(`Placeholder ${token} not found in the template.`);
  out = out.replace(token, () => payload);
}

const dest = path.join(ROOT, 'legacy', 'editor', 'editor.html');
fs.writeFileSync(dest, out);
console.log(`  legacy/editor/editor.html   ${(out.length / 1024).toFixed(0)} KB`);
console.log(`  bundled: js-yaml ${version}, ${MODULES.length} renderer modules, styles.css`);
