---
name: review-code
description: 현재 브랜치의 main 대비 변경분(git diff main...HEAD)을 차원별 전문 서브에이전트로 병렬 리뷰하고, 심각도순 단일 리포트로 취합한다. correctness·security·conventions·architecture 4개 차원을 각각 독립 서브에이전트가 깊게 검사한다(한 세션이 겹쳐 보는 것보다 전문성↑·속도↑). "코드 리뷰해줘", "변경분 리뷰", "리뷰 돌려줘", "PR 전에 검토", "이 브랜치 리뷰", "review-code" 같은 요청에 트리거. 단순 단일패스 체크리스트(빌드/테스트 게이트)만 원하면 이 스킬 대신 /review 커맨드를 쓴다.
---

# review-code — 병렬 서브에이전트 코드 리뷰

현재 브랜치의 **main 대비 변경분**을 4개 차원(correctness · security · conventions · architecture)으로 나눠, 각 차원을 **독립 서브에이전트가 병렬로** 리뷰한다. 메인 에이전트는 diff를 뽑아 서브에이전트를 띄우고, 돌아온 발견을 심각도순 단일 리포트로 취합한다.

## 왜 병렬로 쪼개는가

- **전문성(차별화):** 한 세션이 보안·정확성·규약·구조를 동시에 보면 각 관점이 얕아진다. 차원별 전용 mandate를 준 서브에이전트는 그 관점만 깊게 판다.
- **속도:** 4개 차원을 한 메시지에서 동시에 띄우면 순차 리뷰보다 벽시계 시간이 짧다.

## 절대 규칙

- 서브에이전트는 **읽기 전용**이다. 프롬프트에 "파일을 수정하지 마라. 발견만 보고하라"를 반드시 넣는다. 리뷰가 코드를 고치지 않는다.
- 서브에이전트는 **반드시 한 메시지에서 동시에** 기동한다(Agent 툴 4개를 같은 응답 블록에). 순차로 하나씩 띄우면 이 스킬의 목적(속도)이 깨진다.
- 발견의 근거는 **CLAUDE.md의 CRITICAL 규칙/프로젝트 규약**에 앵커링한다. "느낌상 이상함"이 아니라 "어떤 규칙 위반인지" 명시.
- 심각도는 **critical | major | minor | nit** 4단계로만. 자유 등급 금지.
  - `critical` 🔴 데이터 유실·시크릿 노출·권한 우회 등 병합 시 사고. `major` 🟠 명백한 버그·규칙 위반이나 즉시 사고는 아님. `minor` 🟡 개선 권장·잠재 리스크. `nit` ⚪️ 스타일·취향·사소.

## 절차

### 1. 스코프 확정 (메인이 1회)

되돌리기 어려운 작업은 아니지만, 동시성 리포라 상태를 먼저 잡는다.

```bash
git fetch origin -q
# base 결정: origin/main 있으면 origin/main, 없으면 main
BASE=$(git rev-parse --verify -q origin/main >/dev/null && echo origin/main || echo main)
git diff --stat "$BASE"...HEAD        # 변경 파일 목록·규모
```

- 변경 파일이 **0건이면** "리뷰할 변경 없음"을 보고하고 **중단**한다(서브에이전트를 띄우지 않는다).
- 인자(MVP): 인자 없이 위 기본 스코프로 동작한다. (경로 인자 오버라이드·특정 파일만 리뷰는 후속 확장 — 지금은 미구현.)
- 변경 파일 목록과 결정된 `BASE` ref를 다음 단계 서브에이전트 프롬프트에 넘긴다. **전체 diff 본문을 스킬 프롬프트에 통째로 붙이지 마라** — 각 서브에이전트가 필요한 만큼 직접 뽑게 한다(프롬프트 비대화·비용 방지).

### 2. 차원별 서브에이전트 병렬 기동 (핵심)

**한 응답 블록에서 Agent 툴을 4번 호출**한다. 모두 `subagent_type: general-purpose`.

각 서브에이전트 프롬프트에 **공통으로** 넣는 것:

1. 결정된 `BASE` ref와 변경 파일 목록.
2. 스코프 뽑는 법: `git diff <BASE>...HEAD -- <파일>`로 각자 diff를 보고, 맥락이 필요하면 변경 파일의 **전체 내용을 Read**로 읽어라.
3. 가드레일 문서를 먼저 읽어라: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/ADR.md`.
4. **읽기 전용** — 파일을 수정하지 말고 발견만 보고하라.
5. **구조화된 출력 계약** — 각 발견을 아래 필드로(메인이 이 필드로 인라인 코멘트 4줄을 조립하니 전부 채워라):
   - `severity`: `critical` | `major` | `minor` | `nit`
   - `location`: `파일경로:라인`
   - `title`: 문제를 요약한 짧은 제목
   - `tldr`: 무엇이·왜 문제인지 한 줄
   - `good`: 이 지점에서 잘된 점(있으면 한 줄, 없으면 생략 가능)
   - `fix`: 구체적 수정 방안 — 가능하면 **코드 스니펫**으로
   - `why`: 위반한 CRITICAL 규칙/프로젝트 규약 (근거 명시)
   - 발견이 없으면 정확히 "이 차원 통과"라고 보고.

각 서브에이전트에 **차원별 mandate**를 준다(아래 레지스트리의 "집중 검사"를 프롬프트 본문으로):

### 차원 레지스트리 (MVP = 4개 활성)

| 차원 | 집중 검사 |
|------|----------|
| **security** | 시크릿을 `NEXT_PUBLIC_`로 노출하거나 클라에서 읽는가 / `SUPABASE_SERVICE_ROLE_KEY`를 Polar 웹훅 plan 갱신 외에 쓰는가 / 유저 데이터 접근이 RLS user-scoped 클라이언트가 아닌가 / 클라가 보낸 plan 값을 신뢰해 기능을 해제하는가 / 외부 API(Claude·Polar·Supabase service-role)를 클라 컴포넌트에서 직접 호출하는가 / 업로드 CSV가 비공개 Storage+signed URL인가 / 내부 예외(DB 에러·스택·서드파티 원문)를 사용자 메시지로 노출하는가 / CSV 셀을 신뢰해 인젝션·이스케이프 누락이 있는가 |
| **correctness** | 금액을 부호 없는 정수(KRW)+`direction`으로 저장하는가(부호로 지출/수입 표현 금지) / 환불·매입취소를 `direction='income'`로 정규화하는가 / 해외 거래를 원화 청구액만 쓰는가 / `category`가 `types/` 고정 enum인가(자유 문자열 금지) / 규칙기반·배치 분류 로직의 버그·엣지케이스·null 처리 / 집계가 파서별로 흔들리지 않는가 |
| **conventions** | 데이터 페칭이 `queries/<domain>`+react-query 단일 경로로 `/api/*`를 치고 `apiClient`/`ApiError`를 경유하는가 / mock이 `services/` repository에만 있는가(queries·컴포넌트에 직접 금지) / LLM에 CSV 전체 행을 넣지 않고 컬럼매핑은 샘플행≤20만 보내는가 / 읽기전용 상세는 SideView, 입력/수정/생성은 Modal인가 / API 에러가 서버 `message`를 그대로 노출하고 상태코드→한글 치환 테이블을 만들지 않았는가 / 커밋·네이밍 규약(conventional commits) |
| **architecture** | 레이어 배치가 맞는가(컴포넌트→`components/`, 타입→`types/`, 외부 API 래퍼→`services/`, 순수 로직·유틸→`lib/`) / 외부 API 호출이 서버(Route Handler/Server Action)에서만 일어나는가 / 시임 인터페이스를 `TransactionsRepository`·`LlmService` 2개로만 형식화했는가(uploads·profiles는 단순 함수) / MVP 단일파일 업로드 스코프를 지키는가(다중파일 병합·중복감지 구현 금지) |

<!-- 후속 확장 차원(미구현): performance · test coverage · cross-file consistency · privacy · CPU/perf patterns · behavioral correctness.
     차원 추가 = 위 표에 행 1개 + 2단계 Agent 호출 1개 추가로 끝난다. -->

### 3. 취합·리포트 (메인이 4개 결과 수신 후)

4개 서브에이전트 결과를 병합한다. 같은 `location`을 여러 차원이 지적하면 **중복 항목은 합치되 관점 라벨(차원)은 모두 유지**한다. 심각도순(critical → major → minor → nit)으로 정렬한다.

출력은 **2층**이다.

#### 층 1 — 인라인 코멘트 (발견 1건당 1개, 라인별)

각 발견을 해당 `location` 기준으로 정확히 **4줄**로 낸다:

```
[critical] <title>
TL;DR: <tldr>
✓ Good: <good>            ← 잘된 점 없으면 이 줄 생략
→ Fix: <fix, 가능하면 코드>
```

- 앞머리 `[심각도]`는 `critical|major|minor|nit` 중 하나. 심각도 이모지(🔴🟠🟡⚪️)를 접두로 붙여도 좋다.
- `→ Fix`의 코드는 백틱/코드블록으로 감싼다.

#### 층 2 — PR 전체 요약 (1개, 최상단에 배치)

```
## 판정: <Approve | Changes Requested | Blocked>

심각도: 🔴 critical N · 🟠 major N · 🟡 minor N · ⚪️ nit N

**Walkthrough** — <이번 변경이 무엇을 하는지 2~3줄>

**잘된 점** — <칭찬할 지점 1~2개>

**주요 이슈 (critical/major만)**
- 🔴 [security] `path:line` — <title>: <한 줄>
- 🟠 [correctness] `path:line` — <title>: <한 줄>

**다음 액션** — <병합 전 반드시 할 일. Approve면 "그대로 병합 가능">
```

**판정 매핑:**
- critical ≥1 → **Blocked**
- critical 0 · major ≥1 → **Changes Requested**
- major 이상 0 (minor/nit만 또는 무결점) → **Approve**

주요 이슈 목록에는 **critical/major만** 나열한다. minor/nit는 층 1 인라인 코멘트로만 전달하고 요약 집계에만 반영한다.

### 4. CI 모드 (headless 실행 시에만)

프롬프트에 "CI 모드"가 명시되면, 사람용 2층 출력에 더해 **워크스페이스 루트에 `review-verdict.json`을 쓴다**(GitHub Action의 gate가 읽는다):

```json
{
  "verdict": "Blocked",
  "counts": { "critical": 0, "major": 0, "minor": 1, "nit": 3 },
  "automerge": false
}
```

- `counts`: 4개 차원 발견을 심각도별로 합산한 실제 건수(단일 진실 원천).
- `verdict`: `critical + major ≥ 1`이면 `"Blocked"`, 아니면 `"Approve"`.
- `automerge`: `critical + major + minor == 0`(nit만/무결점)일 때만 `true`, 그 외 `false`.
- 이 파일을 반드시 마지막에 써라. 코멘트·요약은 사람용이고, gate는 이 JSON만 신뢰한다.

## 금지사항

- 서브에이전트를 순차로 하나씩 띄우지 마라. 이유: 병렬 fan-out이 이 스킬 존재 이유다. 한 응답 블록에서 4개 동시 호출.
- 서브에이전트가 코드를 수정하게 하지 마라. 이유: 리뷰는 진단이다. 수정은 사용자가 결과를 보고 지시한다.
- 변경이 0건인데 서브에이전트를 띄우지 마라. 이유: 빈 리뷰에 4개 세션 비용을 태우지 않는다.
- 발견을 "느낌"으로 적지 마라. 반드시 위반한 CLAUDE.md 규칙/규약에 앵커링하라.
