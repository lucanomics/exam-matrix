#!/usr/bin/env node
/**
 * Assembles the static site in public/ from artefacts that are already built.
 *
 * Deliberately dependency-free and browser-free: it only copies files and
 * writes one HTML page. The PDFs are generated locally (Chromium + CJK fonts
 * required) and committed, so the hosting build never has to install a browser
 * or a font package — which is what makes this deployable to Vercel at all.
 *
 *   node scripts/build-site.js
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public');
const FILES = path.join(OUT, 'files');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(FILES, { recursive: true });

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyTree(path.join(ROOT, 'output'), FILES);
fs.copyFileSync(path.join(ROOT, 'legacy', 'editor', 'editor.html'), path.join(OUT, 'editor.html'));

const kb = (p) => Math.round(fs.statSync(p).size / 1024);
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

function listDir(rel) {
  const abs = path.join(FILES, rel);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter((f) => f.endsWith('.pdf'))
    .sort()
    .map((f) => ({
      name: f.replace(/\.pdf$/, ''),
      href: `files/${enc(rel ? rel + '/' + f : f)}`,
      kb: kb(path.join(abs, f)),
    }));
}

const blankKo = listDir('blank/ko');
const blankEn = listDir('blank/en');
const workbooks = listDir('blank').filter((f) => f.name.startsWith('exam-matrix-blank'));
const notes = listDir('');
const examples = listDir('examples');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dl = (items) => items.map((i) =>
  `<a class="dl" href="${i.href}" download><span class="n">${esc(i.name)}</span><span class="s">${i.kb} KB</span></a>`
).join('');

const page = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>시험표 만들기 — 헷갈리는 걸 표로 만들면 시험지가 나옵니다</title>
<meta name="description" content="헷갈리는 것 둘을 나란히 놓고 뭐가 다른지 채우면, 전체본·빈칸 문제지·정답지 세 가지 PDF가 만들어집니다. 설치 없이 브라우저에서.">
<style>
:root{
  --ink:#15181d; --ink-2:#3f454f; --muted:#6d7480; --rule:#c6ccd4; --hair:#e4e8ec;
  --accent:#1f5fa8; --accent-d:#17497f; --bg:#f4f6f8; --panel:#fff; --tint:#eef1f5;
  --sans:"Pretendard","Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:var(--sans);color:var(--ink);background:var(--bg);line-height:1.65;
  word-break:keep-all;overflow-wrap:break-word;-webkit-text-size-adjust:100%}
.wrap{max-width:940px;margin:0 auto;padding:0 20px}
a{color:var(--accent)}

/* ------------------------------------------------------------------- hero */
header.hero{background:linear-gradient(170deg,#1b2028,#12161c);color:#fff;padding:64px 0 56px}
header.hero h1{font-size:40px;line-height:1.22;margin:0 0 16px;font-weight:800;letter-spacing:-.03em}
header.hero h1 em{font-style:normal;color:#8fc0f0}
header.hero p{margin:0 0 30px;max-width:60ch;color:#ccd4dd;font-size:17px}
header.hero p b{color:#fff}
.cta{display:inline-flex;align-items:center;gap:12px;background:#2f7fd4;color:#fff;
  text-decoration:none;padding:17px 32px;border-radius:11px;font-weight:800;font-size:18px;
  box-shadow:0 6px 20px rgba(47,127,212,.35)}
.cta:hover{background:#3d8ee0}
.cta .s{font-weight:400;opacity:.85;font-size:14px}
.sub{margin-top:14px;font-size:13.5px;color:#98a3af}

/* ----------------------------------------------------------------- 3 steps */
.how{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:26px}
@media(max-width:760px){.how{grid-template-columns:1fr}}
.hstep{background:var(--panel);border:1px solid var(--hair);border-radius:13px;padding:20px}
.hstep .n{width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;
  display:grid;place-items:center;font-weight:800;font-size:14px;margin-bottom:12px}
.hstep h3{margin:0 0 6px;font-size:16px}
.hstep p{margin:0;font-size:14px;color:var(--muted);line-height:1.55}

/* -------------------------------------------------------------- mini table */
.demo{background:var(--panel);border:1px solid var(--hair);border-radius:13px;padding:20px;margin-top:8px}
.demo table{border-collapse:collapse;width:100%;font-size:13.5px}
.demo th,.demo td{border:1px solid var(--hair);padding:8px 10px;text-align:left;vertical-align:top}
.demo thead th{background:var(--tint);font-size:12.5px}
.demo td.rl{background:#f8fafb;font-weight:700}
.demo .mk{display:inline-block;font-family:var(--mono);font-size:10px;border:1px solid var(--rule);
  border-radius:3px;padding:0 4px;margin-bottom:3px;color:var(--ink-2)}
.demo td.d{background:#f2f4f7;border-left:3px solid var(--ink-2)}
.demo td.t{background:#f4f2f5;border-left:3px solid var(--ink)}
.demo .cap{font-size:13px;color:var(--muted);margin:0 0 12px}

/* --------------------------------------------------------------- sections */
section{padding:52px 0;border-bottom:1px solid var(--hair)}
section:last-of-type{border-bottom:none}
h2{font-size:26px;margin:0 0 8px;font-weight:800;letter-spacing:-.02em}
h2 .en{font-size:13px;font-weight:400;color:var(--muted);margin-left:10px;letter-spacing:0}
.lede{color:var(--ink-2);max-width:66ch;margin:0 0 22px;font-size:15.5px}
.lede b{color:var(--ink)}

.dlgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px;margin-top:12px}
a.dl{display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--panel);
  border:1px solid var(--hair);border-radius:8px;padding:11px 14px;text-decoration:none;color:var(--ink);font-size:14px}
a.dl:hover{border-color:var(--accent);background:#fbfcfd}
a.dl .n{font-family:var(--mono);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
a.dl .s{color:var(--muted);font-size:11px;flex:0 0 auto;font-family:var(--mono)}
h3.sub2{font-size:13.5px;margin:24px 0 0;letter-spacing:.02em;color:var(--ink-2);font-weight:800}

.note{background:#f2f8ff;border:1px solid #cfe2f5;border-radius:11px;padding:15px 17px;
  font-size:14.5px;color:#1c4570;margin-top:20px}
.note b{color:#123a63}
details{background:var(--panel);border:1px solid var(--hair);border-radius:11px;padding:0;margin-top:14px}
details summary{padding:15px 18px;cursor:pointer;font-weight:700;font-size:15px}
details .dbody{padding:0 18px 18px;font-size:14.5px;color:var(--ink-2);line-height:1.7}
details .dbody p{margin:0 0 12px}
footer{padding:34px 0 64px;font-size:13px;color:var(--muted)}
footer p{margin:0 0 8px;max-width:74ch}
code{font-family:var(--mono);font-size:12.5px;background:var(--tint);padding:1px 5px;border-radius:4px}
</style>
</head>
<body>

<header class="hero"><div class="wrap">
  <h1>헷갈리는 걸 표로 만들면,<br><em>시험지</em>가 나옵니다</h1>
  <p>헷갈리는 것 <b>둘</b>을 나란히 놓고, <b>뭐가 다른지</b> 칸을 채우세요.
  그러면 <b>전체본 · 빈칸 문제지 · 정답지</b> 세 가지가 만들어집니다.
  설치도 회원가입도 없고, 아이패드에서도 됩니다.</p>
  <a class="cta" href="editor.html">지금 만들기 <span class="s">3분이면 됩니다</span></a>
  <div class="sub">브라우저에서 바로 인쇄 → “PDF로 저장”을 고르면 파일이 됩니다.</div>
</div></header>

<section><div class="wrap">
  <h2>이렇게 만듭니다<span class="en">3 steps</span></h2>
  <div class="how">
    <div class="hstep"><div class="n">1</div><h3>헷갈리는 것 적기</h3>
      <p>예: <b>동화 / 조절</b>, <b>TCP / UDP</b>. 둘 이상이면 됩니다.</p></div>
    <div class="hstep"><div class="n">2</div><h3>비교 기준 고르기</h3>
      <p>뜻 · 특징 · 차이점 · 예외 · 함정. 버튼으로 골라 담으면 됩니다.</p></div>
    <div class="hstep"><div class="n">3</div><h3>칸 채우고 인쇄</h3>
      <p>아는 것만 채워도 됩니다. 빈 칸은 알아서 빠집니다.</p></div>
  </div>

  <div class="demo" style="margin-top:22px">
    <p class="cap">만들어지는 표는 이렇게 생겼습니다 — 표시한 칸이 <b>빈칸 문제지</b>에서 먼저 가려집니다.</p>
    <table>
      <thead><tr><th style="width:16%">비교할 것</th>
        <th>연결 방식 <br><span class="mk">◆ 갈림</span></th>
        <th>헤더 크기 <br><span class="mk">■ 함정</span></th>
        <th>쓰는 곳</th></tr></thead>
      <tbody>
        <tr><td class="rl">TCP</td><td class="d">연결형 — 3-way handshake</td>
          <td class="t">20바이트</td><td>웹, 파일 전송, 메일</td></tr>
        <tr><td class="rl">UDP</td><td class="d">비연결형 — handshake 없음</td>
          <td class="t">8바이트</td><td>영상, 게임, DNS</td></tr>
      </tbody>
    </table>
  </div>

  <div class="note"><b>왜 요약이 아니라 표일까요?</b>
  시험 문제는 그럴듯한 선지 넷 중 하나가 특정 지점에서 다릅니다.
  줄글 요약은 “그게 뭔지”는 적지만 “<b>무엇과 헷갈리고 어디서 갈리는지</b>”는 적지 않습니다.
  그래서 헷갈리는 것들을 나란히 놓는 것부터 시작합니다.</div>
</div></section>

<section><div class="wrap">
  <h2>손으로 쓰고 싶다면<span class="en">Print it blank</span></h2>
  <p class="lede">굿노트 · 노타빌리티 · 노트쉘프용 <b>빈 양식</b>입니다.
  매트릭스의 열 머리말은 일부러 비워뒀습니다 — 비교 기준은 주제마다 달라야 하니까요.
  줄 높이는 펜슬로 쓸 수 있게 타이핑판의 약 두 배입니다.</p>

  <div class="note"><b>낱장 PDF를 쓰세요.</b> 굿노트는 <b>1쪽짜리 PDF를 속지 템플릿으로 등록</b>해
  노트 안에서 계속 추가하는 방식입니다. 12쪽 통합본은 그렇게 못 씁니다.</div>

  <h3 class="sub2">낱장 양식 — 한국어</h3>
  <div class="dlgrid">${dl(blankKo)}</div>
  <h3 class="sub2">통합본 (12쪽, 북마크 포함)</h3>
  <div class="dlgrid">${dl(workbooks)}</div>
  <h3 class="sub2">낱장 양식 — English</h3>
  <div class="dlgrid">${dl(blankEn)}</div>
</div></section>

<section><div class="wrap">
  <h2>완성된 예시<span class="en">Worked examples</span></h2>
  <p class="lede">서로 무관한 네 시험으로 만든 예시입니다. 시험 종류에 따라 표의 기준과
  지면 방향이 어떻게 바뀌는지 볼 수 있습니다.
  <b>전부 템플릿 시연용 샘플</b>이며 검증된 학습 자료가 아닙니다 — 특히 법령 예시는 법률 자문이 아닙니다.</p>
  <h3 class="sub2">정보처리기사 — 전체본 · 빈칸 문제지 · 정답지</h3>
  <div class="dlgrid">${dl(notes)}</div>
  <h3 class="sub2">행정법 · 재무 · 조직심리</h3>
  <div class="dlgrid">${dl(examples)}</div>
</div></section>

<section><div class="wrap">
  <h2>더 알고 싶다면<span class="en">The method</span></h2>
  <details><summary>이 방법은 어디서 왔나요?</summary><div class="dbody">
    <p>문사탐 / 문서연 선생님이 가르치는 <b>셀프엑셀표</b> 방법을 자격증 · 학교 시험용으로 일반화했습니다.
    원 영상에서 이 방법은 <b>오답노트</b>라고 불립니다 — 미리 채워 넣는 그릇이 아니라,
    <b>틀린 문제에서 걸러져 나오는 것</b>이라는 뜻입니다.</p>
    <p>그래서 이 시스템에서 오답 기록은 “뭘 틀렸다”가 아니라
    <b>표의 어느 칸이 틀렸는지</b>를 지목합니다. 그 칸이 다음 빈칸 문제지에 다시 나옵니다.</p>
  </div></details>
  <details><summary>표시(기본 · 갈림 · 예외 · 함정)는 왜 있나요?</summary><div class="dbody">
    <p>표시한 칸이 <b>빈칸 문제지에서 우선 가려집니다</b>. 즉 표시는 꾸밈이 아니라
    “여기를 집중해서 외우겠다”는 표시입니다.</p>
    <p>인쇄물에서는 글자 · 테두리 · 음영 세 가지로 동시에 표시되기 때문에
    <b>흑백으로 복사해도</b> 구분이 사라지지 않습니다.</p>
  </div></details>
  <details><summary>만든 내용은 어디에 저장되나요?</summary><div class="dbody">
    <p>쓰는 동안에는 <b>브라우저 안에만</b> 저장됩니다. 서버로 아무것도 보내지 않습니다.</p>
    <p>다른 기기에서 쓰거나 오래 보관하려면 편집기 오른쪽 아래
    <b>파일로 저장</b>을 눌러 <code>.yaml</code> 파일을 받아두세요. 나중에 <b>불러오기</b>로 이어서 쓸 수 있습니다.</p>
  </div></details>
</div></section>

<footer><div class="wrap">
  <p><b>샘플 데이터 고지.</b> 이 사이트의 모든 예시 내용은 템플릿을 시험하려고 작성한 것입니다.
  실제 수험 준비 전에 반드시 원문으로 검증하십시오.</p>
  <p style="margin-top:14px">생성 ${new Date().toISOString().slice(0, 10)} · Exam Matrix</p>
</div></footer>

</body>
</html>
`;

fs.writeFileSync(path.join(OUT, 'index.html'), page);

let n = 0;
(function count(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) count(path.join(d, e.name)); else n++;
  }
})(OUT);

console.log(`  public/index.html   +  ${n - 1} files`);
console.log(`  downloads: ${workbooks.length} workbooks, ${blankKo.length + blankEn.length} blank templates, ${notes.length + examples.length} sample notes`);
