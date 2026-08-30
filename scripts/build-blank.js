#!/usr/bin/env node
/**
 * Builds the handwriting templates.
 *
 *   node scripts/build-blank.js
 *
 * Produces, per language:
 *   output/blank/exam-matrix-blank-<lang>.pdf   one workbook, PDF bookmarks on
 *   output/blank/<lang>/NN-<name>.pdf           one file per page type
 *
 * The single-page files exist because GoodNotes, Notability and Noteshelf all
 * import a one-page PDF as a reusable *template* — you then add that page as
 * many times as you need inside a notebook. A twelve-page workbook cannot be
 * used that way, so both forms are shipped.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { renderBlank, blankFooter, PAGE_ORDER, PAGE_LABELS } from '../src/pdf/blank.js';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'output', 'blank');
const css = fs.readFileSync(path.join(ROOT, 'src', 'pdf', 'print.css'), 'utf8');
const langs = ['ko', 'en'];

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let n = 0;

async function pdf(html, dest, lang, { footer = true } = {}) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: dest,
    printBackground: true,
    preferCSSPageSize: true,
    outline: true,          // bookmarks — how you navigate a workbook in GoodNotes
    displayHeaderFooter: footer,
    headerTemplate: '<div></div>',
    footerTemplate: footer ? blankFooter(lang) : '<div></div>',
  });
  await page.close();
  n++;
  console.log(`  ${path.relative(ROOT, dest).padEnd(56)} ${(fs.statSync(dest).size / 1024).toFixed(0).padStart(5)} KB`);
}

for (const lang of langs) {
  // Combined workbook.
  await pdf(renderBlank(lang, PAGE_ORDER, css),
    path.join(OUT, `exam-matrix-blank-${lang}.pdf`), lang);

  // One reusable template per page type.
  const dir = path.join(OUT, lang);
  fs.mkdirSync(dir, { recursive: true });
  for (const key of PAGE_ORDER) {
    // No running footer on single-page templates: a page number is noise when
    // the page is about to be duplicated thirty times inside a notebook.
    await pdf(renderBlank(lang, [key], css),
      path.join(dir, `${PAGE_LABELS[lang][key]}.pdf`), lang, { footer: false });
  }
}

await browser.close();
console.log(`\n${n} template PDFs written to output/blank/`);
