# 브라우저 테스트 시나리오

> FinSight의 핵심 사용자 흐름을 실제 브라우저로 검증하기 위한 **재사용 레퍼런스**다.
> 매 회귀 테스트 시 이 문서의 시나리오(UC1~UC5)를 순서대로 실행한다.
> 계획의 단일 원천은 `PRD.md`·`ARCHITECTURE.md`·`ADR.md`이며, 이 문서는 그 규칙이
> UI에서 실제로 지켜지는지 확인하는 실행 절차다.

## 전제

- **모드**: `DATA_SOURCE=mock` (실 인프라·시크릿 불필요). mock repository는 **결정적 fixture**를 반환하므로,
  업로드한 CSV 내용과 무관하게 대시보드 숫자는 항상 동일하다(ADR-008). 숫자가 바뀌길 기대하지 마라.
- **도구**: [`dev-browser`](https://www.npmjs.com/package/dev-browser) — 샌드박스 JS로 브라우저 제어.
- **포트**: `next dev`는 3000이 비어 있으면 3000, 점유돼 있으면 **3001/3002 등으로 자동 이동**한다. 기동 로그의 `Local:` 줄에서 실제 포트를 확인하고 아래 스크립트의 포트를 맞춰라.
- **인증 순서(중요)**: `/upload`·`/dashboard`·`/pro`는 미인증 시 **`/login`으로 307 리다이렉트**된다(phase 2 세션 미들웨어). 따라서 **UC2 로그인을 UC3~UC5보다 먼저** 실행해야 한다. 예외는 게스트 대시보드 `/dashboard?guest=1`(미인증 200). 스텁 세션 쿠키는 같은 dev-browser 브라우저(`--browser finsight`) 컨텍스트에 유지된다.
- **안정화**: Next dev는 콜드 컴파일·HMR 시 devtools(`segment-explorer-node`) RSC 오류로 **간헐적으로 렌더가 비어** `h1`이 안 뜰 수 있다(앱 버그 아님). 아래 **재시도 래퍼**를 쓰고, 반복되면 `pkill -f "next dev"; rm -rf .next` 후 재기동한다.

```js
// 렌더 flakiness 대비 재시도 래퍼
async function go(path, sel = "h1"){
  for (let i=0;i<3;i++){
    await page.goto(B+path,{waitUntil:"networkidle"});
    try { await page.waitForSelector(sel,{timeout:12000}); await page.waitForTimeout(600); return true; }
    catch(e){ await page.waitForTimeout(1000); }
  }
  return false;
}
```

## 셋업

```bash
# 1) mock 모드로 dev 서버 기동 (백그라운드) — Local: 포트 확인
DATA_SOURCE=mock npm run dev
# 2) 준비 대기
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/ | grep -qE "200|307|308"; do sleep 2; done
# 3) 샘플 CSV를 dev-browser tmp로 준비 (UC3에서 사용)
cp docs/fixtures/sample-shinhan.csv ~/.dev-browser/tmp/sample.csv   # 없으면 아래 '샘플 CSV' 절에서 생성
```

정리:

```bash
pkill -f "next dev"; dev-browser stop
```

### ⚠️ CSV 업로드 주입 기법 (중요)

dev-browser 샌드박스에는 `fs`/`Buffer`/`TextEncoder`가 없어 **Playwright `setInputFiles`가 동작하지 않는다.**
반드시 브라우저 컨텍스트에서 `File` + `DataTransfer`로 주입한다. 업로드 input은 `sr-only` 숨김 상태이며
`onChange`로 파일을 받는다(파일 선택 후 자동 이동이 아니라 **"컬럼 확인하기 →" 버튼**을 눌러야 매핑으로 넘어감).

**하이드레이션 대기 필수**: 페이지 로드 직후 주입하면 React `onChange`가 아직 안 붙어 **이벤트가 무시된다**(파일은 들어가지만 "파싱 완료"가 안 뜸). `waitUntil:"networkidle"` + `waitForTimeout(1500)` 후 주입하고, 안 되면 재주입한다.

```js
await page.goto(B+"/upload",{waitUntil:"networkidle"});
await page.waitForSelector("input[type=file]",{timeout:12000});
await page.waitForTimeout(1500);                        // 하이드레이션 대기
const content = await readFile("sample.csv");          // ~/.dev-browser/tmp/sample.csv
const inject = () => page.evaluate((csv) => {
  const input = document.querySelector("input[type=file]");
  const file = new File([csv], "sample-shinhan.csv", { type: "text/csv" });
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, content);
await inject();
// "파싱 완료" 안 뜨면 최대 3회 재주입
for (let i=0;i<3;i++){ try{ await page.getByText("파싱 완료").waitFor({timeout:4000}); break; }catch(e){ await inject(); await page.waitForTimeout(1500); } }
```

---

## 라우트 맵

| 경로 | 화면 |
| --- | --- |
| `/` | 랜딩(마케팅) |
| `/dashboard?guest=1` | 게스트 데모 대시보드(읽기전용) |
| `/login` | 로그인(카카오·Google, mock은 스텁 로그인) |
| `/upload` → `/upload/mapping` | CSV 업로드 → 컬럼 매핑 확인 |
| `/dashboard` | Free 대시보드 |
| `/pro` | Pro 지출 진단 리포트(게이팅) |

---

## UC1 — 게스트 데모 체험

**목적**: 가입 없이 샘플 대시보드를 읽기전용으로 체험하고 가입 CTA로 유도되는지.

**단계**
1. `/` 접속 → 히어로·기능·요금제·보안 섹션 렌더 확인.
2. "샘플로 먼저 보기"(`/dashboard?guest=1`) 이동.

**기대 결과**
- 랜딩 히어로: `내 돈이 어디로 갔는지, 3분 안에.` + 지출 카드 `1,847,620원`(빨강).
- CTA: `내 파일로 시작하기`(→`/login`), `샘플로 먼저 보기`(→`/dashboard?guest=1`), `Pro 시작하기`.
- 게스트 대시보드: **DEMO 배지**, `내 파일로 해보기 →` CTA, 개요/카테고리/명세 탭,
  총지출 `1,110,940원`(빨강) / 총수입 `3,200,000원`(초록) / 순수지 `2,089,060원` / 거래 `35건`,
  카테고리 도넛 · 상위 가맹점 · 최근 거래 · **Sonnet 4.6** 기본 소비 분석.

**검증 규칙**: 게스트 읽기전용 데모(PRD 핵심기능 4), 지출=빨강·수입=초록 시맨틱 컬러.

## UC2 — 로그인 (mock 스텁)

**목적**: OAuth 진입 → 세션 수립 → 업로드로 진입.

**단계**
1. `/login` 접속.
2. `카카오로 계속하기` 클릭.

**기대 결과**
- 로그인 카드: `3초 만에 시작하기`, 카카오(노랑)·Google 버튼, "Phase 0에서는 고정 데모 사용자로 로그인됩니다" 안내.
- 클릭 후: **httpOnly 쿠키** `finsight_stub_session=mock-free-user` 설정, `/upload`로 리다이렉트("거래내역 CSV를 올려주세요").

**검증 규칙**: 스텁 인증은 mock 전용(live fail-closed), 세션 쿠키 httpOnly.

## UC3 — CSV 업로드 + 컬럼 매핑

**목적**: CSV 파싱 → LLM 컬럼 자동매핑 → 사용자 확인 스텝.

**단계**
1. `/upload`에서 위 **주입 기법**으로 `sample.csv` 주입.
2. `파싱 완료` 미리보기 대기(인코딩·행수·컬럼수) → `컬럼 확인하기 →` 클릭.
3. `/upload/mapping`에서 매핑 확인 → `확인하고 대시보드 보기 →` 클릭.

**기대 결과**
- 미리보기: `인코딩 UTF-8 / 거래 20행 / 컬럼 5개`, `파싱 완료` 배지.
- 매핑: 상단에 **"개인정보와 비용을 보호하기 위해 헤더와 샘플 20행만 분석했습니다"** 안내,
  자동 매핑 `이용일자→거래일` `가맹점명→가맹점` `이용금액→금액` `구분→무시` `결제방법→무시`, 신뢰도 `91%`.
- 확정 후 `/dashboard` 진입.

**검증 규칙**: **매핑은 샘플 ≤20행만 LLM 전송**(ADR-004, UI에 명시), 컬럼 확인·수정 UI 존재.

## UC4 — Free 대시보드 탐색

**목적**: 집계·차트·상세·재분류 인터랙션.

**단계**
1. `/dashboard`에서 총지출/수입/순수지/거래건수·도넛·상위가맹점·최근거래 확인.
2. 최근 거래 항목 클릭 → **SideView(우측 Drawer)** 상세.
3. 상세 안 `카테고리 재분류` 클릭 → **Modal**(중앙) 열림.

**기대 결과**
- StatCard: 총지출 `1,110,940원` / 총수입 `3,200,000원` / 순수지 `2,089,060원`.
- SideView(읽기전용): 가맹점·금액·거래일·카드·카테고리·메모 input·`카테고리 재분류`.
- 재분류 Modal: 제목 `카테고리 재분류`, **고정 enum 13종** — 식비·카페/간식·교통·쇼핑·구독·주거·공과금·문화/여가·의료·금융·교육·수입·기타.

**검증 규칙**: **읽기전용 상세=SideView / 수정=Modal** 규약, `category`는 고정 enum(자유문자열 금지).

## UC5 — Pro 리포트 게이팅

**목적**: Free 유저의 Pro 페이월과 업그레이드 흐름.

**단계**
1. `/pro` 접속(Free 세션).
2. `Pro로 업그레이드 ₩9,900/월` 클릭 → 업그레이드 Modal.
3. (선택) `결제하고 Pro 시작하기` 클릭 → 실패 경로 확인.

**기대 결과**
- 페이월: 자물쇠 아이콘 · **OPUS 4.8** 배지 · `돈을 줄일 다음 행동까지 확인하세요` · 업그레이드 CTA.
  **실제 리포트 내용은 렌더되지 않음**(데이터 레벨 차단, CSS 블러 아님).
- 업그레이드 Modal: `₩9,900/월`, 혜택 3종(지출 진단·절감 제안 3건·정기구독 후보), `결제하고 Pro 시작하기`.
- (mock에서 결제 클릭 시) `/api/checkout` **500** → 응답·UI 모두 일반 문구 `일시적인 오류가 발생했습니다`
  (Polar 시크릿 부재로 인한 예상된 실패. 시크릿 등록 시 정상 동작).

**검증 규칙**: **페이월은 데이터 레벨 차단**(CSS 블러 금지), **5xx 내부 예외 은닉**(스택·원문 노출 금지),
Pro 앵커=Opus 4.8 지출 진단.

## UC6 — EUC-KR 인코딩 감지

**목적**: 국내 카드사 EUC-KR CSV의 인코딩 자동 감지·디코딩.

**단계**(로그인 후)
1. EUC-KR 바이트 CSV를 `/upload`에 주입. 문자열이 아니라 **바이트**여야 하므로 base64→`Uint8Array`→`File`로 만든다.
2. `파싱 완료` 미리보기의 인코딩 라벨 확인.

```js
// 호스트에서 EUC-KR CSV를 base64로 만들어 ~/.dev-browser/tmp/euckr.b64 에 저장해 둔다:
//   python3 -c "import base64;open('~/.dev-browser/tmp/euckr.b64','w').write(base64.b64encode('이용일자,가맹점명,이용금액\n2026-06-01,편의점,3200\n'.encode('euc-kr')).decode())"
const b64 = await readFile("euckr.b64");
await page.evaluate((b64) => {
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  const input = document.querySelector("input[type=file]");
  const f = new File([bytes], "euckr-sample.csv", { type: "text/csv" });
  const dt = new DataTransfer(); dt.items.add(f); input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, b64);
```

**기대 결과**: 미리보기 `인코딩 EUC-KR / 거래 3행 / 컬럼 3개`. **검증 규칙**: 인코딩 감지 폴백(UTF-8/EUC-KR).

## UC7 — 매핑 실패 → 수동 매핑 강제

**목적**: LLM이 필수 컬럼을 못 찾을 때(`confidence < 0.75` 또는 `missingRequired`) 수동 매핑을 강제하는 가드.

**단계**(로그인 후)
1. 필수 헤더가 인식 alias에 없는 CSV(예: `날짜,상호,금액원`)를 업로드 → `컬럼 확인하기 →`.
2. 매핑 화면 상태 확인 → 드롭다운으로 `date`·`merchant`·`amount` 지정 → 확정.

**기대 결과**
- 진입 시: 빨간 경고 `신뢰도가 낮거나 필수 컬럼이 누락되었습니다…`, `필수 필드 3개 누락` 배지, **확정 버튼 비활성**(드롭다운 전부 `무시`).
- 필수 3개 지정 후: 배지 사라지고 **확정 활성** → `/dashboard`.

**검증 규칙**: `requiresManualMapping` 가드(ARCHITECTURE §시임), 매핑 오류 시 사용자 확인·수정 경로 필수(ADR-004). **UC8(수동 수정 후 확정)을 함께 커버**한다.

## UC9 — 재분류 반영

**목적**: 재분류 Modal에서 카테고리 변경 시 API 반영 및 UI 동작.

**단계**(로그인 후)
1. `/dashboard` → 거래 클릭(SideView) → `카테고리 재분류` → Modal에서 현재와 **다른 카테고리** 선택.

**기대 결과**
- `PATCH /api/transactions/{id}` → **200**.
- 성공 시 **Modal + SideView 모두 닫힘**.
- 재조회 시 카테고리는 원래값으로 복귀 — **mock은 비영속**이라 정상(ADR-008). 영속 반영은 live(phase 3)에서 검증.

**검증 규칙**: 재분류 = Modal(수정), `category` 고정 enum.

> **관찰**: 재분류 성공 시 SideView까지 닫혀 변경 결과를 상세에서 바로 확인할 수 없다. 의도된 UX인지 검토 여지 있음(사소).

---

## 회귀 체크리스트

| UC | 항목 | 결과 |
| --- | --- | --- |
| UC1 | 랜딩 렌더 + 게스트 대시보드(DEMO) | ☐ |
| UC2 | 스텁 로그인 → httpOnly 쿠키 → `/upload` | ☐ |
| UC3 | 파싱(UTF-8/20행) → 자동매핑(91%) + "20행만 분석" 문구 | ☐ |
| UC4 | 상세 SideView + 재분류 Modal(enum 13종) | ☐ |
| UC5 | 데이터 레벨 페이월 + 예외 은닉(500 일반문구) | ☐ |
| UC6 | EUC-KR 인코딩 감지(미리보기 라벨) | ☐ |
| UC7 | 매핑 실패 → 수동 매핑 강제 → 수정 후 확정 | ☐ |
| UC9 | 재분류 PATCH 200 + Modal/SideView 닫힘 | ☐ |

## 로드맵(미커버 시나리오)

향후 추가할 시나리오 — 지금은 미구현/미검증:

- **환불/입금 거래의 `direction` 정규화**(순지출 = 지출 − 환입) — mock은 고정 fixture라 업로드 CSV가 집계에 반영되지 않아 **브라우저로 검증 불가**. `src/lib/analysis`·`src/lib/csv` **단위테스트 영역**이며, 영속 집계 반영은 live(phase 3) 이후 검증한다.
- 매핑 드롭다운 다중 재지정(같은 컬럼을 여러 역할로 옮길 때 상호배타 갱신) 심화 케이스.

## 샘플 CSV

`~/.dev-browser/tmp/sample.csv` (국내 카드사 스타일, 20건 — 환불·급여이체 포함):

```csv
이용일자,가맹점명,이용금액,구분,결제방법
2026-06-01,배달의민족,23900,국내,신한카드
2026-06-01,스타벅스 강남점,5600,국내,신한카드
2026-06-02,GS25 역삼점,8400,국내,신한카드
2026-06-02,카카오T,12300,국내,신한카드
2026-06-03,에이블짐 헬스장,99000,국내,신한카드
2026-06-03,이마트 성수점,64200,국내,신한카드
2026-06-04,올리브영,38700,국내,신한카드
2026-06-05,유튜브 프리미엄,14900,국내,신한카드
2026-06-07,쿠팡,118400,국내,신한카드
2026-06-09,아파트 관리비,210000,국내,신한카드
2026-06-10,넷플릭스,17000,국내,신한카드
2026-06-12,무신사,89000,국내,신한카드
2026-06-14,CGV 용산,28000,국내,신한카드
2026-06-15,급여이체,3200000,입금,신한은행
2026-06-16,올리브영 환불,-12000,취소,신한카드
2026-06-18,GS칼텍스 주유,70000,국내,신한카드
2026-06-20,배달의민족,46200,국내,신한카드
2026-06-22,교보문고,32000,국내,신한카드
2026-06-25,스타벅스 판교,6100,국내,신한카드
2026-06-28,쿠팡와우,4990,국내,신한카드
```
