#!/usr/bin/env node
/**
 * Visual QA for the application, the way `scripts/visual-qa.js` does it for the
 * PDFs: run the real thing, look at it, and fail on what a screenshot review
 * would catch.
 *
 *   node scripts/app-qa.js            build if needed, sweep, write qa/*.png
 *   node scripts/app-qa.js --quick    breakpoint sweep only
 *
 * What it checks, at desktop / laptop / tablet-landscape / tablet-portrait /
 * phone, in light and dark, and with three data sets (empty, sample, dense):
 *
 *   - no page errors and no console errors on any route;
 *   - no accidental horizontal page scroll (the matrix scrolls inside its own
 *     container, which is the one place §45 allows it);
 *   - the empty states are reachable and say something useful;
 *   - capture and drill still work with the network switched off.
 *
 * Screenshots go to qa/, which is git-ignored — they are for a human to look
 * at, not for the build to compare.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'qa');
const QUICK = process.argv.includes('--quick');

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.log('  dist/ missing — building first…');
  execFileSync('npx', ['vite', 'build'], { stdio: 'inherit' });
  execFileSync('node', ['scripts/build-static.js'], { stdio: 'inherit' });
}
fs.mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
  '.webmanifest': 'application/manifest+json',
};
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = path.join(DIST, url === '/' ? 'index.html' : url);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const errors = [];
const overflow = [];
const ROUTES = ['/#/', '/#/drill?mode=today', '/#/matrix', '/#/weakness', '/#/sources', '/#/eve', '/#/settings'];
const SIZES = [
  [1600, 1000, false, 'wide'],
  [1280, 800, false, 'laptop'],
  [1024, 768, false, 'tablet-l'],
  [820, 1180, true, 'tablet-p'],
  [390, 844, true, 'phone'],
];

const browser = await chromium.launch();

async function ctxFor(w, h, mobile, extra = {}) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile,
    locale: 'ko-KR', ...extra,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${w}x${h}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${w}x${h}] console: ${m.text()}`); });
  return { ctx, page };
}

/** Load the sample exam the way a first-time visitor does. */
async function seed(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const btn = page.getByRole('button', { name: '예시부터 둘러보기' });
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(900); }
}

/** Walk the routes, recording any page-level horizontal scroll. */
async function sweep(page, tag, shoot = false) {
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(420);
    const res = await page.evaluate(() => ({
      docW: document.documentElement.scrollWidth, winW: window.innerWidth,
    }));
    if (res.docW > res.winW + 1) overflow.push(`${tag} ${route}: ${res.docW} > ${res.winW}`);
    if (shoot) {
      const name = route.replace(/[^a-z]/gi, '') || 'today';
      await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`), fullPage: true });
    }
  }
}

/* ---- a dense, awkward backup ------------------------------------------- */
const LONG = '행정심판법 제27조에 따른 심판청구기간의 기산점은 처분이 있음을 알게 된 날부터 90일 이내이며, 처분이 있었던 날부터 180일을 경과하면 청구하지 못한다는 점에서 취소소송의 제소기간과 명확히 구분되어야 한다';
const now = new Date().toISOString();
const examId='exam_dense';
const topics = Array.from({length:12},(_,i)=>({id:`topic_${i}`,examId,title:i===0?`아주 긴 주제 이름 ${LONG.slice(0,40)}`:`주제 ${i+1} · 세부 구분`,order:i}));
const cols = Array.from({length:11},(_,i)=>({id:`col_${i}`,key:`c${i}`,label:i===0?'대단히 긴 비교 기준 이름 — 처분이 있음을 알게 된 날':`기준 ${i+1}`,marker:['core','distinction','exception','trap','update','evidence'][i%6]}));
const rows = Array.from({length:9},(_,i)=>({id:`row_${i}`,label:i===0?LONG.slice(0,34):`항목 ${i+1}`,cells:Object.fromEntries(cols.map((c,j)=>[c.id,{value:(i+j)%5===0?LONG:`값 ${i}-${j}`}]))}));
const items = Array.from({length:240},(_,i)=>({
  id:`item_${String(i).padStart(3,'0')}`,examId,topicId:`topic_${i%12}`,
  source:{type:['textbook','past_paper','mock','lecture','handout','other'][i%6],title:`출처 ${i%7} · 아주 긴 교재 이름이 들어가는 경우도 있습니다`,year:`${2019+(i%7)}`,questionNumber:`${i%40+1}번`},
  prompt:i%9===0?LONG:`문제 ${i+1} — 다음 중 옳은 것은?`,
  answer:i%5===0?LONG.slice(0,80):(i%3===0?'X':'O'),
  rationale:i%4===0?LONG:'짧은 근거',
  examinerWording:i%6===0?LONG:undefined,
  itemType:i%3===0?'ox':'short_answer',
  intakeReason:['wrong','guessed_right','unsure_right','too_slow','wording_trap'][i%5],
  markers:[['core'],['trap'],['exception'],['distinction','trap'],[]][i%5],
  tags:[],confusedWithIds:[],
  status:['inbox','active','active','stable','mastered'][i%5],
  step:i%7,streak:i%3,lapses:i%4,reviewCount:i%6,
  createdAt:now,updatedAt:now,
  lastReviewedAt:i%6?now:undefined,
  nextReviewAt:new Date(Date.now()+((i%11)-5)*86400000).toISOString(),
  pinned:i%37===0,
}));
const reviews = items.slice(0,180).map((it,i)=>({
  id:`rev_${i}`,itemId:it.id,examId,reviewedAt:new Date(Date.now()-(i%20)*86400000).toISOString(),
  correct:i%3!==0,confidence:(i%4)+1,resultClass:['confident_wrong','unsure_correct','confident_correct','unsure_wrong'][i%4],
  slow:i%9===0,failureReason:i%3===0?['confused_with_similar','missed_condition','fooled_by_wording','did_not_know'][i%4]:undefined,
  stepAfter:i%7,intervalDays:[0,1,3,7,14,30,60][i%7],nextReviewAt:now,mode:'today',
}));
const relations = Array.from({length:14},(_,i)=>({id:`rel_${i}`,examId,aId:`item_${String(i*3).padStart(3,'0')}`,bId:`item_${String(i*3+1).padStart(3,'0')}`,kind:'confused_with',createdAt:now}));
const backup = {format:'exam-matrix-backup',schemaVersion:2,exportedAt:now,
  exams:[{id:examId,title:`밀도 시험 · ${LONG.slice(0,26)}`,examDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10),createdAt:now,updatedAt:now}],
  subjects:Array.from({length:5},(_,i)=>({id:`subj_${i}`,examId,title:`과목 ${i+1}`,order:i})),
  topics,items,relations,
  matrices:[{id:'mx_dense',examId,topicId:'topic_0',title:`아주 긴 비교표 이름 ${LONG.slice(0,30)}`,rowLabel:'제도',archetype:'law',columns:cols,rows,createdAt:now,updatedAt:now}],
  reviews,cellStats:[{id:'mx_dense:row_0:col_0',matrixId:'mx_dense',rowId:'row_0',columnId:'col_0',examId,attempts:5,misses:4}]};
const DENSE = path.join(OUT, 'dense-backup.json');
fs.writeFileSync(DENSE, JSON.stringify(backup));



/* ============================================================= sample ==== */
for (const [w, h, mobile, tag] of SIZES) {
  const { ctx, page } = await ctxFor(w, h, mobile);
  await seed(page);
  await sweep(page, `sample-${tag}`, ['wide', 'phone', 'tablet-p'].includes(tag));

  // The matrix, in both its modes.
  await page.goto(`${BASE}/#/matrix`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const card = page.locator('.mxcard').first();
  if (await card.count()) {
    await card.click();
    await page.waitForTimeout(500);
    const res = await page.evaluate(() => ({
      docW: document.documentElement.scrollWidth, winW: window.innerWidth,
    }));
    if (res.docW > res.winW + 1) overflow.push(`sample-${tag} matrix: ${res.docW} > ${res.winW}`);
    if (['wide', 'phone', 'tablet-p'].includes(tag)) {
      await page.screenshot({ path: path.join(OUT, `sample-${tag}-matrix.png`), fullPage: true });
      const blank = page.getByRole('button', { name: /빈칸으로 풀기/ });
      if (await blank.count()) {
        await blank.click();
        await page.waitForTimeout(450);
        await page.screenshot({ path: path.join(OUT, `sample-${tag}-matrix-blank.png`), fullPage: true });
      }
    }
  }
  await ctx.close();
  if (QUICK) break;
}

if (!QUICK) {
  /* ============================================================ empty ==== */
  {
    const { ctx, page } = await ctxFor(1440, 900, false);
    await seed(page);
    // A second, empty exam is what a learner sees starting their next
    // qualification — the honest way to reach every empty state.
    await page.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.getByLabel('새 시험 이름').fill('빈 시험');
    await page.getByRole('button', { name: '시험 추가', exact: true }).click();
    await page.waitForTimeout(900);
    for (const [route, name] of [
      ['/#/', 'today'], ['/#/matrix', 'matrix'], ['/#/weakness', 'weakness'],
      ['/#/sources', 'sources'], ['/#/eve', 'eve'], ['/#/drill?mode=today', 'drill'],
    ]) {
      await page.goto(BASE + route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const text = await page.locator('.empty__title, .drill__prompt').first().innerText().catch(() => '');
      if (!text.trim()) overflow.push(`empty ${route}: no empty-state message`);
      await page.screenshot({ path: path.join(OUT, `empty-${name}.png`), fullPage: true });
    }
    await ctx.close();
  }

  /* ============================================================ dense ==== */
  for (const [w, h, mobile, tag] of SIZES) {
    const { ctx, page } = await ctxFor(w, h, mobile);
    await seed(page);
    await page.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.locator('input[type=file]').setInputFiles(DENSE);
    await page.waitForTimeout(700);
    const commit = page.getByRole('button', { name: /합쳐서 가져오기/ });
    if (await commit.count()) { await commit.click(); await page.waitForTimeout(1300); }

    await sweep(page, `dense-${tag}`, ['wide', 'phone'].includes(tag));

    await page.goto(`${BASE}/#/matrix`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const dense = page.locator('.mxcard').filter({ hasText: '아주 긴 비교표' });
    if (await dense.count()) {
      await dense.first().click();
      await page.waitForTimeout(600);
      const res = await page.evaluate(() => ({
        docW: document.documentElement.scrollWidth, winW: window.innerWidth,
      }));
      if (res.docW > res.winW + 1) overflow.push(`dense-${tag} matrix: ${res.docW} > ${res.winW}`);
      if (['wide', 'phone'].includes(tag)) {
        await page.screenshot({ path: path.join(OUT, `dense-${tag}-matrix.png`), fullPage: true });
      }
    }
    await ctx.close();
  }

  /* ============================================================= dark ==== */
  {
    const { ctx, page } = await ctxFor(1440, 900, false, { colorScheme: 'dark' });
    await seed(page);
    await sweep(page, 'dark', true);
    await ctx.close();
  }

  /* ========================================================== offline ==== */
  {
    const { ctx, page } = await ctxFor(1280, 800, false);
    await seed(page);
    await ctx.setOffline(true);
    await page.goto(`${BASE}/#/drill?mode=today`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(700);
    if ((await page.locator('.drill__prompt, .empty__title').count()) === 0) {
      overflow.push('offline: drill did not render');
    }
    await page.getByRole('button', { name: /헷갈린 것 추가/ }).first().click().catch(() => {});
    await page.waitForTimeout(450);
    if ((await page.locator('[role=dialog]').count()) === 0) {
      overflow.push('offline: capture did not open');
    }
    await page.screenshot({ path: path.join(OUT, 'offline.png') });
    await ctx.setOffline(false);
    await ctx.close();
  }
}

await browser.close();
server.close();

const shots = fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).length;
console.log(`\n  ${shots} screenshots in qa/`);
console.log(`  ${errors.length} JS error${errors.length === 1 ? '' : 's'}`);
console.log(`  ${overflow.length} layout problem${overflow.length === 1 ? '' : 's'}`);
for (const e of errors.slice(0, 12)) console.log('    ' + e);
for (const o of overflow) console.log('    ' + o);
if (errors.length || overflow.length) process.exit(1);
console.log('\n  no JS errors, no accidental horizontal scroll, empty states present');
