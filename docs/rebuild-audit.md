# Exam Matrix — 재구축 감사 (rebuild audit)

`main` 시점의 저장소를 컴포넌트 단위로 조사한 기록. 각 항목은
KEEP / REFACTOR / REPLACE / REMOVE / MIGRATE 로 분류했다.

*This document is written for the maintainer, so it uses developer vocabulary.
The product itself does not.*

---

## 1. 무엇이 있었나

`main` 은 완성도 높은 **PDF 학습지 생성기**였다. 커밋 3개, 약 9,800줄.

```
schema/exam.schema.json     YAML 계약 (289줄)
examples/*.yaml             4개 예시 시험 (law · it · calculation · conceptual)
src/lib/{text,archetypes,normalize,layout,recall}.js
                            순수 도메인 — Node 내장 모듈을 전혀 쓰지 않음
src/lib/model.js            Node 전용 로더 (fs + ajv + js-yaml)
src/render.js               페이지 템플릿 → HTML 문자열 (702줄)
src/blank.js                손글씨용 빈 양식 (351줄)
src/styles.css              인쇄 디자인 시스템 (456줄)
scripts/build*.js           YAML → Chromium → PDF, 정적 사이트, 에디터 번들
scripts/visual-qa.js        생성된 PDF 38종을 poppler 로 검사
scripts/test-editor.js      에디터 ↔ Node 렌더러 바이트 단위 패리티 테스트
tools/editor.html           2,598줄 단일 파일 브라우저 에디터 (5단계 마법사)
output/**.pdf               커밋된 결과물
research/*.md               참고 영상 조사 기록 + 방법론 합성
```

### 실제로 잘 작동하던 것

- **렌더러가 브라우저에서 그대로 돈다.** `scripts/build-editor.js` 가 이미
  `text → archetypes → normalize → layout → recall → render` 6개 모듈을
  하나의 IIFE 로 묶어 `file://` 에서 실행시키고 있었다. 이 모듈들은 fs/ajv/js-yaml 을
  건드리지 않는다. **이번 재구축에서 가장 값비싼 자산이다.**
- **결정론적 빈칸 생성.** `recall.js` 는 FNV-1a 해시 + mulberry32 로 같은 입력에
  항상 같은 칸을 가린다. 정답지가 어긋나지 않는다.
- **적응형 레이아웃.** `layout.js` 는 열 개수와 내용 밀도로 세로/가로를 고르고,
  넓은 표를 행 레이블을 반복하며 쪼갠다. 글자 크기는 절대 줄이지 않는다.
- **오류 → 셀 참조.** `normalize.js` 의 `resolveRef()` 는 오답 기록이 가리키는
  행/열이 실제로 존재하는지 빌드 시점에 검증한다. 이 아이디어는 제품의 핵심이다.
- **한글 인쇄.** `word-break: keep-all`, Noto CJK, 흑백에서도 구분되는 마커
  (라벨 + 테두리 + 음영). 되돌릴 이유가 없다.

### 제품이 어긋난 지점

1. **홈이 PDF 다운로드 목록이었다.** `scripts/build-site.js` 가 만드는 랜딩
   페이지는 `output/` 에 있는 파일을 나열한다. 학습자가 처음 보는 화면이
   "무엇을 공부할까"가 아니라 "무슨 파일을 받을까"였다.
2. **먼저 표를 완성해야 공부를 시작할 수 있었다.** 에디터 마법사는
   시험 이름 → 헷갈리는 것 → 비교 기준 → 표 채우기 → 인쇄 순서다.
   한 칸도 못 채운 사람은 아무것도 할 수 없다.
3. **인출이 종이에서만 일어났다.** Recall Edition 은 훌륭하지만, 답을 가리는
   일이 앱 안에서 벌어지지 않으니 **앱은 학습자가 무엇을 틀렸는지 영원히 모른다.**
   피드백 루프가 닫히지 않는다.
4. **확신도라는 개념이 없었다.** 스키마의 `confidence` 는 과목 단위 자기평가
   1–5 이고, 개별 인출과 무관하다. "애매하게 맞음"을 표현할 방법이 없었다.
5. **복습 추적이 체크박스 6개였다.** README 가 "the least prominent element on
   its page" 라고 자랑스럽게 적어둔 부분인데, 이것이 바로 빠져 있던 제품이다.
6. **오답 기록이 사후 문서 작성이었다.** `error_log` 는 YAML 배열이다. 문제를
   푼 직후 20초 안에 무언가를 남길 수 있는 통로가 없었다.

한 줄로: **저장소는 학습의 *출력물*을 훌륭하게 만들었지만 학습의 *루프*를
가지고 있지 않았다.**

---

## 2. 컴포넌트별 판정

| 컴포넌트 | 판정 | 근거 / 이후 위치 |
|---|---|---|
| `src/lib/text.js` | **KEEP** | 순수. `src/pdf/lib/text.js` 로 이동만. |
| `src/lib/archetypes.js` | **KEEP** | 마커 6종 + L2 열 세트. 앱의 마커 어휘가 이 파일을 그대로 재수출한다. |
| `src/lib/normalize.js` | **KEEP** | 셀 참조 해석 로직 포함. 변경 없음. |
| `src/lib/layout.js` | **KEEP** | 적응형 세로/가로 + 열 분할. 변경 없음. |
| `src/lib/recall.js` | **KEEP** | 결정론적 빈칸. 화면용 매트릭스 드릴이 같은 가중치 표를 재사용한다. |
| `src/render.js` | **KEEP** | 702줄 인쇄 템플릿. 아키텍처 순수성을 위해 다시 쓰지 않는다. |
| `src/blank.js` | **KEEP** | 손글씨 양식. 그대로. |
| `src/styles.css` | **KEEP** | 인쇄 전용. 화면 CSS 와 절대 섞지 않는다. |
| `src/lib/model.js` | **REFACTOR** | Node 전용(fs/ajv)이라 브라우저 번들에 들어가면 안 된다. `src/pdf/model.node.js` 로 이름을 바꿔 경계를 명시. |
| `schema/exam.schema.json` | **KEEP** | 레거시 YAML 계약. 가져오기 검증에 계속 쓴다. |
| `examples/*.yaml` | **KEEP** | 가져오기 픽스처 + 데모 시드 원본. |
| `scripts/build.js` | **REFACTOR** | 임포트 경로만 `src/pdf/` 로. CLI 파이프라인 유지. |
| `scripts/build-blank.js` | **REFACTOR** | 임포트 경로만. |
| `scripts/visual-qa.js` | **KEEP** | PDF 38종 검사. 회귀 방지선. |
| `scripts/init-exam.js` | **KEEP** | CLI 스캐폴더. 임포트 경로만. |
| `scripts/test-editor.js` | **MIGRATE** | 마법사 UI 테스트는 폐기, **렌더러 패리티 테스트는 유지**하여 `test/pdf-parity.test.ts` 로 옮긴다. 이제 비교 대상은 에디터가 아니라 React 앱의 PDF 브리지다. |
| `scripts/build-editor.js` | **REMOVE** | Vite 가 ESM 을 그대로 번들한다. 정규식으로 `import` 를 지우는 번들러는 더 필요 없다. |
| `tools/editor.template.html` · `tools/editor.html` | **REPLACE** | 5단계 마법사가 곧 §40 이 지목한 "공부 전에 표부터 만들게 하는 UI". React 앱이 대체한다. 패리티가 증명될 때까지 `legacy/editor/` 에 보존. |
| `scripts/build-site.js` | **REPLACE** | 랜딩 = PDF 목록. Vite 빌드 + PDF 복사 스텝(`scripts/build-static.js`)으로 대체. |
| `output/**.pdf` | **KEEP** | 커밋된 결과물. `/files/` 로 계속 서빙. |
| `research/video-analysis.md` | **KEEP** | 영상 접근 실패를 정직하게 기록한 문서. 고치지 않는다. |
| `research/method-synthesis.md` | **KEEP** + 추가 | 원문 유지, `research/method-synthesis-v2.md` 로 이번 재구축의 방법론을 덧붙인다. |
| `README.md` | **REPLACE** | 제품 설명이 아니라 아키텍처 논문이었다. |
| 브라우저 `localStorage["em.v2"]` | **MIGRATE** | 기존 사용자의 유일한 데이터. 첫 실행 시 감지 → 변환 → 원본 보존. |

---

## 3. 유지되는 불변식

재구축 이후에도 다음은 그대로다. 회귀 시 테스트가 깨진다.

1. **저장 단위는 사실이 아니라 셀이다** — 헷갈리는 것 옆에 헷갈리는 것.
2. **마커 6종**(`core` `distinction` `exception` `trap` `update` `evidence`)과
   그 흑백 인쇄 안전성.
3. **결정론적 빈칸 생성** — 같은 입력, 같은 빈칸.
4. **오답은 셀을 가리킨다** — "17번 틀림"이 아니라 "행정심판의 기간 칸".
5. **L1 → L2 → L3 압축**, 그리고 무엇을 버릴지는 학습자가 정한다.
6. **YAML 로 나가고 들어올 수 있다** — 데이터는 사용자 것이다.
7. **계정 없이 동작한다.**

## 4. 새로 도입되는 것

`main` 에 대응물이 없어 새로 만드는 것. 이것들이 "학습지 생성기"를
"학습 루프"로 바꾼다.

- **StudyItem** — 문항 하나. 표의 칸과 독립적으로 존재할 수 있다.
  (표를 만들지 않아도 공부를 시작할 수 있어야 하므로.)
- **ReviewEvent** — 인출 시도 하나. 확신도와 실패 원인을 포함한다.
- **ConfusionRelation** — A 와 B 가 헷갈린다는 사실 자체를 1급 데이터로.
- **reviewScheduler** — 투명한 간격 사다리. 왜 지금 나왔는지 설명할 수 있다.
- **드릴 큐** — 인터리빙 포함.
- **IndexedDB** — `em.v2` 의 단일 JSON 문자열로는 수천 건의 인출 기록을 담을 수 없다.
