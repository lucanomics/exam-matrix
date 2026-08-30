#!/usr/bin/env node
/**
 * Editor regression tests.
 *
 *   node scripts/test-editor.js
 *
 * Two things are asserted, and both are load-bearing:
 *
 *   1. **Renderer parity.** The editor prints the PDF itself, from a bundled
 *      copy of src/. If that copy ever drifts from the Node build, a learner
 *      gets a document that differs from what the repository produces — and
 *      nothing would tell them. So the same YAML is rendered through both paths
 *      and compared byte for byte, for all three editions.
 *
 *   2. **The wizard reaches the end.** A first-timer walking the five steps must
 *      not hit a dead end. This drives the real UI and fails if the Next button
 *      stays disabled, a step does not advance, or the print path never fires.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import yaml from 'js-yaml';
import { stripEmpty, normalizeExam } from '../../src/pdf/lib/normalize.js';
import { applyRecall } from '../../src/pdf/lib/recall.js';
import { renderDocument } from '../../src/pdf/render.js';

const ROOT = process.cwd();
const CSS = fs.readFileSync(path.join(ROOT, 'src', 'pdf', 'print.css'), 'utf8');
const EDITOR = 'file://' + path.join(ROOT, 'legacy', 'editor', 'editor.html');

let failed = 0;
const ok = (name, pass, detail = '') => {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!pass) failed++;
};

const browser = await chromium.launch();

/* -------------------------------------------------- 1. renderer parity ---- */
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(EDITOR);
  await page.waitForTimeout(300);

  for (const example of fs.readdirSync(path.join(ROOT, 'examples')).filter((f) => f.endsWith('.yaml'))) {
    const src = fs.readFileSync(path.join(ROOT, 'examples', example), 'utf8');
    const got = await page.evaluate((text) => {
      importYaml(text);
      return { yaml: buildYaml(), full: makeHtml('full'), recall: makeHtml('recall'), key: makeHtml('key') };
    }, src);

    for (const edition of ['full', 'recall', 'key']) {
      const model = normalizeExam(stripEmpty(yaml.load(got.yaml)));
      if (edition !== 'full') applyRecall(model);
      const nodeHtml = renderDocument(model, edition, CSS);
      ok(`parity · ${example} · ${edition}`, nodeHtml === got[edition],
        nodeHtml === got[edition] ? `${nodeHtml.length} bytes` : 'browser and Node output differ');
    }
  }
  ok('no JS errors while rendering', errs.length === 0, errs.join(' | '));
  await page.close();
}

/* ------------------------------------------------------ 2. wizard flow ---- */
{
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(EDITOR);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(300);

  ok('home offers three ways in', await page.locator('.pcard').count() === 3);

  await page.click('[data-act=start]');
  await page.waitForTimeout(150);
  await page.fill('#exname', '2학기 중간고사 과학');
  await page.click('[data-act=next]');
  await page.waitForTimeout(150);

  ok('step 2 gates on fewer than two rows', await page.locator('[data-act=next]').isDisabled());
  const rows = page.locator('.lrow input');
  await rows.nth(0).fill('동화');
  await rows.nth(1).fill('조절');
  await page.waitForTimeout(150);
  ok('gate opens as soon as two rows are typed',
    !(await page.locator('[data-act=next]').isDisabled()));

  await page.click('[data-act=next]');
  await page.waitForTimeout(150);
  await page.click('[data-act=preset][data-id=concept]');
  await page.waitForTimeout(200);
  await page.click('[data-act=next]');
  await page.waitForTimeout(200);

  const cells = page.locator('table.g td textarea');
  ok('grid is 2 rows × 5 preset columns', await cells.count() === 10,
    `${await cells.count()} cells`);
  await cells.nth(0).fill('기존 틀에 새 경험을 끼워 넣음');
  await page.waitForTimeout(120);
  await page.locator('.mkb').nth(0).click();
  await page.waitForTimeout(150);
  ok('marker button cycles into 갈림', (await page.locator('.mkb').nth(0).innerText()) === '갈림');

  await page.click('[data-act=next]');
  await page.waitForTimeout(200);
  ok('reaches the finish screen', (await page.locator('h1').innerText()).includes('다 됐습니다'));

  const printed = await page.evaluate(() => new Promise((res) => {
    let fired = false;
    const obs = new MutationObserver(() => {
      document.querySelectorAll('iframe').forEach((f) => {
        if (f.contentWindow && !f.__p) { f.__p = true; f.contentWindow.print = () => { fired = true; }; }
      });
    });
    obs.observe(document.body, { childList: true });
    printEdition('full');
    setTimeout(() => { obs.disconnect(); res(fired); }, 1800);
  }));
  ok('print dialog is triggered', printed);

  ok('no JS errors during the walkthrough', errs.length === 0, errs.join(' | '));
  await page.close();
}

await browser.close();
console.log(`\n${failed ? failed + ' failing' : 'all checks passed'}`);
process.exit(failed ? 1 : 0);
