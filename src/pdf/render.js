/**
 * HTML generation. Every page type lives here; nothing in this file knows
 * about YAML, and nothing in lib/ knows about markup.
 */

import { MARKERS } from './lib/archetypes.js';
import { planMatrix, columnWidths } from './lib/layout.js';
import { DIFFICULTY_GLYPH } from './lib/recall.js';

export const EDITIONS = {
  full:   { file: 'universal-study-notes.pdf' },
  recall: { file: 'universal-study-notes-recall.pdf' },
  key:    { file: 'universal-study-notes-answer-key.pdf' },
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const T = {
  en: {
    brand: 'Exam Matrix', notes: 'Study Notes',
    ed_full: 'Full Matrix · L1', ed_recall: 'Recall Edition', ed_key: 'Answer Key',
    dashboard: 'Exam Dashboard', blueprint: 'Exam Blueprint',
    exam_date: 'Exam date', days_left: 'Days remaining', passing: 'Passing criterion',
    target: 'Target score', confidence: 'Current confidence', syllabus: 'Syllabus / version',
    authority: 'Awarding body', subjects: 'Subjects', sources: 'Source materials',
    updated: 'Last updated', what_tests: 'What does this exam actually test?',
    cycle: 'The cycle',
    domain: 'Domain', weight: 'Weight', qtype: 'Question type', priority: 'Priority',
    last_review: 'Last review', high_yield: 'High-yield topics', weak: 'Weak topics',
    volatile: 'Volatile / version-sensitive', topic_index: 'Topic index',
    topic: 'Topic', archetype: 'Archetype', rows: 'Rows',
    why: 'Why it matters', frequency: 'Frequency', core_q: 'Core question',
    key_axis: 'Key comparison axis', prereq: 'Prerequisites', source: 'Source',
    one_sentence: 'One-sentence model',
    one_sentence_prompt: 'Explain this topic in ONE sentence, as if to someone sitting the exam tomorrow. If you cannot, you do not know it yet.',
    essentials: 'Five essential facts',
    essentials_hint: 'Maximum five. If you want a sixth, one of these was not essential.',
    matrix: 'Exam Matrix', cont: 'columns %s of %s',
    decisive: 'Decisive distinction',
    decisive_prompt: 'If an examiner forced me to separate these using ONE criterion, what would it be?',
    pairs: 'Confusion pairs',
    p_a: 'A', p_b: 'B', p_why: 'Why confused', p_clue: 'Decisive clue',
    traps: 'Exception & trap matrix',
    traps_hint: 'Only facts that can change an answer choice.',
    t_cue: 'Statement / cue', t_usually: 'Usually true', t_exc: 'Exception',
    t_why: 'Why it tricks people', t_src: 'Source',
    evidence: 'Question & evidence links',
    e_cell: 'Matrix cell', e_src: 'Source', e_exam: 'Exam / year',
    e_q: 'Question', e_as: 'Tested as', e_risk: 'Error risk',
    errorlog: 'Error log',
    errorlog_hint: 'Every conceptual mistake must name the matrix cell it invalidates.',
    l_date: 'Date', l_q: 'Question', l_topic: 'Topic', l_mine: 'My answer',
    l_correct: 'Correct', l_type: 'Error type', l_missing: 'Missing distinction',
    l_update: 'Matrix update', l_retest: 'Retest',
    compression: 'Compression ladder',
    l1n: 'Full Matrix', l1d: 'Every distinction, every exception, every source.',
    l2n: 'Exam-day Matrix', l2d: 'High-yield distinctions, exceptions, formulas, traps.',
    l3n: 'Last 10 minutes', l3d: 'One page. What you would forget under pressure.',
    l2h: 'Exam-day matrix — L2', l3h: 'Last-10-minutes sheet — L3',
    review: 'Review tracker',
    review_hint: 'Dates or ticks. Keep it secondary to the content.',
    r_learned: 'Learned', r_mastered: 'Mastered', r_revisit: 'Revisit',
    key_title: 'Answer Key', key_hint: 'Recall Edition — check only after you have written every cell.',
    legend: 'Markers',
    own_detail: 'Detail I added myself',
    howto: 'How to use these three files',
    howto_steps: [
      'Read the <b>Full</b> edition once. Do not memorise — just see what separates the rows.',
      'Do the <b>Recall</b> edition by hand. Write in the blanks without looking.',
      'Check against the <b>Answer key</b>. Circle what you got wrong.',
      'Fix the matrix cell you got wrong, rebuild, and the next Recall edition tests it again.',
    ],
    notation: 'How to read a cell',
    notation_hint: 'Markers are encoded three ways — label, border, tint — so nothing is lost in grayscale.',
    n_marker: 'Marker', n_means: 'Means', n_do: 'What to do with it',
    marker_means: {
      core: 'Baseline fact',
      distinction: 'This is what separates the rows',
      exception: 'The rule does not hold here',
      trap: 'Examiners build wrong answers from this',
      update: 'Version-sensitive — verify the date',
      evidence: 'Wording or source, quoted',
    },
    marker_do: {
      core: 'Know it. Low retrieval priority.',
      distinction: 'Be able to state it in one clause.',
      exception: 'Memorise the boundary, not the rule.',
      trap: 'Rehearse the wrong version and why it is wrong.',
      update: 'Re-check against the current text before the exam.',
      evidence: 'Recognise the phrasing on sight.',
    },
    risk: { high: 'High', mid: 'Mid', low: 'Low' },
    etypes: {
      'knowledge-gap': 'Knowledge gap', 'confused-pair': 'Confused pair',
      'exception-forgotten': 'Exception forgotten', 'wording-misread': 'Wording misread',
      'formula-selection': 'Formula selection', 'calculation': 'Calculation error',
      'procedure-order': 'Procedure order', 'outdated': 'Outdated information',
      'careless': 'Careless', 'time-pressure': 'Time pressure',
    },
  },
  ko: {
    brand: '시험 매트릭스', notes: '학습 노트',
    ed_full: '전체 매트릭스 · L1', ed_recall: '인출 훈련판', ed_key: '정답지',
    dashboard: '시험 대시보드', blueprint: '출제 설계도',
    exam_date: '시험일', days_left: 'D-day', passing: '합격 기준',
    target: '목표 점수', confidence: '현재 자신감', syllabus: '출제기준 · 버전',
    authority: '시행 기관', subjects: '과목', sources: '학습 자료',
    updated: '최종 수정', what_tests: '이 시험은 실제로 무엇을 묻는가?',
    cycle: '학습 순환',
    domain: '영역', weight: '비중', qtype: '문항 유형', priority: '우선순위',
    last_review: '최근 복습', high_yield: '빈출 주제', weak: '취약 주제',
    volatile: '개정 민감 주제', topic_index: '주제 색인',
    topic: '주제', archetype: '유형', rows: '행',
    why: '왜 중요한가', frequency: '출제 빈도', core_q: '핵심 질문',
    key_axis: '핵심 비교축', prereq: '선행 개념', source: '근거',
    one_sentence: '한 문장 모델',
    one_sentence_prompt: '내일 시험을 보는 사람에게 설명하듯, 이 주제를 한 문장으로 쓰시오. 쓰지 못하면 아직 아는 것이 아니다.',
    essentials: '핵심 사실 다섯 가지',
    essentials_hint: '최대 다섯 개. 여섯 번째가 필요하다면, 그중 하나는 핵심이 아니었다.',
    matrix: '엑셀표 매트릭스', cont: '열 %s / %s',
    decisive: '결정적 변별',
    decisive_prompt: '출제자가 단 하나의 기준으로만 이 둘을 구분하라고 한다면, 그 기준은 무엇인가?',
    pairs: '혼동 쌍',
    p_a: 'A', p_b: 'B', p_why: '왜 혼동되는가', p_clue: '결정적 단서',
    traps: '예외 · 함정 매트릭스',
    traps_hint: '답을 바꿀 수 있는 사실만 적는다.',
    t_cue: '진술 · 신호어', t_usually: '대체로 참', t_exc: '예외',
    t_why: '왜 속는가', t_src: '근거',
    evidence: '기출 · 근거 연결',
    e_cell: '매트릭스 셀', e_src: '출처', e_exam: '시험 · 연도',
    e_q: '문항', e_as: '기출 표현', e_risk: '오답 위험',
    errorlog: '오답 기록',
    errorlog_hint: '모든 개념 오류는 무효가 된 매트릭스 셀을 지목해야 한다.',
    l_date: '날짜', l_q: '문항', l_topic: '주제', l_mine: '내 답',
    l_correct: '정답', l_type: '오류 유형', l_missing: '놓친 변별점',
    l_update: '매트릭스 수정', l_retest: '재시험',
    compression: '압축 사다리',
    l1n: '전체 매트릭스', l1d: '모든 변별점, 모든 예외, 모든 근거.',
    l2n: '시험 당일 매트릭스', l2d: '빈출 변별점, 예외, 공식, 함정만.',
    l3n: '마지막 10분', l3d: '한 장. 압박 속에서 잊어버릴 것들.',
    l2h: '시험 당일 매트릭스 — L2', l3h: '마지막 10분 시트 — L3',
    review: '복습 추적',
    review_hint: '날짜 또는 체크. 학습 내용보다 앞서지 않게.',
    r_learned: '학습', r_mastered: '숙달', r_revisit: '재점검',
    key_title: '정답지', key_hint: '인출 훈련판용 — 모든 칸을 쓴 뒤에만 확인할 것.',
    legend: '표기',
    own_detail: '직접 추가한 디테일',
    howto: '이 세 가지를 이렇게 쓰세요',
    howto_steps: [
      '<b>전체본</b>을 한 번 읽는다. 외우려 하지 말고, 무엇이 다른지만 본다.',
      '<b>빈칸 문제지</b>를 손으로 채운다. 답을 보지 않고 쓴다.',
      '<b>정답지</b>로 채점한다. 틀린 것에 동그라미.',
      '틀린 칸을 고쳐서 다시 만든다. 다음 빈칸 문제지에 그 칸이 또 나온다.',
    ],
    notation: '셀 읽는 법',
    notation_hint: '표기는 라벨 · 테두리 · 음영 세 가지로 중복 인코딩되어 흑백 인쇄에서도 유지된다.',
    n_marker: '표기', n_means: '의미', n_do: '무엇을 할 것인가',
    marker_means: {
      core: '기본 사실',
      distinction: '행을 가르는 지점',
      exception: '원칙이 적용되지 않는 자리',
      trap: '출제자가 오답 선지를 만드는 자리',
      update: '개정 민감 — 시점 확인 필요',
      evidence: '기출 표현 또는 출처',
    },
    marker_do: {
      core: '알아두면 된다. 인출 우선순위 낮음.',
      distinction: '한 구절로 말할 수 있어야 한다.',
      exception: '원칙이 아니라 경계를 외운다.',
      trap: '틀린 형태와 그 이유를 함께 되뇐다.',
      update: '시험 전 현행 조문으로 재확인한다.',
      evidence: '문장을 보는 즉시 알아본다.',
    },
    risk: { high: '상', mid: '중', low: '하' },
    etypes: {
      'knowledge-gap': '지식 공백', 'confused-pair': '개념 혼동',
      'exception-forgotten': '예외 망각', 'wording-misread': '표현 오독',
      'formula-selection': '공식 선택', 'calculation': '계산 실수',
      'procedure-order': '절차 순서', 'outdated': '개정 미반영',
      'careless': '단순 실수', 'time-pressure': '시간 압박',
    },
  },
};

const CYCLE = ['LEARN', 'STRUCTURE', 'COMPARE', 'RETRIEVE', 'APPLY', 'CORRECT', 'COMPRESS'];

/**
 * Which markers this document actually uses. The legend teaches six of them,
 * which is a vocabulary test rather than a key when the learner has only used
 * two — so the table is filtered to what is genuinely on the page.
 */
/** Marker label in the document's own language — "갈림", not "DIST". */
function markLabel(k, t) {
  return t === T.ko ? MARKERS[k].label_ko : MARKERS[k].code;
}

function usedMarkers(model) {
  const used = new Set(['core']);
  for (const tp of model.topics) {
    tp.matrix.columns.forEach((c) => used.add(c.mark || 'core'));
    tp.matrix.rows.forEach((r) => r.cells.forEach((c) => used.add(c.mark || 'core')));
    if (tp.traps.length) used.add('trap');
    if (tp.evidence.length) used.add('evidence');
  }
  for (const i of model.compression?.l2 ?? []) if (i.mark) used.add(i.mark);
  return Object.keys(MARKERS).filter((k) => used.has(k));
}

/* ------------------------------------------------------------------ utils */

const list = (arr, cls = '') =>
  (arr ?? []).length
    ? `<ul class="${cls}" style="margin:0;padding-left:4.5mm">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
    : '<span style="color:var(--muted)">—</span>';

const confDots = (n) =>
  n ? `<span class="pill b wide">${'●'.repeat(n)}${'○'.repeat(5 - n)} ${n}/5</span>` : '—';

/** Body height in mm left by the @page margins in styles.css. */
const PAGE_BODY = { portrait: 266, landscape: 182 };
/** Conservative allowances for the furniture that shares a matrix page. */
const CHROME = { head: 32, headCont: 4, thead: 15, legend: 9, own: 32 };

/**
 * Decides the matrix row height, and whether the "detail I added myself" block
 * still fits underneath.
 *
 * Short matrices are stretched so they use their page instead of stranding two
 * thirds of it; long ones fall back to the readable minimum and paginate with a
 * repeated header. Font size is never the variable. The `own` decision exists
 * because a ruled block that overflows produces a page containing nothing but
 * three lines, which is exactly the awkward empty page we are trying to avoid.
 */
function matrixMetrics(nRows, orientation, edition, isFirstChunk) {
  const base = PAGE_BODY[orientation]
    - (isFirstChunk ? CHROME.head : CHROME.headCont)
    - CHROME.thead - CHROME.legend;
  const { min, max } = edition === 'recall' ? { min: 16, max: 32 } : { min: 9, max: 22 };

  const withOwn = base - CHROME.own;
  if (nRows * min <= withOwn) {
    const rh = Math.min(max, Math.floor(withOwn / nRows));
    // Whatever the rows do not use becomes ruled writing space rather than a
    // stranded third of a page. Capped so it never reads as padding.
    const ownH = Math.max(18, Math.min(72, base - nRows * rh - 10));
    return { rh, own: true, ownH };
  }
  if (nRows * min <= base) {
    return { rh: Math.min(max, Math.floor(base / nRows)), own: false, ownH: 0 };
  }
  return { rh: min, own: false, ownH: 0 };
}

function head(t, { eyebrow, title, sub, rhs }) {
  return `<header class="page-head">
    <div>
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h1 class="title">${esc(title)}</h1>
      ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
    </div>
    ${rhs ? `<div class="rhs">${rhs}</div>` : ''}
  </header>`;
}

function legend(t, model) {
  const keys = model ? usedMarkers(model) : Object.keys(MARKERS);
  return `<div class="legend">${keys.map((k) =>
    `<span>${MARKERS[k].sigil ? MARKERS[k].sigil + ' ' : ''}<b>${esc(markLabel(k, t))}</b>` +
    `${t === T.ko ? '' : ' ' + esc(MARKERS[k].label_ko)}</span>`
  ).join('')}</div>`;
}

/* ------------------------------------------------------------------- pages */

function pageDashboard(model, t, edLabel) {
  const e = model.exam;
  const dd = e.days_remaining;

  // Print what the learner actually filled in. A dashboard of em-dashes is the
  // fastest way to make a first-time user think they did it wrong, so every
  // block here is omitted rather than stubbed when it has no content.
  const metaCells = [
    e.date        && `<div><dt>${t.exam_date}</dt><dd class="big">${esc(e.date)}</dd></div>`,
    dd !== null   && `<div><dt>${t.days_left}</dt><dd class="big">${dd >= 0 ? `D-${dd}` : `D+${-dd}`}</dd></div>`,
    e.target_score && `<div><dt>${t.target}</dt><dd class="big">${esc(e.target_score)}</dd></div>`,
    e.passing     && `<div><dt>${t.passing}</dt><dd>${esc(e.passing)}</dd></div>`,
    e.syllabus_version && `<div><dt>${t.syllabus}</dt><dd>${esc(e.syllabus_version)}</dd></div>`,
    e.confidence  && `<div><dt>${t.confidence}</dt><dd>${confDots(e.confidence)}</dd></div>`,
  ].filter(Boolean);

  const subjects = (e.subjects ?? []).length, sources = (e.sources ?? []).length;
  const tests = (e.what_it_tests ?? []).length;
  // The cycle strip is orientation for someone running the whole method. On a
  // first, single-topic note it is just vocabulary the learner did not ask for.
  const showCycle = model.topics.length > 1
    || (model.compression?.l2?.length ?? 0) > 0
    || model.error_log.length > 0;

  return `<section class="page">
  ${head(t, {
    eyebrow: `${t.brand} · ${t.notes}`,
    title: e.name,
    sub: [e.name_sub, e.authority].filter(Boolean).join(' · '),
    rhs: `<div><b>${esc(edLabel)}</b></div>${e.last_updated ? `<div>${t.updated}: ${esc(e.last_updated)}</div>` : ''}`,
  })}

  ${metaCells.length ? `<div class="meta block">${metaCells.join('')}</div>` : ''}

  ${tests ? `<h2 class="section">${t.what_tests}</h2>
  <div class="block">${list(e.what_it_tests)}</div>` : ''}

  ${(subjects || sources) ? `<div class="meta two block">
    ${subjects ? `<div><dt>${t.subjects}</dt><dd>${list(e.subjects)}</dd></div>` : ''}
    ${sources ? `<div><dt>${t.sources}</dt><dd>${list(e.sources)}</dd></div>` : ''}
  </div>` : ''}

  ${showCycle ? '' : `<h2 class="section">${t.howto}</h2>
  <ol class="howto block">${t.howto_steps.map((x) => `<li>${x}</li>`).join('')}</ol>`}

  ${showCycle ? `<h2 class="section">${t.cycle}</h2>
  <div class="block" style="display:flex;gap:1.5mm;font-family:var(--font-mono);font-size:7pt;letter-spacing:.06em">
    ${CYCLE.map((c, i) => `<span style="flex:1;text-align:center;padding:1.8mm .5mm;border:.6pt solid var(--rule);${i === 5 ? 'border-width:1.4pt;border-color:var(--ink)' : ''}">${c}</span>`).join('<span style="align-self:center;color:var(--muted)">›</span>')}
  </div>
  <p class="note">${esc(t === T.ko
    ? 'CORRECT 단계가 이 시스템의 핵심이다. 오답은 매트릭스의 특정 셀을 수정하며, 그 셀은 다음 인출 훈련에서 다시 출제된다.'
    : 'CORRECT is the load-bearing step. A wrong answer edits a named matrix cell, and that cell comes back in the next recall pass.')}</p>` : ''}

  <h2 class="section">${t.notation}<span class="hint">${t.notation_hint}</span></h2>
  <table class="block">
    <thead><tr><th style="width:16%">${t.n_marker}</th><th style="width:34%">${t.n_means}</th>
      <th>${t.n_do}</th></tr></thead>
    <tbody>${usedMarkers(model).map((k) => `<tr>
      <td class="m-${k}"><span class="chip">${MARKERS[k].sigil} ${esc(markLabel(k, t))}</span></td>
      <td>${esc(t.marker_means[k])}</td>
      <td>${esc(t.marker_do[k])}</td>
    </tr>`).join('')}</tbody>
  </table>
</section>`;
}

function pageBlueprint(model, t) {
  const e = model.exam;
  const bp = e.blueprint ?? [];
  const lists = (e.high_yield ?? []).length + (e.weak ?? []).length + (e.volatile ?? []).length;
  // Nothing to plan and only one topic to index — the page would be a header
  // over three empty boxes, so it is not printed at all.
  if (!bp.length && !lists && model.topics.length < 2) return '';
  return `<section class="page">
  ${head(t, { eyebrow: t.brand, title: t.blueprint, sub: e.name })}

  ${bp.length ? `<table class="block">
    <thead><tr>
      <th style="width:32%">${t.domain}</th><th style="width:9%">${t.weight}</th>
      <th style="width:22%">${t.qtype}</th><th style="width:9%">${t.priority}</th>
      <th style="width:14%">${t.confidence}</th><th style="width:14%">${t.last_review}</th>
    </tr></thead>
    <tbody>${bp.map((b) => `<tr>
      <td><b>${esc(b.domain)}</b></td>
      <td>${esc(b.weight ?? '')}${typeof b.weight === 'number' ? '%' : ''}</td>
      <td>${esc(b.question_type ?? '')}</td>
      <td>${b.priority ? `<span class="pill ${b.priority === 'A' ? 'a' : 'b'}">${b.priority}</span>` : ''}</td>
      <td>${b.confidence ? confDots(b.confidence) : ''}</td>
      <td>${esc(b.last_review ?? '')}</td>
    </tr>`).join('')}</tbody>
  </table>` : ''}

  ${lists ? `<div class="meta block">
    <div><dt>${t.high_yield}</dt><dd>${list(e.high_yield)}</dd></div>
    <div><dt>${t.weak}</dt><dd>${list(e.weak)}</dd></div>
    <div><dt>${t.volatile}</dt><dd>${list(e.volatile)}</dd></div>
  </div>` : ''}

  <h2 class="section">${t.topic_index}</h2>
  <table class="toc block">
    <thead><tr><th>#</th><th>${t.topic}</th><th style="width:22%">${t.archetype}</th>
      <th style="width:10%">${t.priority}</th><th style="width:10%">${t.rows}</th></tr></thead>
    <tbody>${model.topics.map((tp) => `<tr>
      <td>${String(tp.index).padStart(2, '0')}</td>
      <td><b>${esc(tp.title)}</b>${tp.key_axis ? `<div style="color:var(--muted);font-size:8pt">${esc(tp.key_axis)}</div>` : ''}</td>
      <td>${esc(tp.archetypeLabel)}</td>
      <td>${tp.importance ? `<span class="pill ${tp.importance === 'A' ? 'a' : 'b'}">${tp.importance}</span>` : ''}</td>
      <td>${tp.matrix.rows.length}</td>
    </tr>`).join('')}</tbody>
  </table>
</section>`;
}

function pageTopicOpen(tp, model, t, edition) {
  const isRecall = edition === 'recall';
  const os = tp.one_sentence;
  return `<section class="page">
  ${head(t, {
    eyebrow: `${t.topic} ${String(tp.index).padStart(2, '0')} · ${tp.archetypeLabel}`,
    title: tp.title,
    sub: tp.key_axis ? `${t.key_axis}: ${tp.key_axis}` : '',
    rhs: `${tp.importance ? `<div><span class="pill ${tp.importance === 'A' ? 'a' : 'b'}">${tp.importance}</span></div>` : ''}
          ${tp.frequency ? `<div>${esc(tp.frequency)}</div>` : ''}
          ${tp.updated ? `<div>${t.updated}: ${esc(tp.updated)}</div>` : ''}`,
  })}

  <div class="block">
    ${tp.why ? `<p class="kv"><b>${t.why}</b><br>${esc(tp.why)}</p>` : ''}
    ${tp.core_question ? `<p class="kv"><b>${t.core_q}</b><br>${esc(tp.core_question)}</p>` : ''}
    <p class="kv"><b>${t.prereq}</b> ${esc((tp.prerequisites ?? []).join(' · ') || '—')}
       &nbsp;&nbsp;<b>${t.source}</b> ${esc((tp.sources ?? []).join(' · ') || '—')}</p>
  </div>

  <h2 class="section">${t.one_sentence}</h2>
  <div class="one-sentence block">
    <div class="prompt">${t.one_sentence_prompt}</div>
    ${(!isRecall && os)
      ? `<div class="answer">${esc(os)}</div>`
      : `<div class="lines short">${isRecall && tp.recall_one_sentence
            ? `<span class="blank-tag">⟨${tp.recall_one_sentence.ref}⟩</span>` : ''}</div>`}
  </div>

  <h2 class="section">${t.essentials}<span class="hint">${t.essentials_hint}</span></h2>
  <ol class="essentials block">
    ${Array.from({ length: 5 }, (_, i) => {
      const v = tp.essentials[i];
      return `<li><span>${v ? esc(v) : ''}</span></li>`;
    }).join('')}
  </ol>
</section>`;
}

function matrixTable(tp, chunk, plan, t, edition) {
  const isRecall = edition === 'recall';
  const w = columnWidths(chunk, tp.matrix.rows, plan.orientation);
  const { rh } = matrixMetrics(tp.matrix.rows.length, plan.orientation, edition, chunk.index === 1);
  const contLabel = plan.chunks.length > 1
    ? `<span class="cont">${t.cont.replace('%s', chunk.index).replace('%s', chunk.total)}</span>` : '';

  const headCells = chunk.columns.map((c) => {
    const m = MARKERS[c.mark];
    const chip = c.mark && c.mark !== 'core' ? `<span class="chip">${m.sigil} ${esc(markLabel(c.mark, t))}</span><br>` : '';
    return `<th>${chip}${esc(c.label)}</th>`;
  }).join('');

  const body = tp.matrix.rows.map((r) => {
    const cells = chunk.indices.map((ci) => {
      const c = r.cells[ci];
      const cls = `m-${c.mark}${isRecall && c.blank ? ' blank' : ''}`;
      if (isRecall && c.blank) {
        return `<td class="${cls}"><span class="blank-tag">${c.ref}</span>` +
               `<span class="blank-diff">${DIFFICULTY_GLYPH[c.difficulty]}</span></td>`;
      }
      const colMark = chunk.columns[chunk.indices.indexOf(ci)]?.mark;
      const sig = (c.mark !== 'core' && c.mark !== colMark) ? `<span class="sigil">${MARKERS[c.mark].sigil}</span>` : '';
      return `<td class="${cls}">${sig}${esc(c.v) || '<span style="color:var(--hair)">—</span>'}` +
             `${c.note ? `<span class="cell-note">${esc(c.note)}</span>` : ''}</td>`;
    }).join('');
    return `<tr style="height:${rh}mm"><td class="rowlab">${esc(r.label)}${r.sub ? `<span class="sub">${esc(r.sub)}</span>` : ''}</td>${cells}</tr>`;
  }).join('');

  return `<table class="matrix${isRecall ? ' recall' : ''}">
    <colgroup><col style="width:${w.label}%">${w.cols.map((c) => `<col style="width:${c}%">`).join('')}</colgroup>
    <thead>
      <tr class="mx-title"><th colspan="${chunk.columns.length + 1}">${esc(tp.title)} — ${t.matrix}${contLabel}</th></tr>
      <tr class="mx-cols"><th class="rowlab">${esc(tp.matrix.row_label)}</th>${headCells}</tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;
}

function pagesMatrix(tp, model, t, edition) {
  const plan = planMatrix(tp.matrix, edition === 'recall' ? 'recall' : 'full');
  return plan.chunks.map((chunk, i) => {
    const { own, ownH } = matrixMetrics(tp.matrix.rows.length, plan.orientation, edition, chunk.index === 1);
    return `<section class="page${plan.orientation === 'landscape' ? ' land' : ''}">
    ${i === 0 ? head(t, {
      eyebrow: `${t.topic} ${String(tp.index).padStart(2, '0')} · ${t.matrix}`,
      title: tp.title,
      sub: tp.matrix.note ?? '',
      rhs: `<div>${esc(tp.archetypeLabel)}</div><div>${tp.matrix.rows.length} × ${tp.matrix.columns.length}</div>`,
    }) : ''}
    ${matrixTable(tp, chunk, plan, t, edition)}
    ${legend(t, model)}
    ${own ? `<div class="own"><div class="lbl">${t.own_detail}</div>
      <div class="lines" style="min-height:${ownH}mm"></div></div>` : ''}
  </section>`;
  }).join('');
}

function pageDistinction(tp, model, t, edition) {
  const isRecall = edition === 'recall';
  const d = tp.decisive;
  const hasAny = d || tp.traps.length || tp.evidence.length;
  if (!hasAny) return '';

  const decisive = d ? `
  <h2 class="section">${t.decisive}</h2>
  <div class="decisive block">
    <div class="q">${esc(d.prompt ?? t.decisive_prompt)}</div>
    ${(!isRecall && d.answer)
      ? `<div class="a">${esc(d.answer)}</div>`
      : `<div class="lines short">${isRecall && d.recall ? `<span class="blank-tag">⟨${d.recall.ref}⟩</span>` : ''}</div>`}
  </div>
  ${(d.pairs ?? []).length ? `
  <h2 class="section">${t.pairs}</h2>
  <table class="block">
    <thead><tr><th style="width:19%">${t.p_a}</th><th style="width:19%">${t.p_b}</th>
      <th style="width:31%">${t.p_why}</th><th style="width:31%">${t.p_clue}</th></tr></thead>
    <tbody>${d.pairs.map((p) => `<tr style="height:13mm">
      <td><b>${esc(p.a)}</b></td><td><b>${esc(p.b)}</b></td><td>${esc(p.why ?? '')}</td>
      <td class="m-distinction">${(!isRecall || !p.recall) ? esc(p.clue ?? '')
        : `<span class="blank-tag">⟨${p.recall.ref}⟩</span><span class="blank-diff">${DIFFICULTY_GLYPH.high}</span>`}</td>
    </tr>`).join('')}</tbody>
  </table>` : ''}` : '';

  const traps = tp.traps.length ? `
  <h2 class="section">${t.traps}<span class="hint">${t.traps_hint}</span></h2>
  <table class="block">
    <thead><tr><th style="width:28%">${t.t_cue}</th><th style="width:16%">${t.t_usually}</th>
      <th style="width:24%">${t.t_exc}</th><th style="width:22%">${t.t_why}</th>
      <th style="width:10%">${t.t_src}</th></tr></thead>
    <tbody>${tp.traps.map((tr) => `<tr style="height:13mm">
      <td><span class="sigil">${MARKERS.trap.sigil}</span>${esc(tr.cue)}</td>
      <td>${esc(tr.usually ?? '')}</td>
      <td class="m-exception">${(!isRecall || !tr.recall) ? esc(tr.exception ?? '')
        : `<span class="blank-tag">⟨${tr.recall.ref}⟩</span><span class="blank-diff">${DIFFICULTY_GLYPH.high}</span>`}</td>
      <td>${esc(tr.why ?? '')}</td>
      <td style="font-size:7.5pt">${esc(tr.source ?? '')}</td>
    </tr>`).join('')}</tbody>
  </table>` : '';

  const evidence = tp.evidence.length ? `
  <h2 class="section">${t.evidence}</h2>
  <table class="block">
    <thead><tr><th style="width:22%">${t.e_cell}</th><th style="width:14%">${t.e_src}</th>
      <th style="width:12%">${t.e_exam}</th><th style="width:12%">${t.e_q}</th>
      <th style="width:29%">${t.e_as}</th><th class="nowrap" style="width:11%">${t.e_risk}</th></tr></thead>
    <tbody>${tp.evidence.map((ev) => `<tr>
      <td style="font-size:8pt">${esc(ev.cellRef?.short ?? ev.cellRef?.text ?? '')}</td>
      <td style="font-size:8pt">${esc(ev.source ?? '')}</td>
      <td style="font-size:8pt">${esc(ev.exam ?? '')}</td>
      <td style="font-size:8pt">${esc(ev.question ?? '')}</td>
      <td class="m-evidence">${esc(ev.tested_as ?? '')}</td>
      <td>${ev.risk ? `<span class="pill ${ev.risk === 'high' ? 'a' : 'b'}">${t.risk[ev.risk]}</span>` : ''}</td>
    </tr>`).join('')}</tbody>
  </table>` : '';

  return `<section class="page">
    ${head(t, {
      eyebrow: `${t.topic} ${String(tp.index).padStart(2, '0')} · ${t.decisive}`,
      title: tp.title,
      rhs: `<div>${esc(tp.archetypeLabel)}</div>`,
    })}
    ${decisive}${traps}${evidence}
  </section>`;
}

function pageErrorLog(model, t) {
  const rows = model.error_log;
  // Round the blank rows up to a whole page so the log never spills two rows
  // onto an otherwise empty sheet.
  const PER_PAGE = 11;
  const wanted = rows.length + (model.blank_rows.error_log ?? 9);
  const blanks = PER_PAGE * Math.ceil(wanted / PER_PAGE) - rows.length;
  const cell = (v) => `<td>${esc(v ?? '')}</td>`;
  const body = [
    ...rows.map((e) => `<tr style="height:12mm">
      <td class="nowrap">${esc(e.date ?? '')}</td>${cell(e.question)}${cell(e.topic)}${cell(e.mine)}${cell(e.correct)}
      <td>${e.error_type ? `<span class="pill b">${esc(t.etypes[e.error_type])}</span>` : ''}</td>
      ${cell(e.missing_distinction)}
      <td class="m-distinction" style="font-size:8pt">${esc(e.matrix_update?.text ?? '')}</td>
      ${cell(e.retest)}</tr>`),
    ...Array.from({ length: blanks }, () => `<tr style="height:12mm">${'<td></td>'.repeat(9)}</tr>`),
  ].join('');

  return `<section class="page land">
  ${head(t, { eyebrow: t.brand, title: t.errorlog, sub: t.errorlog_hint })}
  <table>
    <thead><tr>
      <th class="nowrap" style="width:8%">${t.l_date}</th><th style="width:9%">${t.l_q}</th>
      <th style="width:12%">${t.l_topic}</th><th style="width:7%">${t.l_mine}</th>
      <th style="width:7%">${t.l_correct}</th><th style="width:11%">${t.l_type}</th>
      <th style="width:18%">${t.l_missing}</th><th style="width:21%">${t.l_update}</th>
      <th class="nowrap" style="width:8%">${t.l_retest}</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>
  <div class="legend">${Object.entries(t.etypes).map(([, v]) => `<span>· ${esc(v)}</span>`).join('')}</div>
</section>`;
}

function pageCompression(model, t) {
  const c = model.compression ?? {};
  const l2 = c.l2 ?? [], l3 = c.l3 ?? [];
  return `<section class="page">
  ${head(t, { eyebrow: t.brand, title: t.compression, sub: model.exam.name })}
  <div class="ladder block">
    <div><div class="lv">L1</div><div class="nm">${t.l1n}</div><div class="ds">${t.l1d}</div></div>
    <div><div class="lv">L2</div><div class="nm">${t.l2n}</div><div class="ds">${t.l2d}</div></div>
    <div><div class="lv">L3</div><div class="nm">${t.l3n}</div><div class="ds">${t.l3d}</div></div>
  </div>

  <h2 class="section">${t.l2h}</h2>
  ${l2.length ? `<table class="block"><thead><tr>
      <th class="nowrap" style="width:12%">${t.legend}</th><th style="width:32%">${t.topic}</th><th>${t.p_clue}</th>
    </tr></thead><tbody>${l2.map((i) => `<tr style="height:10mm">
      <td>${i.mark ? `<span class="chip">${MARKERS[i.mark].sigil} ${esc(markLabel(i.mark, t))}</span>` : ''}</td>
      <td class="${i.mark ? `m-${i.mark}` : ''}"><b>${esc(i.item)}</b></td>
      <td>${esc(i.detail ?? '')}</td></tr>`).join('')}</tbody></table>`
    : '<div class="lines tall block"></div>'}

  <h2 class="section">${t.l3h}</h2>
  ${l3.length ? `<ul class="l3 block">${l3.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
    : '<div class="lines tall block"></div>'}

  ${reviewTable(model, t)}
</section>`;
}

/**
 * Review state rides along at the foot of the compression page rather than
 * claiming one of its own. It is bookkeeping, and the brief this was built
 * against is explicit that it must stay subordinate to the learning content.
 */
function reviewTable(model, t) {
  return `
  <h2 class="section">${t.review}<span class="hint">${t.review_hint}</span></h2>
  <table class="review block">
    <thead><tr>
      <th style="width:34%">${t.topic}</th><th style="width:11%">${t.r_learned}</th>
      <th style="width:11%">R1</th><th style="width:11%">R2</th><th style="width:11%">R3</th>
      <th style="width:11%">${t.r_mastered}</th><th style="width:11%">${t.r_revisit}</th>
    </tr></thead>
    <tbody>${model.topics.map((tp) => `<tr>
      <td>${String(tp.index).padStart(2, '0')} &nbsp; ${esc(tp.title)}</td>
      ${'<td></td>'.repeat(6)}</tr>`).join('')}</tbody>
  </table>`;
}

function pagesAnswerKey(model, t) {
  const key = model.recall?.key ?? [];
  return `<section class="page">
  ${head(t, { eyebrow: `${t.brand} · ${t.ed_key}`, title: t.key_title, sub: t.key_hint,
              rhs: `<div>${model.recall?.total ?? 0} items</div>` })}
  <div class="answer-key">
    ${key.map((k) => `<div class="ak-topic">
      <h3>${String(k.topic.index).padStart(2, '0')} · ${esc(k.topic.title)}</h3>
      <ol>${k.items.map((i) => `<li>
        <span class="n">⟨${i.ref}⟩</span> ${esc(i.answer)}
        <div class="w">${esc(i.where)} · ${DIFFICULTY_GLYPH[i.difficulty]}</div>
      </li>`).join('')}</ol>
    </div>`).join('')}
  </div>
</section>`;
}

/* ------------------------------------------------------------------ export */

export function renderDocument(model, edition, css) {
  const t = T[model.lang] ?? T.en;
  const edLabel = { full: t.ed_full, recall: t.ed_recall, key: t.ed_key }[edition];

  let pages;
  if (edition === 'key') {
    pages = pagesAnswerKey(model, t);
  } else {
    pages = [
      pageDashboard(model, t, edLabel),
      pageBlueprint(model, t),
      ...model.topics.flatMap((tp) => [
        pageTopicOpen(tp, model, t, edition),
        pagesMatrix(tp, model, t, edition),
        pageDistinction(tp, model, t, edition),
      ]),
      pageErrorLog(model, t),
      pageCompression(model, t),
    ].filter(Boolean).join('\n');
  }

  return `<!doctype html>
<html lang="${model.lang}">
<head>
<meta charset="utf-8">
<title>${esc(model.exam.name)} — ${esc(edLabel)}</title>
<style>${css}</style>
</head>
<body>
${pages}
</body>
</html>`;
}

export function footerTemplate(model, edition) {
  const t = T[model.lang] ?? T.en;
  const edLabel = { full: t.ed_full, recall: t.ed_recall, key: t.ed_key }[edition];
  // padding-bottom lifts the footer clear of the trim edge: Chromium bottom-aligns
  // this box inside the page margin, so without it the text sits ~4mm from the cut.
  return `<div style="width:100%;font-family:'Noto Sans CJK KR',sans-serif;font-size:7pt;
      color:#6b727d;padding:2mm 15mm 6mm;display:flex;justify-content:space-between;
      border-top:.5pt solid #d8dce1;">
    <span>${esc(model.exam.name)} · ${esc(edLabel)}</span>
    <span>${esc(t.brand)}</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;
}
