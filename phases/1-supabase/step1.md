# Step 1: schema-migrations

## 읽어야 할 파일

먼저 아래 파일들을 읽고 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (amount 부호 없는 정수 규칙 · direction 규칙 · category 고정 enum · plan 진실 원천 · 데이터 모델 규칙)
- `/docs/ARCHITECTURE.md` ("데이터 모델" 표 — profiles·uploads·transactions·analyses·subscriptions 컬럼 · INDEX 규칙)
- `/docs/ADR.md` (ADR-002 Supabase/RLS, ADR-009 원본 거래 저장·컬럼 암호화 제외)
- `/docs/PRD.md` (과금 모델 · Pro 앵커)
- `/src/types/transaction.ts` (`CATEGORIES` 13종 · `Direction` · `Transaction` 필드 — DB enum/컬럼과 정확히 일치시켜야 함)
- `/src/types/plan.ts` (`Plan = 'free' | 'pro'`)
- `/src/types/upload.ts` (`UploadStatus = 'parsing' | 'done' | 'error'`)
- `/src/types/analysis.ts` (`Cadence` · `SubscriptionCandidate` 필드 · analyses insights 구조)
- Step 0 산출물: `supabase/migrations/` 디렉토리

이전 코드를 꼼꼼히 읽고 설계 의도를 이해한 뒤 작업하라. DB 스키마는 `src/types/`의 계약과 **정확히** 일치해야 한다.

## 작업

`supabase/migrations/0001_schema.sql`을 작성한다. ARCHITECTURE.md "데이터 모델" 표를 그대로 스키마로 옮긴다. RLS 정책은 이 파일이 아니라 Step 2(`0002_rls.sql`)에서 다룬다 — 여기서는 테이블·enum·인덱스·제약만 만든다.

1. **Enum 타입** — Postgres `create type ... as enum`으로 정의한다. `src/types/`와 **정확히 일치**시킨다.
   - `plan` enum: `'free'`, `'pro'` (기본값 `'free'`).
   - `direction` enum: `'expense'`, `'income'`.
   - `upload_status` enum: `'parsing'`, `'done'`, `'error'`.
   - `category` enum: **`src/types/transaction.ts`의 `CATEGORIES` 13종과 순서·문자열 정확히 일치**:
     `식비 · 카페/간식 · 교통 · 쇼핑 · 구독 · 주거 · 공과금 · 문화/여가 · 의료 · 금융 · 교육 · 수입 · 기타`.
     CRITICAL: 자유 문자열 컬럼(`text`)로 두지 마라 — 반드시 enum. 이유: CLAUDE.md CRITICAL — 집계·재분류가 고정 enum에 의존한다.
   - `cadence` enum: `'monthly'`, `'weekly'`, `'unknown'`.

2. **`profiles`**
   - `id uuid primary key references auth.users(id) on delete cascade` (= auth uid).
   - `plan plan_enum not null default 'free'` (**진실 원천** — Polar 웹훅으로만 갱신, Step 2에서 유저 UPDATE 차단).
   - `polar_subscription_id text`, `polar_customer_id text` (nullable).
   - `created_at timestamptz not null default now()`.

3. **`uploads`**
   - `id uuid primary key default gen_random_uuid()`.
   - `user_id uuid not null references auth.users(id) on delete cascade`.
   - `file_path text not null` (비공개 Storage 경로), `original_name text not null`.
   - `status upload_status_enum not null`, `error_message text` (nullable).
   - `created_at timestamptz not null default now()`.

4. **`transactions`**
   - `id uuid primary key default gen_random_uuid()`.
   - `user_id uuid not null references auth.users(id) on delete cascade`.
   - `upload_id uuid not null references uploads(id) on delete cascade`.
   - `occurred_on date not null`.
   - `merchant text not null`.
   - CRITICAL: `amount integer not null check (amount >= 0)` — **부호 없는 정수(KRW 원)**. 지출/수입은 `amount` 부호가 아니라 `direction`으로만 표현한다. 이유: CLAUDE.md CRITICAL — 부호 저장은 파서별로 흔들려 집계가 깨진다.
   - `direction direction_enum not null`.
   - `category category_enum not null`.
   - `raw jsonb not null default '{}'::jsonb` (원본 셀·원통화 등).
   - CRITICAL: 집계 성능을 위한 인덱스 `create index ... on transactions (user_id, occurred_on)`. 이유: 대시보드 집계는 별도 집계 테이블 없이 이 테이블에서 `SUM`/`GROUP BY`로 DB 파생 계산한다(ARCHITECTURE.md).

5. **`analyses`** (Pro 지출 진단 리포트 — user·기간 스코프)
   - `id uuid primary key default gen_random_uuid()`.
   - `user_id uuid not null references auth.users(id) on delete cascade`.
   - `period text not null`.
   - `summary text`.
   - `insights jsonb not null default '[]'::jsonb` (구조화 Insight 배열 — ADR-005).
   - `created_at timestamptz not null default now()`.

6. **`subscriptions`** (정기구독 후보)
   - `id uuid primary key default gen_random_uuid()`.
   - `user_id uuid not null references auth.users(id) on delete cascade`.
   - `merchant text not null`.
   - `amount integer not null check (amount >= 0)` (부호 없는 정수, 원).
   - `cadence cadence_enum not null`.
   - `confidence real not null`.
   - `last_seen_on date not null`.

작성 규칙: 컬럼명은 snake_case(DB 관례), 타입 계약(`src/types/`)의 camelCase와의 매핑은 Step 3의 DB 타입/클라이언트가 담당한다. 마이그레이션은 idempotent를 지향하되(가능하면 `create type ... if not exists`가 없는 enum은 안전하게 정의), 이 파일 하나로 스키마 전체가 재현되게 한다. 앱단 컬럼 암호화는 하지 마라(ADR-009) — `amount`/`merchant`는 평문이어야 DB 집계가 가능하다.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 이 step은 SQL 산출물이므로 앱 빌드/테스트는 회귀 방지용이다(스키마 SQL은 앱 코드가 아직 참조하지 않음). 추가로 `supabase/migrations/0001_schema.sql`이 존재하고, `category` enum 값이 `src/types/transaction.ts`의 `CATEGORIES` 13종과 문자열·순서가 일치하는지 육안/그렙으로 확인한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - ARCHITECTURE.md "데이터 모델" 표의 5개 테이블·컬럼이 모두 반영됐는가?
   - `amount`가 `integer` + `check (amount >= 0)`인가(부호 없는 정수)? `direction` enum이 있는가?
   - `category`가 enum이며 `src/types`의 13종과 정확히 일치하는가?
   - `profiles.id`가 `auth.users` FK이고 `plan` 기본값이 `'free'`인가?
   - `transactions(user_id, occurred_on)` 인덱스가 있는가?
   - `occurred_on`이 `date`, `raw`가 `jsonb`인가?
3. 결과에 따라 `phases/1-supabase/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "생성한 테이블·enum·인덱스 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- `amount`를 부호(음수 허용)로 저장하지 마라(`check (amount >= 0)` 필수). 이유: CLAUDE.md CRITICAL — direction과 이중표현되어 집계가 깨진다.
- `category`를 `text`/자유 문자열로 두지 마라(반드시 enum, 13종 일치). 이유: CLAUDE.md CRITICAL.
- `amount`/`merchant`를 앱단 암호화하거나 암호화 컬럼으로 만들지 마라. 이유: ADR-009 — DB `SUM`/`GROUP BY` 집계가 불가능해진다.
- 이 파일에 RLS enable/정책을 넣지 마라. 이유: Step 2(`0002_rls.sql`) scope다.
- 별도 집계(aggregate) 테이블을 만들지 마라. 이유: 대시보드는 `transactions`에서 DB 파생 계산한다.
- 기존 테스트를 깨뜨리지 마라.
