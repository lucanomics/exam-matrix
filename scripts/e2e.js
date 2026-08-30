#!/usr/bin/env node
/**
 * End-to-end: the learning loop, driven through the real UI.
 *
 *   node scripts/e2e.js            builds if needed, serves dist/, runs the flows
 *   node scripts/e2e.js --headed   same, with a visible browser
 *
 * The flows are the acceptance tests from the brief, in order:
 *
 *   1. a new learner creates an exam, captures one confusion, and reviews it —
 *      the answer must not be reachable before a confidence is committed;
 *   2. a wrong answer produces feedback, a failure reason, and a same-session
 *      retry;
 *   3. the matrix hides cells and grades what is reconstructed;
 *   4. the data can be exported and comes back with everything in it;
 *   5. every one of those is reachable with the keyboard alone.
 *
 * Static server and browser are started here, so this needs nothing running.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const HEADED = process.argv.includes('--headed');

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.log('  dist/ missing — building first…');
  execFileSync('npx', ['vite', 'build'], { stdio: 'inherit' });
  execFileSync('node', ['scripts/build-static.js'], { stdio: 'inherit' });
}

/* ------------------------------------------------------------- server ---- */

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

/* -------------------------------------------------------------- harness -- */

let failed = 0;
let checks = 0;
const ok = (name, pass, detail = '') => {
  checks++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!pass) failed++;
};

const browser = await chromium.launch({ headless: !HEADED });

/** A fresh browser context is a fresh IndexedDB, so flows cannot leak state. */
async function fresh(opts = {}) {
  const ctx = await browser.newContext({ locale: 'ko-KR', ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { ctx, page, errors };
}

const PROMPT = '문헌연구법은 면접법보다 시간과 장소의 제약이 큰가?';
const ANSWER = 'X';
const WHY = '기존 자료를 활용하므로 직접 대상자를 만나야 하는 면접법보다 제약이 작다.';

/* ============================================================ flow 1 ===== */
/* new user -> exam -> capture -> first review (the onboarding loop)          */
{
  const { ctx, page, errors } = await fresh();

  await page.getByLabel('시험 이름').fill('관광통역안내사 1차');
  await page.getByRole('button', { name: /다음/ }).click();
  await page.getByLabel('과목').fill('관광국사\n관광법규');
  await page.getByRole('button', { name: /다음/ }).click();

  await page.getByLabel('문제 · 헷갈린 표현').fill(PROMPT);
  await page.getByLabel('정답').fill(ANSWER);
  await page.getByLabel('왜?').fill(WHY);
  await page.getByRole('button', { name: /저장하고 바로 풀어보기/ }).click();

  await page.waitForTimeout(400);
  ok('온보딩이 첫 인출까지 이어진다', await page.getByText(PROMPT).isVisible());

  // The answer must not exist in the page before a confidence is committed.
  const leakedEarly = (await page.content()).includes(WHY);
  ok('확신도 전에는 정답과 근거가 DOM 에 없다', !leakedEarly);

  const reveal = page.getByRole('button', { name: '답 확인' });
  ok('확신도를 고르기 전에는 "답 확인"이 잠겨 있다', await reveal.isDisabled());

  await page.getByRole('button', { name: /확실함/ }).click();
  await reveal.click();
  await page.waitForTimeout(200);
  ok('공개하면 정답이 보인다', await page.getByText(ANSWER, { exact: false }).first().isVisible());
  ok('공개하면 근거가 보인다', (await page.content()).includes(WHY));

  await page.getByRole('button', { name: /맞음/ }).click();
  await page.waitForTimeout(300);
  ok('다음 예정이 안내된다', /일 뒤 다시 나옵니다/.test(await page.content()));

  await page.getByRole('button', { name: '시작하기' }).click();
  await page.waitForTimeout(600);
  ok('오늘 화면으로 들어온다', page.url().includes('#/'));
  ok('오류 없음 (flow 1)', errors.length === 0, errors[0] ?? '');
  await ctx.close();
}

/* ============================================================ flow 2 ===== */
/* wrong answer -> feedback -> failure reason -> same-session retry           */
{
  const { ctx, page, errors } = await fresh();
  await page.getByRole('button', { name: '예시부터 둘러보기' }).click();
  await page.waitForTimeout(900);

  await page.goto(`${BASE}/#/drill?mode=today`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const total = Number((await page.locator('.drill__progress').innerText()).split('/')[1].trim());
  ok('오늘 복습 큐가 만들어진다', total > 0, `${total}개`);

  const firstPrompt = await page.locator('.drill__prompt').innerText();

  // Answer wrong, at high confidence: the dangerous quadrant.
  const ox = page.locator('.ox__btn');
  if (await ox.count()) await ox.first().click();
  else await page.getByLabel(/답을 적어보세요/).fill('아무거나');
  await page.getByRole('button', { name: /확실함/ }).click();
  await page.getByRole('button', { name: '답 확인' }).click();
  await page.waitForTimeout(200);

  const grade = page.getByRole('button', { name: /틀림/ });
  if (await grade.count()) await grade.click();
  await page.waitForTimeout(400);

  ok('틀리면 위험한 착각으로 분류된다', (await page.content()).includes('확신하고 틀림'));
  ok('실패 원인을 고를 수 있다', await page.getByRole('button', { name: '비슷한 개념과 혼동' }).isVisible());
  await page.getByRole('button', { name: '비슷한 개념과 혼동' }).click();
  await page.waitForTimeout(250);

  const before = Number((await page.locator('.drill__progress').innerText()).split('/')[1].trim());
  await page.getByRole('button', { name: /^다음/ }).click();
  await page.waitForTimeout(400);
  const after = Number((await page.locator('.drill__progress').innerText()).split('/')[1].trim());
  ok('틀린 항목이 같은 세션에 다시 들어간다', after === before + 1, `${before} -> ${after}`);

  // Walk forward until the failed prompt reappears.
  let reappeared = false;
  for (let i = 0; i < 8 && !reappeared; i++) {
    if ((await page.locator('.drill__prompt').count()) === 0) break;
    if ((await page.locator('.drill__prompt').innerText()) === firstPrompt) { reappeared = true; break; }
    const oxs = page.locator('.ox__btn');
    if (await oxs.count()) await oxs.first().click();
    await page.getByRole('button', { name: /아는 것 같음/ }).click();
    await page.getByRole('button', { name: '답 확인' }).click();
    await page.waitForTimeout(150);
    const g = page.getByRole('button', { name: /맞음/ });
    if (await g.count()) await g.click();
    await page.waitForTimeout(200);
    const next = page.getByRole('button', { name: /^다음/ });
    if (await next.count()) await next.click();
    await page.waitForTimeout(250);
  }
  ok('틀린 항목이 실제로 다시 나온다', reappeared);

  await page.goto(`${BASE}/#/weakness`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  ok('약점 화면에 확신하고 틀린 것이 집계된다',
    (await page.locator('.quad--trap').first().innerText()).match(/\d/) !== null);
  ok('오류 없음 (flow 2)', errors.length === 0, errors[0] ?? '');
  await ctx.close();
}

/* ============================================================ flow 3 ===== */
/* the matrix as an instrument: hide cells, rebuild them, record the misses   */
{
  const { ctx, page, errors } = await fresh();
  await page.getByRole('button', { name: '예시부터 둘러보기' }).click();
  await page.waitForTimeout(900);

  await page.goto(`${BASE}/#/matrix`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.locator('.mxcard').first().click();
  await page.waitForTimeout(400);

  const cellsBefore = await page.locator('.matrix__cell').count();
  ok('비교표가 열린다', cellsBefore > 0, `${cellsBefore}칸`);

  await page.getByRole('button', { name: /빈칸으로 풀기/ }).click();
  await page.waitForTimeout(400);
  const blanks = await page.locator('.matrix__cell.is-blank').count();
  ok('칸이 가려진다', blanks > 0, `${blanks}칸`);

  // Answer one blank wrong on purpose.
  const firstBlank = page.locator('.matrix__cell.is-blank').first();
  await firstBlank.locator('textarea').fill('완전히 틀린 답');
  await firstBlank.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(400);
  ok('빈칸이 채점된다', await page.locator('.matrix__cell.is-wrong').first().isVisible());
  ok('정답이 함께 보인다', (await firstBlank.innerText()).includes('틀림'));

  await page.getByRole('button', { name: /표로 돌아가기/ }).click();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const unstable = await page.locator('.matrix__cell.is-unstable').count();
  ok('틀린 칸이 표에서 불안정으로 남는다', unstable > 0, `${unstable}칸`);
  ok('오류 없음 (flow 3)', errors.length === 0, errors[0] ?? '');
  await ctx.close();
}

/* ============================================================ flow 4 ===== */
/* capture -> confusion link -> backup export                                */
{
  const { ctx, page, errors } = await fresh({ acceptDownloads: true });
  await page.getByRole('button', { name: '예시부터 둘러보기' }).click();
  await page.waitForTimeout(900);

  await page.getByRole('button', { name: /헷갈린 것 추가/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByLabel('문제 · 헷갈린 표현').fill('참여관찰법과 실험법의 결정적 차이는?');
  await page.getByLabel('정답').fill('연구자가 변수를 조작하는지 여부');
  await page.getByLabel('왜?').fill('실험법만 독립변수를 인위적으로 조작한다.');
  await page.getByLabel('출처 이름').fill('2025 기출');
  await page.getByLabel('주제').fill('자료수집방법');
  await page.getByRole('button', { name: /^애매하게 맞음$/ }).click();

  const options = await page.getByLabel('뭐랑 헷갈렸나요?').locator('option').count();
  ok('헷갈리는 짝을 고를 수 있다', options > 1, `${options - 1}개 후보`);
  await page.getByLabel('뭐랑 헷갈렸나요?').selectOption({ index: 1 });
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.waitForTimeout(700);

  await page.goto(`${BASE}/#/sources`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  ok('새 출처가 출처 화면에 나타난다', (await page.content()).includes('2025 기출'));

  await page.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /전체 백업 내려받기/ }).click(),
  ]);
  const file = await download.path();
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok('백업이 내려받아진다', backup.format === 'exam-matrix-backup');
  ok('백업에 새 항목이 들어 있다',
    backup.items.some((i) => i.prompt.includes('참여관찰법과 실험법')));
  ok('백업에 복습 기록이 들어 있다', Array.isArray(backup.reviews) && backup.reviews.length > 0);
  ok('백업에 헷갈리는 짝이 들어 있다', backup.relations.length > 0);
  ok('오류 없음 (flow 4)', errors.length === 0, errors[0] ?? '');
  await ctx.close();
}

/* ============================================================ flow 5 ===== */
/* keyboard only                                                             */
{
  const { ctx, page, errors } = await fresh();
  await page.getByRole('button', { name: '예시부터 둘러보기' }).click();
  await page.waitForTimeout(900);

  await page.keyboard.press('Control+k');
  await page.waitForTimeout(300);
  ok('Ctrl+K 로 검색이 열린다', await page.locator('.palette').isVisible());
  await page.keyboard.type('오늘 복습');
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  ok('검색 결과를 키보드로 실행할 수 있다', page.url().includes('drill'));

  // A text-answer card focuses its textarea, where digits must type rather than
  // act as shortcuts. Tab is the keyboard route out of it, and the confidence
  // buttons must be the very next stop.
  const isOx = (await page.locator('.ox').count()) > 0;
  if (isOx) {
    await page.keyboard.press('x');
    await page.waitForTimeout(120);
    ok('O/X 를 키보드로 고를 수 있다',
      (await page.locator('.ox__btn[aria-pressed="true"]').count()) === 1);
  } else {
    await page.keyboard.type('기억나는 답');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(120);
    const onConfidence = await page.evaluate(() =>
      document.activeElement?.classList.contains('conf__btn') ?? false);
    ok('답을 적은 뒤 Tab 이 확신도로 이어진다', onConfidence);
    await page.evaluate(() => document.activeElement?.blur?.());
  }
  await page.keyboard.press('3');
  await page.waitForTimeout(120);
  ok('확신도를 숫자키로 고를 수 있다',
    (await page.locator('.conf__btn[aria-pressed="true"]').count()) === 1);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  ok('Enter 로 답이 공개된다', (await page.locator('.reveal').count()) > 0);

  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('n');
  await page.waitForTimeout(350);
  ok('n 으로 담기 시트가 열린다', (await page.locator('[role="dialog"]').count()) > 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  ok('Escape 로 시트가 닫힌다', (await page.locator('[role="dialog"]').count()) === 0);

  // The skip link must be the first stop on a freshly opened page. A hash
  // change is not a fresh page, so this reloads the document rather than
  // asserting against a focus position left over from the drill above.
  await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.keyboard.press('Tab');
  const firstStop = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
  ok('첫 Tab 이 본문 건너뛰기 링크에 닿는다', firstStop.includes('본문으로'), firstStop);
  ok('오류 없음 (flow 5)', errors.length === 0, errors[0] ?? '');
  await ctx.close();
}

/* ============================================================ flow 6 ===== */
/* legacy localStorage is found and converted on first run                   */
{
  const ctx = await browser.newContext({ locale: 'ko-KR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('em.v2', JSON.stringify({
      exam: { name: '예전 편집기 시험', lang: 'ko', subjects: '과목 A\n과목 B' },
      topics: [{
        id: 'old-topic', title: '옛 주제', archetype: 'concept',
        one_sentence: '한 문장 모델',
        matrix: {
          row_label: '항목',
          columns: [{ key: 'a', label_ko: '뜻', mark: 'core' }, { key: 'b', label_ko: '차이', mark: 'distinction' }],
          rows: [
            { label: '개념 하나', cells: { a: { v: '뜻 1' }, b: { v: '차이 1' } } },
            { label: '개념 둘', cells: { a: { v: '뜻 2' }, b: { v: '차이 2' } } },
          ],
        },
        traps: [{ cue: '항상 그렇다', exception: '예외가 있다', why: '조건이 붙는다' }],
      }],
      error_log: [{ date: '2026-01-05', question: '옛 오답', correct: '옛 정답', error_type: 'confused-pair', topic: 'old-topic' }],
      compression: { l2: [], l3: '' },
      ui: { step: 0, mode: 'easy', topic: 0 },
    }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const body = await page.content();
  ok('예전 저장 데이터를 찾아서 옮긴다', body.includes('예전 편집기 시험'));
  ok('옮겼다고 알려준다', body.includes('찾아서 옮겼습니다'));

  await page.goto(`${BASE}/#/matrix`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  ok('예전 비교표가 살아 있다', (await page.content()).includes('옛 주제'));

  const kept = await page.evaluate(() => localStorage.getItem('em.v2') !== null);
  ok('원본 localStorage 는 그대로 둔다', kept);
  ok('오류 없음 (flow 6)', errors.length === 0, errors[0] ?? '');
  await ctx.close();
}

/* =========================================================== teardown ==== */

await browser.close();
server.close();

console.log(`\n${checks - failed}/${checks} checks passed`);
if (failed) { console.error(`${failed} check${failed === 1 ? '' : 's'} failed`); process.exit(1); }
console.log('all end-to-end checks passed');
