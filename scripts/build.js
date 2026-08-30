#!/usr/bin/env node
/**
 * Builds PDFs from exam YAML.
 *
 *   node scripts/build.js                    # every example
 *   node scripts/build.js examples/law.yaml  # one file
 *   node scripts/build.js --primary law      # which example owns the canonical filenames
 *   node scripts/build.js --html             # also keep the intermediate HTML
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { loadExam } from '../src/pdf/model.node.js';
import { applyRecall } from '../src/pdf/lib/recall.js';
import { renderDocument, footerTemplate, EDITIONS } from '../src/pdf/render.js';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'output');
const CSS = fs.readFileSync(path.join(ROOT, 'src', 'pdf', 'print.css'), 'utf8');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? true) : dflt;
};
const keepHtml = argv.includes('--html');
const primary = flag('primary', 'it');
const files = argv.filter((a) => a.endsWith('.yaml') || a.endsWith('.yml'));

const targets = files.length
  ? files
  : fs.readdirSync(path.join(ROOT, 'examples'))
      .filter((f) => f.endsWith('.yaml'))
      .map((f) => path.join('examples', f));

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'examples'), { recursive: true });

const browser = await chromium.launch();
const allWarnings = [];
let built = 0;

for (const file of targets) {
  const name = path.basename(file).replace(/\.ya?ml$/, '');
  const isPrimary = name === primary;

  // The recall edition mutates the model (marking cells withheld), so the full
  // edition gets its own instance. Recall and key share one, which is what
  // keeps the numbering in the key valid.
  const full = loadExam(file);
  const recall = loadExam(file);
  applyRecall(recall);

  full.warnings.forEach((w) => allWarnings.push(`${name}: ${w}`));

  const jobs = [
    ['full', full],
    ['recall', recall],
    ['key', recall],
  ];

  for (const [edition, model] of jobs) {
    const html = renderDocument(model, edition, CSS);
    const base = EDITIONS[edition].file;
    const dest = isPrimary
      ? path.join(OUT, base)
      : path.join(OUT, 'examples', `${name}-${base}`);

    if (keepHtml) {
      fs.writeFileSync(dest.replace(/\.pdf$/, '.html'), html);
    }

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: dest,
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: footerTemplate(model, edition),
    });
    await page.close();

    const kb = (fs.statSync(dest).size / 1024).toFixed(0);
    console.log(`  ${isPrimary ? '★' : ' '} ${path.relative(ROOT, dest).padEnd(58)} ${kb.padStart(5)} KB`);
    built++;
  }

  // L3 must stay short enough to actually read in ten minutes.
  const l3 = full.compression?.l3?.length ?? 0;
  if (l3 > 24) allWarnings.push(`${name}: L3 has ${l3} items — that is no longer a last-10-minutes sheet.`);
}

await browser.close();

if (allWarnings.length) {
  console.log('\nWarnings:');
  allWarnings.forEach((w) => console.log(`  ! ${w}`));
}
console.log(`\n${built} PDFs written to output/  (primary: ${primary})`);
