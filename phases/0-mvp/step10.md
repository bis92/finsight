# Step 10: marketing-auth

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/DESIGN.md` (**랜딩/로그인 화면 스펙의 단일 참조** — § "랜딩 `/`"·"로그인 `/login`", dark hero·플로팅 mockup·feature 3카드·요금제 2티어·게스트 데모 경로)
- `/CLAUDE.md` (mock-first · 시크릿 서버 전용 · 페칭 단일 경로)
- `/docs/PRD.md` (핵심기능 4: 게스트 데모 / 5: 인증 카카오+구글 OAuth / 성공기준: Activation 3분)
- `/docs/UI_GUIDE.md` (Light · AI 슬롭 안티패턴 · 한국어 우선 — 색/폭은 DESIGN.md 우선)
- `/docs/ARCHITECTURE.md` (mock/스텁 인증 env 가드 · 게스트 데모 fixture)
- `/docs/ADR.md` (ADR-002 카카오+구글 OAuth, ADR-008 mock-first env 가드)
- Step 4: `src/services/mock/fixtures/` (게스트 데모용 결정적 샘플)
- Step 6: `src/queries/` · Step 7: `src/components/ui/`(TopNav·Footer·Button·Card·Badge) · Step 8: 대시보드

이전 step의 fixture·프리미티브·대시보드를 재사용해 조립하라.

## 작업

랜딩(`/`)·로그인(`/login`)·게스트 데모·**스텁 인증**을 DESIGN.md § 화면 인벤토리대로 만든다. Phase 0은 실제 OAuth 없음(스텁). 라우트 그룹(`(marketing)`/`(auth)`)은 자유이나 **공개 경로는 `/`·`/login`**, 게스트 데모는 **`/dashboard?guest=1`**(Step 8 대시보드 재사용)로 한다.

1. **랜딩 `/`** (DESIGN.md § 랜딩) — 컨테이너 `--container-max`, Light 기본, 좌측 정렬, 한국어. 도구처럼 보이는 신뢰형 카피(마케팅 과장 금지).
   - 상단 nav(TopNav): 워드마크 `finsight`(display·primary) + 기능/요금제/보안 링크 + 로그인/시작하기.
   - **dark hero**(`--color-surface-dark`): eyebrow 배지 + H1(**display 64px, weight 400** `내 돈이 어디로 갔는지, 3분 안에.`) + 서브카피 + CTA 2개(`내 파일로 시작하기` → `/login` · `샘플로 먼저 보기` → `/dashboard?guest=1`). 우측 **플로팅 mockup 카드 2장**(총지출 카드 + Opus 진단 카드, `0 24px 60px` 그림자 — 이 그림자만 예외 허용).
   - feature band(white): 3개 FeatureCard(컬럼 자동 매핑 / 통합 대시보드 / Pro 지출 진단).
   - pricing band(soft): **Free(₩0) / Pro(₩9,900/월, `OPUS 4.8` 배지)** 2티어. Pro 티어는 dark 카드.
   - Footer.
   - CRITICAL: AI 슬롭 안티패턴 금지(보라색·gradient orb·gradient-text·glass blur·"Powered by AI" 배지). display 헤드라인 bold 금지. 이유: UI_GUIDE·DESIGN.md.

2. **게스트 데모** — `/dashboard?guest=1` (Step 8 대시보드에 게스트 배너/읽기전용 처리)
   - 가입 없이 **읽기전용** 대시보드 체험. Step 4 fixture를 데이터 원천으로(서버 `/api`가 게스트 모드로 fixture 반환). 데이터는 여전히 queries 단일 경로.
   - 읽기전용: 재분류·업로드 등 mutation은 비활성 + `내 파일로 해보기` 가입 유도 CTA(→ `/login`).
   - Activation 목표: 가입 없이 3분 내 첫 대시보드.

3. **로그인 `/login`** (DESIGN.md § 로그인) — 중앙 카드(400px): 워드마크 + `3초 만에 시작하기` + **카카오(노란 `#FEE500`)·구글** 버튼 + 약관 문구. mock 인증 성공 → `/upload`. 이메일/비밀번호 없음.
   - CRITICAL: Phase 0은 실제 OAuth 대신 **스텁 로그인**(고정 데모 유저 세션 진입). 스텁 인증은 **`DATA_SOURCE`(또는 동등 env) 가드로 live 빌드에 새지 않게** 한다 — `live`에서는 fail-closed(비활성). 이유: ADR-008 — 스텁 인증이 공개/prod에 노출되면 안 됨.
   - CRITICAL: 시크릿·서버 전용 env를 클라이언트에 노출하지 마라(`NEXT_PUBLIC_` 금지 대상 유지).
   - 참고: DESIGN.md는 이 화면을 로그인 폼이라 중앙 카드로 두지만, 그 외 데이터/폼은 좌측 정렬 기본을 지킨다.

4. **네비게이션** — `/` ↔ `/login` ↔ `/upload` ↔ `/dashboard`(+ `?guest=1`) 흐름 연결. 로그인 후 업로드로.

## Acceptance Criteria

```bash
npm run build
npm test        # 게스트 데모/스텁 인증 가드 테스트(가능 범위) 통과
npm run lint
```

- 테스트 최소: 스텁 로그인이 `live` 모드에서 비활성(fail-closed)인지, 게스트 데모가 fixture 기반 읽기전용(mutation 비활성)인지.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 스텁 인증이 env 가드로 live에 새지 않는가(fail-closed)?
   - 게스트 데모가 fixture 기반 읽기전용인가?
   - 랜딩이 DESIGN.md § 랜딩(dark hero·플로팅 mockup·feature 3카드·요금제 2티어·display 400)·한국어·AI 슬롭 안티패턴 준수인가?
   - 게스트 데모가 `/dashboard?guest=1` 읽기전용, 로그인 성공이 `/upload`로 가는가? `#0052ff` 액센트(teal 없음)인가?
   - 시크릿을 클라이언트에 노출하지 않는가?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 10을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "랜딩/데모/스텁인증 구성·env 가드 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- 실제 카카오/구글 OAuth·Supabase Auth를 연동하지 마라(스텁만). 이유: Phase 0 범위 밖(Phase 1).
- 스텁 인증을 env 가드 없이 두지 마라(live 노출 금지). 이유: ADR-008 fail-closed.
- AI 슬롭 안티패턴(보라색·gradient orb 등)을 쓰지 마라. 이유: UI_GUIDE.
- 시크릿을 `NEXT_PUBLIC_`로 노출하지 마라. 기존 테스트를 깨뜨리지 마라.
