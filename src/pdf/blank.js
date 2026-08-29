/**
 * Blank handwriting templates.
 *
 * The generated workbook assumes you typed your content first. This does the
 * opposite: empty forms in the same design language, sized for a stylus on a
 * tablet (GoodNotes, Notability, Noteshelf) or a printed sheet and a pen.
 *
 * Two differences from the data-driven pages, both deliberate:
 *
 *  1. **Column headers are writable.** The whole premise is that the comparison
 *     axes are topic-specific, so a blank matrix that pre-printed its columns
 *     would be useless. Each header cell carries a small box for the marker
 *     code and a rule for the axis name.
 *  2. **Rows are stylus-height.** Handwriting needs roughly twice the room that
 *     9.5pt type does, so nothing here is shorter than 16mm.
 */

import { MARKERS } from './lib/archetypes.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const T = {
  en: {
    brand: 'Exam Matrix', blank: 'Blank Template',
    dashboard: 'Exam Dashboard', blueprint: 'Exam Blueprint', topic: 'Topic',
    matrix: 'Exam Matrix', decisive: 'Decisive Distinction', traps: 'Exception & Trap Matrix',
    evidence: 'Question & Evidence Links', errorlog: 'Error Log',
    compression: 'Compression Ladder', review: 'Review Tracker',
    exam_name: 'Exam name', authority: 'Awarding body', exam_date: 'Exam date',
    days_left: 'D-day', passing: 'Passing criterion', target: 'Target score',
    syllabus: 'Syllabus / version', confidence: 'Confidence', updated: 'Last updated',
    subjects: 'Subjects', sources: 'Sources',
    what_tests: 'What does this exam actually test?',
    domain: 'Domain', weight: 'Weight', qtype: 'Question type', priority: 'Priority',
    last_review: 'Last review', high_yield: 'High-yield', weak: 'Weak', volatile: 'Volatile',
    topic_index: 'Topic index', rows_col: 'Rows',
    why: 'Why it matters', frequency: 'Frequency', core_q: 'Core question',
    key_axis: 'Key comparison axis', prereq: 'Prerequisites', source: 'Source',
    one_sentence: 'One-sentence model',
    one_sentence_prompt: 'Explain this topic in ONE sentence, as if to someone sitting the exam tomorrow.',
    essentials: 'Five essential facts', essentials_hint: 'Maximum five. The cap is the point.',
    row_label: 'Item', axis_hint: 'axis →', marker_hint: 'mark',
    decisive_prompt: 'If an examiner forced me to separate these using ONE criterion, what would it be?',
    pairs: 'Confusion pairs', p_a: 'A', p_b: 'B', p_why: 'Why confused', p_clue: 'Decisive clue',
    t_cue: 'Statement / cue', t_usually: 'Usually', t_exc: 'Exception', t_why: 'Why it tricks', t_src: 'Source',
    e_cell: 'Matrix cell', e_src: 'Source', e_exam: 'Exam / year', e_q: 'Question',
    e_as: 'Tested as', e_risk: 'Risk',
    l_date: 'Date', l_q: 'Question', l_topic: 'Topic', l_mine: 'My answer', l_correct: 'Correct',
    l_type: 'Error type', l_missing: 'Missing distinction', l_update: 'Matrix update', l_retest: 'Retest',
    errorlog_hint: 'Every conceptual mistake must name the matrix cell it invalidates.',
    l2h: 'Exam-day matrix — L2', l3h: 'Last-10-minutes sheet — L3',
    r_learned: 'Learned', r_mastered: 'Mastered', r_revisit: 'Revisit',
    own_detail: 'Detail I added myself', legend: 'Markers',
    f_topic: 'Topic', f_date: 'Date',
    etypes: 'knowledge gap · confused pair · exception forgotten · wording misread · formula selection · calculation · procedure order · outdated · careless · time pressure',
  },
  ko: {
    brand: '시험 매트릭스', blank: '필기용 빈 양식',
    dashboard: '시험 대시보드', blueprint: '출제 설계도', topic: '주제',
    matrix: '엑셀표 매트릭스', decisive: '결정적 변별', traps: '예외 · 함정 매트릭스',
    evidence: '기출 · 근거 연결', errorlog: '오답 기록',
    compression: '압축 사다리', review: '복습 추적',
    exam_name: '시험명', authority: '시행 기관', exam_date: '시험일',
    days_left: 'D-day', passing: '합격 기준', target: '목표 점수',
    syllabus: '출제기준 · 버전', confidence: '자신감', updated: '최종 수정',
    subjects: '과목', sources: '학습 자료',
    what_tests: '이 시험은 실제로 무엇을 묻는가?',
    domain: '영역', weight: '비중', qtype: '문항 유형', priority: '우선순위',
    last_review: '최근 복습', high_yield: '빈출', weak: '취약', volatile: '개정 민감',
    topic_index: '주제 색인', rows_col: '행',
    why: '왜 중요한가', frequency: '출제 빈도', core_q: '핵심 질문',
    key_axis: '핵심 비교축', prereq: '선행 개념', source: '근거',
    one_sentence: '한 문장 모델',
    one_sentence_prompt: '내일 시험을 보는 사람에게 설명하듯, 이 주제를 한 문장으로 쓰시오.',
    essentials: '핵심 사실 다섯 가지', essentials_hint: '최대 다섯 개. 그 제한이 핵심이다.',
    row_label: '항목', axis_hint: '비교축 →', marker_hint: '표기',
    decisive_prompt: '출제자가 단 하나의 기준으로만 이 둘을 구분하라고 한다면, 그 기준은 무엇인가?',
    pairs: '혼동 쌍', p_a: 'A', p_b: 'B', p_why: '왜 혼동되는가', p_clue: '결정적 단서',
    t_cue: '진술 · 신호어', t_usually: '대체로', t_exc: '예외', t_why: '왜 속는가', t_src: '근거',
    e_cell: '매트릭스 셀', e_src: '출처', e_exam: '시험 · 연도', e_q: '문항',
    e_as: '기출 표현', e_risk: '위험',
    l_date: '날짜', l_q: '문항', l_topic: '주제', l_mine: '내 답', l_correct: '정답',
    l_type: '오류 유형', l_missing: '놓친 변별점', l_update: '매트릭스 수정', l_retest: '재시험',
    errorlog_hint: '모든 개념 오류는 무효가 된 매트릭스 셀을 지목해야 한다.',
    l2h: '시험 당일 매트릭스 — L2', l3h: '마지막 10분 시트 — L3',
    r_learned: '학습', r_mastered: '숙달', r_revisit: '재점검',
    own_detail: '직접 추가한 디테일', legend: '표기',
    f_topic: '주제', f_date: '날짜',
    etypes: '지식 공백 · 개념 혼동 · 예외 망각 · 표현 오독 · 공식 선택 · 계산 실수 · 절차 순서 · 개정 미반영 · 단순 실수 · 시간 압박',
  },
};

/* ------------------------------------------------------------------ pieces */

const head = (t, title, sub, rhs = '') => `<header class="page-head">
  <div>
    <div class="eyebrow">${esc(t.brand)} · ${esc(t.blank)}</div>
    <h1 class="title">${esc(title)}</h1>
    ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
  </div>
  ${rhs ? `<div class="rhs">${rhs}</div>` : ''}
</header>`;

/**
 * Write-in header fields. A topic-scoped sheet has to say which topic it is —
 * otherwise a stack of thirty identical matrix pages in a notebook is unusable.
 */
const hdrFields = (t, keys) => `<div class="hf">${keys
  .map((k) => `<div class="hfr"><span>${esc(t[k])}</span><i></i></div>`).join('')}</div>`;

/** Label on the left, rule to write on. */
const field = (label, span = 1) =>
  `<div${span > 1 ? ` style="grid-column:span ${span}"` : ''}>
     <dt>${esc(label)}</dt><dd class="fill"></dd></div>`;

const legend = (t) => `<div class="legend">${Object.entries(MARKERS)
  .map(([k, m]) => `<span>${m.sigil} <b>${esc(t.f_topic === '주제' ? m.label_ko : m.code)}</b></span>`)
  .join('')}</div>`;

/** n ruled lines, for prose the learner writes. */
const lines = (h) => `<div class="lines" style="min-height:${h}mm"></div>`;

/**
 * The blank matrix. Column headers are writable because the axes belong to the
 * topic, not to the template.
 */
function blankMatrix(t, { cols, rows, rowH }) {
  const headCells = Array.from({ length: cols }, () =>
    `<th class="wr"><span class="mkbox"></span><span class="axisline"></span></th>`).join('');
  const body = Array.from({ length: rows }, () =>
    `<tr style="height:${rowH}mm"><td class="rowlab"></td>${'<td></td>'.repeat(cols)}</tr>`).join('');
  const w = (100 - 18) / cols;
  return `<table class="matrix blankmx">
    <colgroup><col style="width:18%">${Array.from({ length: cols }, () => `<col style="width:${w.toFixed(2)}%">`).join('')}</colgroup>
    <thead>
      <tr class="mx-title"><th colspan="${cols + 1}">${esc(t.matrix)}
        <span class="cont">${esc(t.axis_hint)}</span></th></tr>
      <tr class="mx-cols"><th class="rowlab">${esc(t.row_label)}</th>${headCells}</tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;
}

/* ------------------------------------------------------------------- pages */

export const PAGES = {
  dashboard: (t) => ({ land: false, html: `
    ${head(t, t.dashboard)}
    <div class="meta block">
      ${field(t.exam_name)}${field(t.authority)}${field(t.updated)}
      ${field(t.exam_date)}${field(t.days_left)}${field(t.target)}
      ${field(t.passing)}${field(t.syllabus)}${field(t.confidence)}
    </div>
    <h2 class="section">${t.what_tests}</h2>
    ${lines(30)}
    <div class="meta two block" style="margin-top:5mm">
      <div><dt>${t.subjects}</dt><dd>${lines(26)}</dd></div>
      <div><dt>${t.sources}</dt><dd>${lines(26)}</dd></div>
    </div>
    <h2 class="section">${t.legend}</h2>
    <table class="block"><thead><tr>
      <th style="width:18%">${t.marker_hint}</th><th>${t.brand}</th></tr></thead>
      <tbody>${Object.entries(MARKERS).map(([k, m]) => `<tr style="height:11mm">
        <td class="m-${k}"><span class="chip">${m.sigil} ${esc(t.f_topic === '주제' ? m.label_ko : m.code)}</span></td>
        <td></td></tr>`).join('')}</tbody>
    </table>` }),

  blueprint: (t) => ({ land: false, html: `
    ${head(t, t.blueprint)}
    <table class="block"><thead><tr>
      <th style="width:34%">${t.domain}</th><th style="width:11%">${t.weight}</th>
      <th style="width:22%">${t.qtype}</th><th style="width:11%">${t.priority}</th>
      <th style="width:11%">${t.confidence}</th><th style="width:11%">${t.last_review}</th>
    </tr></thead><tbody>${Array.from({ length: 7 }, () =>
      `<tr style="height:13mm">${'<td></td>'.repeat(6)}</tr>`).join('')}</tbody></table>
    <div class="meta block">
      <div><dt>${t.high_yield}</dt><dd>${lines(22)}</dd></div>
      <div><dt>${t.weak}</dt><dd>${lines(22)}</dd></div>
      <div><dt>${t.volatile}</dt><dd>${lines(22)}</dd></div>
    </div>
    <h2 class="section">${t.topic_index}</h2>
    <table class="toc block"><thead><tr><th style="width:10%">#</th><th>${t.topic}</th>
      <th style="width:14%">${t.priority}</th><th style="width:12%">${t.rows_col}</th></tr></thead>
      <tbody>${Array.from({ length: 6 }, (_, i) => `<tr style="height:11mm">
        <td>${String(i + 1).padStart(2, '0')}</td><td></td><td></td><td></td></tr>`).join('')}</tbody></table>` }),

  topic: (t) => ({ land: false, html: `
    ${head(t, t.topic, '', hdrFields(t, ['f_topic', 'f_date']))}
    <div class="meta block">
      ${field(t.frequency)}${field(t.key_axis, 2)}
      ${field(t.prereq)}${field(t.source, 2)}
    </div>
    <h2 class="section">${t.why}</h2>${lines(18)}
    <h2 class="section">${t.core_q}</h2>${lines(12)}
    <h2 class="section">${t.one_sentence}</h2>
    <div class="one-sentence block">
      <div class="prompt">${esc(t.one_sentence_prompt)}</div>${lines(20)}
    </div>
    <h2 class="section">${t.essentials}<span class="hint">${esc(t.essentials_hint)}</span></h2>
    <ol class="essentials block">${'<li><span></span></li>'.repeat(5)}</ol>` }),

  'matrix-portrait': (t) => ({ land: false, html: `
    ${head(t, t.matrix, '', hdrFields(t, ['f_topic', 'f_date']))}
    ${blankMatrix(t, { cols: 4, rows: 8, rowH: 21 })}
    ${legend(t)}
    <div class="own"><div class="lbl">${esc(t.own_detail)}</div>${lines(22)}</div>` }),

  'matrix-landscape-6': (t) => ({ land: true, html: `
    ${head(t, t.matrix, '', hdrFields(t, ['f_topic', 'f_date']))}
    ${blankMatrix(t, { cols: 6, rows: 5, rowH: 20 })}
    ${legend(t)}
    <div class="own"><div class="lbl">${esc(t.own_detail)}</div>${lines(13)}</div>` }),

  'matrix-landscape-8': (t) => ({ land: true, html: `
    ${head(t, t.matrix, '', hdrFields(t, ['f_topic', 'f_date']))}
    ${blankMatrix(t, { cols: 8, rows: 5, rowH: 20 })}
    ${legend(t)}
    <div class="own"><div class="lbl">${esc(t.own_detail)}</div>${lines(13)}</div>` }),

  distinction: (t) => ({ land: false, html: `
    ${head(t, t.decisive, '', hdrFields(t, ['f_topic', 'f_date']))}
    <div class="decisive block">
      <div class="q">${esc(t.decisive_prompt)}</div>${lines(30)}
    </div>
    <h2 class="section">${t.pairs}</h2>
    <table class="block"><thead><tr>
      <th style="width:19%">${t.p_a}</th><th style="width:19%">${t.p_b}</th>
      <th style="width:31%">${t.p_why}</th><th style="width:31%">${t.p_clue}</th>
    </tr></thead><tbody>${Array.from({ length: 6 }, () =>
      `<tr style="height:24mm"><td></td><td></td><td></td><td class="m-distinction"></td></tr>`).join('')}</tbody></table>` }),

  traps: (t) => ({ land: false, html: `
    ${head(t, t.traps, t.errorlog_hint, hdrFields(t, ['f_topic', 'f_date']))}
    <table class="block"><thead><tr>
      <th style="width:28%">${t.t_cue}</th><th style="width:13%">${t.t_usually}</th>
      <th style="width:25%">${t.t_exc}</th><th style="width:22%">${t.t_why}</th>
      <th style="width:12%">${t.t_src}</th>
    </tr></thead><tbody>${Array.from({ length: 8 }, () =>
      `<tr style="height:26mm"><td></td><td></td><td class="m-exception"></td><td></td><td></td></tr>`).join('')}</tbody></table>` }),

  evidence: (t) => ({ land: true, html: `
    ${head(t, t.evidence, '', hdrFields(t, ['f_topic', 'f_date']))}
    <table class="block"><thead><tr>
      <th style="width:20%">${t.e_cell}</th><th style="width:13%">${t.e_src}</th>
      <th style="width:12%">${t.e_exam}</th><th style="width:12%">${t.e_q}</th>
      <th style="width:35%">${t.e_as}</th><th style="width:8%">${t.e_risk}</th>
    </tr></thead><tbody>${Array.from({ length: 8 }, () =>
      `<tr style="height:18mm"><td></td><td></td><td></td><td></td><td class="m-evidence"></td><td></td></tr>`).join('')}</tbody></table>` }),

  errorlog: (t) => ({ land: true, html: `
    ${head(t, t.errorlog, t.errorlog_hint, hdrFields(t, ['f_date']))}
    <table><thead><tr>
      <th class="nowrap" style="width:8%">${t.l_date}</th><th style="width:9%">${t.l_q}</th>
      <th style="width:12%">${t.l_topic}</th><th style="width:7%">${t.l_mine}</th>
      <th style="width:7%">${t.l_correct}</th><th style="width:11%">${t.l_type}</th>
      <th style="width:18%">${t.l_missing}</th><th style="width:20%">${t.l_update}</th>
      <th class="nowrap" style="width:8%">${t.l_retest}</th>
    </tr></thead><tbody>${Array.from({ length: 8 }, () =>
      `<tr style="height:17mm">${'<td></td>'.repeat(7)}<td class="m-distinction"></td><td></td></tr>`).join('')}</tbody></table>
    <div class="legend"><span>${esc(t.etypes)}</span></div>` }),

  compression: (t) => ({ land: false, html: `
    ${head(t, t.compression, '', hdrFields(t, ['f_date']))}
    <h2 class="section">${t.l2h}</h2>
    <table class="block"><thead><tr>
      <th class="nowrap" style="width:12%">${t.legend}</th><th style="width:32%">${t.topic}</th>
      <th>${t.p_clue}</th></tr></thead>
      <tbody>${Array.from({ length: 8 }, () =>
        `<tr style="height:16mm"><td></td><td></td><td></td></tr>`).join('')}</tbody></table>
    <h2 class="section">${t.l3h}</h2>
    <ul class="l3 block">${Array.from({ length: 12 }, () => '<li>&nbsp;</li>').join('')}</ul>` }),

  review: (t) => ({ land: false, html: `
    ${head(t, t.review, '', hdrFields(t, ['f_date']))}
    <table class="review"><thead><tr>
      <th style="width:34%">${t.topic}</th><th style="width:11%">${t.r_learned}</th>
      <th style="width:11%">R1</th><th style="width:11%">R2</th><th style="width:11%">R3</th>
      <th style="width:11%">${t.r_mastered}</th><th style="width:11%">${t.r_revisit}</th>
    </tr></thead><tbody>${Array.from({ length: 18 }, (_, i) =>
      `<tr style="height:13mm"><td>${String(i + 1).padStart(2, '0')}</td>${'<td></td>'.repeat(6)}</tr>`).join('')}</tbody></table>` }),
};

export const PAGE_ORDER = [
  'dashboard', 'blueprint', 'topic',
  'matrix-portrait', 'matrix-landscape-6', 'matrix-landscape-8',
  'distinction', 'traps', 'evidence', 'errorlog', 'compression', 'review',
];

/** Extra styles the blank forms need on top of the shared design system. */
export const BLANK_CSS = `
.blankmx thead .mx-cols th.wr { height: 13mm; vertical-align: top; }
.mkbox {
  display: block; width: 9mm; height: 3.6mm;
  border: .5pt dashed var(--ink-2); border-radius: .6mm; margin-bottom: 1.5mm;
}
.axisline { display: block; border-bottom: .6pt solid var(--rule); height: 5mm; }
.blankmx td.rowlab { background: var(--tint-1); }
.hf { display: flex; flex-direction: column; gap: 2mm; }
.hfr { display: flex; align-items: baseline; gap: 2mm; }
.hfr span {
  font-size: 7pt; letter-spacing: .08em; text-transform: uppercase;
  font-weight: 700; color: var(--muted); flex: 0 0 auto;
}
.hfr i { display: block; width: 42mm; border-bottom: .6pt solid var(--rule); height: 5mm; }
.meta dd.fill { min-height: 8mm; border-bottom: .6pt solid var(--hair); }
ol.essentials li { min-height: 16mm; padding-bottom: 8mm; }
ul.l3 li { min-height: 11mm; }
.one-sentence { background: #fff; }
`;

export function renderBlank(lang, pageKeys, css) {
  const t = T[lang] ?? T.en;
  const pages = pageKeys.map((k) => {
    const p = PAGES[k](t);
    return `<section class="page${p.land ? ' land' : ''}">${p.html}</section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><title>${esc(t.brand)} — ${esc(t.blank)}</title>
<style>${css}${BLANK_CSS}</style></head>
<body>${pages}</body></html>`;
}

export function blankFooter(lang) {
  const t = T[lang] ?? T.en;
  return `<div style="width:100%;font-family:'Noto Sans CJK KR',sans-serif;font-size:7pt;
      color:#6b727d;padding:2mm 15mm 6mm;display:flex;justify-content:space-between;
      border-top:.5pt solid #d8dce1;">
    <span>${esc(t.brand)} · ${esc(t.blank)}</span>
    <span></span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;
}

export const PAGE_LABELS = {
  en: {
    dashboard: '01-dashboard', blueprint: '02-blueprint', topic: '03-topic',
    'matrix-portrait': '04-matrix-portrait-4col', 'matrix-landscape-6': '05-matrix-landscape-6col',
    'matrix-landscape-8': '06-matrix-landscape-8col', distinction: '07-decisive-distinction',
    traps: '08-trap-matrix', evidence: '09-evidence-links', errorlog: '10-error-log',
    compression: '11-compression', review: '12-review-tracker',
  },
  ko: {
    dashboard: '01-대시보드', blueprint: '02-출제설계도', topic: '03-주제',
    'matrix-portrait': '04-매트릭스-세로-4열', 'matrix-landscape-6': '05-매트릭스-가로-6열',
    'matrix-landscape-8': '06-매트릭스-가로-8열', distinction: '07-결정적변별',
    traps: '08-함정매트릭스', evidence: '09-기출근거', errorlog: '10-오답기록',
    compression: '11-압축사다리', review: '12-복습추적',
  },
};
