/**
 * Printing, through the renderer the original repository already had.
 *
 * `renderDocument()` is the same 700-line page template the Node build uses;
 * nothing about it was rewritten for the app. The app's job is only to hand it
 * a v1-shaped exam object and put the resulting HTML somewhere a browser will
 * print it.
 *
 * A hidden same-origin iframe rather than a popup: popups get blocked, and an
 * iframe keeps the learner on the page they were on when the dialog closes.
 *
 * One honest difference from the CLI build: page footers. `scripts/build.js`
 * passes `footerTemplate()` to Chromium's PDF API, which the browser print
 * dialog has no equivalent for — the browser draws its own header and footer
 * instead, and the learner can switch them off in the dialog.
 */

import { normalizeExam, stripEmpty } from './lib/normalize.js';
import { applyRecall } from './lib/recall.js';
import { renderDocument, type Edition } from './render.js';
import printCss from './print.css?raw';

export type { Edition };

export const EDITION_LABEL: Record<Edition, string> = {
  full: '전체본',
  recall: '빈칸 문제지',
  key: '정답지',
};

export const EDITION_HINT: Record<Edition, string> = {
  full: '모든 칸이 보이는 표',
  recall: '중요한 칸을 가린 인출 연습지',
  key: '빈칸 문제지의 번호별 정답',
};

/** v1 exam object + edition → a complete printable HTML document. */
export function renderExamHtml(raw: Record<string, unknown>, edition: Edition): string {
  const model = normalizeExam(stripEmpty(raw));
  // The recall edition and its answer key are two views of one blanking pass,
  // so both must run it — and it is deterministic, so they agree.
  if (edition !== 'full') applyRecall(model);
  return renderDocument(model, edition, printCss);
}

const FRAME_ID = 'exam-matrix-print-frame';

/**
 * Print without leaving the page. Resolves once the dialog has been dismissed,
 * or after a timeout on browsers that do not fire `afterprint` in a frame.
 */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve) => {
    document.getElementById(FRAME_ID)?.remove();

    const frame = document.createElement('iframe');
    frame.id = FRAME_ID;
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('title', '인쇄 미리보기');
    Object.assign(frame.style, {
      position: 'fixed', right: '0', bottom: '0',
      width: '1px', height: '1px', opacity: '0', border: '0',
    });
    document.body.appendChild(frame);

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.setTimeout(() => frame.remove(), 1000);
      resolve();
    };

    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) { finish(); return; }
      win.addEventListener('afterprint', finish, { once: true });
      // Give the fonts a beat: a print fired before Hangul has loaded measures
      // the fallback face and breaks the table widths.
      const go = () => { try { win.focus(); win.print(); } catch { /* dialog refused */ } };
      const fonts = (win.document as Document & { fonts?: FontFaceSet }).fonts;
      if (fonts?.ready) fonts.ready.then(go, go);
      else window.setTimeout(go, 120);
      window.setTimeout(finish, 60_000);
    };

    const doc = frame.contentWindow?.document;
    if (!doc) { finish(); return; }
    doc.open();
    doc.write(html);
    doc.close();
    // Safari fires load before write in some versions; nudge it.
    if (doc.readyState === 'complete') frame.onload?.(new Event('load'));
  });
}

/** Open the rendered document in a new tab, for learners who prefer that. */
export function openHtmlInTab(html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
