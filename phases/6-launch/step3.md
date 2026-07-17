# Step 3: e2e-smoke

## 읽어야 할 파일

먼저 아래 파일들을 읽고, 무엇을 "핵심 루프가 벽까지 관통했다"로 볼지 파악하라:

- `/CLAUDE.md` (plan 진실 원천 · service-role 규칙 · 5xx 일반화)
- `/docs/PRD.md` ('성공 기준' 절 — Activation 3분·업로드 품질·인사이트 가치·비용 상한)
- `/docs/ARCHITECTURE.md` ('데이터 흐름'·'배포' 절 — 단일 경로, mock→live 전환)
- Step 0: `src/services/index.ts` (live 배선 — 스모크가 실제로 타는 경로)
- Step 1: `docs/DEPLOYMENT.md` (시크릿·수동 스모크를 문서화할 곳)
- 참조: `src/lib/env.ts` (`getDataSource` — 스모크 스킵 게이트)

## 작업

실 경로(`DATA_SOURCE=live`) 스모크를 준비한다. 실 인프라(Supabase·Anthropic·Polar·OAuth)는 사용자 개입 영역이므로, **자동 스모크가 가능한 범위**와 **수동 체크리스트로 대체할 범위**를 나눈다.

1. **자동 스모크(가능한 범위) — env 미설정 시 자동 스킵**
   - `DATA_SOURCE` env 기준으로 스모크 테스트가 스스로 스킵되게 한다: `getDataSource() !== 'live'`이거나 필수 시크릿 env가 없으면 `describe.skip`/`it.skip`(또는 조건부 스킵)으로 넘긴다. 이유: CI·mock 환경에서 실 인프라 없이도 `npm test`가 초록이어야 한다.
   - 스킵되지 않는 경우(live env 완비), 최소 검증: live 팩토리(`getTransactionsRepository`·`getLlmService` 등)가 mock이 아닌 실제 구현체를 반환하고 throw하지 않는지(step 0 결과의 라이브 확인). 실제 외부 네트워크 호출까지 자동화하기 어렵다면 여기까지만 자동화하고 나머지는 수동 체크리스트로 넘긴다.
   - CRITICAL: 스모크 테스트가 기본(mock/CI)에서 **네트워크를 치지 않도록** 반드시 env 게이트로 막는다. 실 시크릿을 테스트 코드·fixture에 넣지 마라.

2. **수동 스모크 체크리스트 — `docs/DEPLOYMENT.md`에 추가**
   실 인프라가 필요한 end-to-end 흐름은 배포 후 사람이 확인하는 체크리스트로 문서화한다. PRD 성공 기준에 맞춰 최소:
   - [ ] **로그인**: 카카오/구글 OAuth로 로그인 → `/auth/callback` 정상 세션 생성.
   - [ ] **업로드→매핑**: 대표 카드사 CSV 업로드 → 샘플 ≤20행 매핑 요청 → 자동 확정 또는 수동 매핑 게이트 동작(비공개 Storage + signed URL 확인).
   - [ ] **대시보드**: KPI·카테고리 차트·거래 목록이 실 데이터로 렌더(집계는 코드, 판단은 AI).
   - [ ] **Pro 리포트**: Pro 계정에서 지출 진단 + 정기구독 후보 각 1개 이상 표시. Free는 데이터 레벨 페이월로 차단(CSS 블러 아님).
   - [ ] **결제**: Polar 체크아웃 → 웹훅 수신 → `profiles.plan`이 `pro`로 갱신(클라이언트가 아닌 웹훅이 진실 원천).
   - [ ] **비용 상한**: CSV 1건 분석의 LLM 호출이 기본 경로 3회 이하(mapColumns·insights·subscriptions).
   - 각 항목에 "확인 방법(어느 화면·어느 로그를 보나)"을 한 줄씩 첨부.

3. **blocked 처리** — 실 인프라·시크릿이 없어 자동 스모크를 실제로 실행할 수 없으면(정상 상황), 자동 스킵 테스트 + 수동 체크리스트 문서화까지 완료한 뒤 `status=blocked`로 전환하고 blocked_reason에 "라이브 스모크 실행에 필요한 것(라이브 배포 URL·라이브 시크릿·테스트 계정)"을 명시하고 중단한다.

## Acceptance Criteria

```bash
npm run build
npm test
```

- `npm test`는 실 인프라 없이(mock/CI) **초록**이어야 한다 — live 스모크는 env 게이트로 스킵되고, 네트워크를 치지 않는다.
- 수동 스모크 체크리스트가 `docs/DEPLOYMENT.md`에 존재.

## 검증 절차

1. 위 AC 커맨드를 실행한다(`DATA_SOURCE` 미설정/mock 상태에서).
2. 아키텍처 체크리스트:
   - live 스모크가 env 게이트(`DATA_SOURCE=live` + 필수 시크릿)로 자동 스킵되는가? mock/CI에서 네트워크를 치지 않는가?
   - 실 시크릿·테스트 계정 정보가 테스트 코드/fixture에 하드코딩되지 않았는가?
   - 수동 체크리스트가 PRD 성공 기준(로그인→업로드→대시보드→Pro 리포트→결제→비용 상한)을 커버하는가?
   - 결제 흐름 검증이 "웹훅→`profiles.plan`"을 진실 원천으로 명시하는가?
3. 결과에 따라 `phases/6-launch/index.json`의 step 3을 업데이트한다:
   - 자동 스킵 스모크 + 수동 체크리스트 완료, 실 스모크는 인프라 대기 → `"status": "blocked"`, `"blocked_reason": "라이브 스모크 실행에 필요한 것(배포 URL·라이브 시크릿·테스트 계정)"` 후 중단
   - 실 인프라가 이미 있어 자동/수동 스모크를 모두 통과 → `"status": "completed"`, `"summary": "스모크 범위·통과 항목 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`

## 금지사항

- 실 시크릿·라이브 URL·테스트 계정 자격증명을 테스트 코드·fixture·문서에 하드코딩하지 마라. 이유: 시크릿 노출.
- mock/CI에서 실 네트워크를 치는 스모크를 만들지 마라(env 게이트 필수). 이유: `npm test`는 인프라 없이 결정적으로 통과해야 한다.
- 클라이언트가 보낸 plan으로 Pro 흐름을 "통과"로 판정하지 마라. 진실 원천은 웹훅으로 갱신된 `profiles.plan`. 이유: CLAUDE.md CRITICAL.
- 스모크를 통과시키려고 mock으로 조용히 우회하지 마라(라이브 스모크는 라이브를 검증). 이유: 컷오버 검증 무의미화.
- 인프라가 없는데 통과했다고 조작하지 마라 — 정직하게 blocked. 이유: 실 인프라는 사용자 개입 영역.
- 기존 테스트를 깨뜨리지 마라.
