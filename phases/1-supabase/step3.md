# Step 3: db-types-clients

## 읽어야 할 파일

먼저 아래 파일들을 읽고 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (외부 API·시크릿 서버 전용 · service-role은 웹훅 plan 갱신에만 · 유저 데이터는 RLS user-scoped 클라이언트로 · 디렉토리 규칙 `lib/`)
- `/docs/ARCHITECTURE.md` ("보안" 절 · "환경변수" 절 · 디렉토리 구조 — `src/lib/`)
- `/docs/ADR.md` (ADR-002 Supabase/RLS·service-role 용도 제한)
- Step 0 산출물: `src/lib/env.ts` (`getSupabaseUrl`·`getSupabaseAnonKey`·`getSupabaseServiceRoleKey`)
- Step 1 산출물: `supabase/migrations/0001_schema.sql` (테이블·컬럼·enum — DB row 타입의 원천)
- `/src/types/transaction.ts`·`plan.ts`·`upload.ts`·`analysis.ts` (앱 계약 타입 — DB row 타입은 이들과 정합해야 함)

이전 코드를 꼼꼼히 읽고 설계 의도를 이해한 뒤 작업하라. 이 phase는 mock 동작을 유지한다 — 이 step은 live 클라이언트/타입만 추가하고 `services/index.ts` 컷오버는 건드리지 않는다.

## 배경

`services/index.ts`의 팩토리는 `DATA_SOURCE=live`일 때 여전히 throw해야 한다(컷오버는 6-launch). 따라서 이 step의 테스트는 실네트워크가 아니라 **Supabase SDK를 목킹한 단위테스트**로 검증한다. 클라이언트 생성 함수가 올바른 인자(url·key·쿠키)로 SDK를 호출하는지, service-role 클라이언트가 server-only인지만 확인한다.

## 작업

1. **`src/types/database.ts`** — DB row 타입
   - Step 1 스키마의 각 테이블에 대한 row 타입을 정의한다(snake_case 컬럼명 그대로). 예:
     ```ts
     export type ProfileRow = {
       id: string
       plan: 'free' | 'pro'
       polar_subscription_id: string | null
       polar_customer_id: string | null
       created_at: string
     }
     export type UploadRow = { id: string; user_id: string; file_path: string; original_name: string; status: 'parsing' | 'done' | 'error'; error_message: string | null; created_at: string }
     export type TransactionRow = { id: string; user_id: string; upload_id: string; occurred_on: string; merchant: string; amount: number; direction: 'expense' | 'income'; category: Category; raw: Record<string, unknown>; }
     export type AnalysisRow = { id: string; user_id: string; period: string; summary: string | null; insights: Insight[]; created_at: string }
     export type SubscriptionRow = { id: string; user_id: string; merchant: string; amount: number; cadence: Cadence; last_seen_on: string; confidence: number }
     ```
   - `category`·`direction`·`Insight`·`Cadence` 등은 가능하면 `src/types/`의 기존 타입을 재사용/참조해 계약 drift를 막는다.
   - 선택: `@supabase/supabase-js`의 제네릭에 쓸 `Database` 인터페이스(테이블→Row 매핑)를 함께 정의해 클라이언트 타입 안전성을 높인다.
   - CRITICAL: `amount`는 부호 없는 정수(원). DB row 타입에서도 부호로 지출/수입을 표현하지 마라(`direction`으로만). 이유: CLAUDE.md CRITICAL.

2. **`src/lib/supabase/server-client.ts`** — user-scoped 클라이언트 (기본 경로)
   - `@supabase/ssr`의 `createServerClient`를 사용해 **쿠키 기반 user-scoped** 클라이언트를 만든다. 시그니처 예:
     ```ts
     export function createSupabaseServerClient(): SupabaseClient<Database>
     ```
   - `getSupabaseUrl()`·`getSupabaseAnonKey()`(Step 0)로 anon 키를 쓰고, Next.js 쿠키에서 세션을 읽어 유저 JWT 컨텍스트로 접근한다(→ RLS가 `auth.uid()`로 적용됨).
   - CRITICAL: **유저 데이터 접근의 기본 경로는 이 user-scoped 클라이언트다.** anon 키 + 유저 세션 쿠키를 쓰므로 RLS가 강제된다. 이유: CLAUDE.md CRITICAL — 유저 데이터는 RLS가 켜진 user-scoped 클라이언트로만.

3. **`src/lib/supabase/service-role-client.ts`** — service-role 클라이언트 (극히 제한된 용도)
   - 파일 최상단에 `import 'server-only'`를 둔다(클라이언트 번들 유출 시 빌드 에러로 fail).
   - `@supabase/supabase-js`의 `createClient`로 `getSupabaseServiceRoleKey()`를 써서 RLS를 우회하는 클라이언트를 만든다. 시그니처 예:
     ```ts
     export function createSupabaseServiceRoleClient(): SupabaseClient<Database>
     ```
   - CRITICAL: 파일 상단 주석에 **"오직 Polar 웹훅 plan 갱신 전용. 유저 데이터 접근에 사용 금지."**를 명시한다. 이유: CLAUDE.md CRITICAL · ADR-002 — service-role은 RLS를 우회하므로 오남용 시 크로스테넌트 유출.
   - service-role 클라이언트는 세션 지속(persistSession)/자동 리프레시를 끄는 등 서버 전용 옵션으로 생성한다.

파일 위치 규칙: 두 클라이언트는 `src/lib/supabase/` 아래에 둔다(ARCHITECTURE.md — 외부 API 래퍼/유틸 lib). `src/services/index.ts`나 mock 팩토리를 이 step에서 수정하지 마라(live 배선은 후속 phase, 컷오버는 6-launch).

## Acceptance Criteria

```bash
npm run build
npm test
```

- **TDD** — Supabase SDK(`@supabase/ssr`의 `createServerClient`, `@supabase/supabase-js`의 `createClient`)를 목킹(vitest `vi.mock`)한 단위테스트를 둔다. 검증 항목:
  - `createSupabaseServerClient()`가 `getSupabaseUrl()`·`getSupabaseAnonKey()` 값과 쿠키 어댑터로 `createServerClient`를 호출한다.
  - `createSupabaseServiceRoleClient()`가 service-role 키로 `createClient`를 호출한다.
  - env 미설정 시 Step 0 접근자가 throw하는 경로가 동작한다.
  - 실네트워크 호출이 없어야 한다(SDK 목킹).

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - `src/types/database.ts` row 타입이 Step 1 스키마와 정합하는가(`amount` 부호 없는 정수·enum 일치)?
   - server-client가 `@supabase/ssr` `createServerClient` + 쿠키 + anon 키(user-scoped, RLS 적용)인가?
   - service-role-client 최상단에 `import 'server-only'`와 "웹훅 plan 갱신 전용" 주석이 있는가?
   - 두 파일이 `src/lib/supabase/`에 있고, `services/index.ts` 컷오버를 건드리지 않았는가?
3. 결과에 따라 `phases/1-supabase/index.json`의 step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "database row 타입·server-client·service-role-client 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- service-role 클라이언트를 유저 데이터 접근에 쓰지 마라(오직 Polar 웹훅 plan 갱신 전용). 이유: CLAUDE.md CRITICAL · ADR-002 — RLS 우회로 크로스테넌트 유출.
- service-role-client 파일에서 `import 'server-only'`를 생략하지 마라. 이유: 시크릿(service-role 키)이 클라이언트 번들에 노출된다.
- `SUPABASE_SERVICE_ROLE_KEY`를 server-client(user-scoped)에서 읽지 마라(anon 키만). 이유: 유저 경로에서 RLS가 우회된다.
- `services/index.ts`의 live throw나 mock 배선을 이 step에서 바꾸지 마라. 이유: 컷오버는 6-launch에서 한 번만 한다.
- 실네트워크(실제 Supabase 인스턴스)로 테스트하지 마라. SDK를 목킹하라. 이유: phase 1~5는 mock 동작 유지, 단위테스트로 검증.
- 기존 테스트를 깨뜨리지 마라.
