# Step 0: deps-env

## 읽어야 할 파일

먼저 아래 파일들을 읽고 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (시크릿 server-only 규칙 · service-role 용도 제한 · 아키텍처 규칙)
- `/docs/ARCHITECTURE.md` ("환경변수" 절 — 공개 가능 vs 서버 전용 구분 · mock-first 시임 · DATA_SOURCE 스위치)
- `/docs/ADR.md` (ADR-002 Supabase, ADR-008 mock-first `DATA_SOURCE`)
- `/src/lib/env.ts` (기존 `getDataSource` 서버 전용 env 헬퍼 — 이 파일을 확장한다)
- `/src/services/index.ts` (`DATA_SOURCE==='live'`면 throw하는 팩토리 — 이 phase에서 컷오버하지 **않는다**)
- `package.json` (현재 의존성 목록 · scripts)

이전 코드를 꼼꼼히 읽고 설계 의도를 이해한 뒤 작업하라.

## 배경 (phase 1~6 전체 맥락)

이 phase는 mock-first(ADR-008)로 완성된 `0-mvp`를 실연동으로 교체하는 첫 phase다. `services/index.ts`의 4개 팩토리는 `DATA_SOURCE=live`일 때 throw한다. **`DATA_SOURCE=live` 컷오버는 마지막 `6-launch`에서 한 번만** 한다. phase 1~5는 mock 동작을 유지한 채 live 구현체/인프라만 추가한다. 이 step은 그 인프라의 토대(의존성 · env 접근자 · 디렉토리)를 준비하는 부트스트랩이며 코드 로직은 만들지 않는다.

## 작업

1. **의존성 추가** — `package.json`
   - `@supabase/supabase-js`, `@supabase/ssr`를 dependencies에 추가하고 설치한다.
   - 다른 의존성 버전·scripts는 변경하지 마라.

2. **`src/lib/env.ts` 확장** — 기존 `getDataSource`는 그대로 두고, 아래 Supabase env 접근자를 **추가**한다.
   - 공개 가능(브라우저 노출 허용) — `NEXT_PUBLIC_` 접두사 유지:
     ```ts
     export function getSupabaseUrl(): string        // NEXT_PUBLIC_SUPABASE_URL
     export function getSupabaseAnonKey(): string    // NEXT_PUBLIC_SUPABASE_ANON_KEY
     ```
   - 서버 전용(브라우저 노출 금지):
     ```ts
     export function getSupabaseServiceRoleKey(): string  // SUPABASE_SERVICE_ROLE_KEY
     ```
   - CRITICAL: `SUPABASE_SERVICE_ROLE_KEY`에는 **절대 `NEXT_PUBLIC_` 접두사를 붙이지 마라**. `src/lib/env.ts`는 이미 파일 상단에 `import 'server-only'`가 있어 서버 전용이다. service-role 키 접근자가 클라이언트 번들에 새지 않도록 이 파일에서만 읽는다. 이유: CLAUDE.md CRITICAL — 시크릿은 서버 전용 env로만 읽는다.
   - 각 접근자는 env 미설정(빈 문자열/undefined) 시 **어떤 변수가 없는지 명시하는 명확한 런타임 에러를 throw**한다(예: `throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')`). 이유: live 전환 시 설정 누락을 조용히 삼키면 안 된다.
   - CRITICAL: 기존 `getDataSource`의 **기본값 `'mock'`을 바꾸지 마라**. 이유: live 컷오버는 6-launch 전용이다.

3. **`supabase/` 디렉토리 준비**
   - 저장소 루트에 `supabase/migrations/` 디렉토리를 만든다(Step 1·2의 SQL 마이그레이션이 여기 들어간다). 빈 디렉토리는 `.gitkeep`으로 커밋 가능하게 한다.
   - 이 step에서는 SQL 파일을 작성하지 마라(Step 1·2 scope).

4. **`.env` 문서화(선택, 값은 비워둠)**
   - `.env` 또는 `.env.example`에 새 변수 키를 **값 없이/플레이스홀더로** 추가해 필요한 env를 문서화한다(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). 실제 시크릿 값을 커밋하지 마라. 기존 `DATA_SOURCE=mock` 줄은 보존한다.

## Acceptance Criteria

```bash
npm install
npm run build
npm test
```

- `npm test`에 `src/lib/env.test.ts`를 확장하거나 신규 케이스를 추가해, 각 Supabase 접근자가 (a) env 설정 시 값을 반환하고 (b) 미설정 시 명확한 에러를 throw하는지 검증한다. `process.env`를 테스트 내에서 세팅/복원하라(실네트워크 호출 없음).
- `getDataSource` 기본값이 여전히 `'mock'`임을 검증하는 기존 테스트가 깨지지 않아야 한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - ARCHITECTURE.md 디렉토리 구조 준수(`supabase/`가 루트에 준비됨)?
   - ADR-002 기술스택(`@supabase/supabase-js`·`@supabase/ssr`) 준수?
   - CLAUDE.md CRITICAL: `SUPABASE_SERVICE_ROLE_KEY`에 `NEXT_PUBLIC_` 미부착, 서버 전용 파일에서만 접근?
   - `getDataSource` 기본값 `'mock'` 유지, `services/index.ts` live throw 미변경?
3. 결과에 따라 `phases/1-supabase/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "추가한 패키지 버전·env 접근자·디렉토리 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- `SUPABASE_SERVICE_ROLE_KEY`(또는 어떤 시크릿)에 `NEXT_PUBLIC_` 접두사를 붙이지 마라. 이유: CLAUDE.md CRITICAL — 시크릿이 클라이언트 번들에 노출된다.
- `getDataSource`의 기본값을 `'mock'` 외 값으로 바꾸지 마라. 이유: live 컷오버는 6-launch에서 한 번만 한다.
- `services/index.ts`의 live throw 로직을 건드리지 마라. 이유: 이 phase는 mock 동작을 유지한다.
- SQL 마이그레이션이나 Supabase 클라이언트 구현을 만들지 마라. 이유: 각각 Step 1·2·3 scope다.
- 실제 시크릿 값을 `.env`에 커밋하지 마라. 이유: 저장소에 자격증명 유출.
- 기존 테스트를 깨뜨리지 마라.
