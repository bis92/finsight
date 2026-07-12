# 아키텍처

> 계획의 단일 원천은 이 문서(및 `PRD.md`·`ADR.md`)다. 시스템 불변식은 `CLAUDE.md`에 요약돼 있다.

## 핵심 원칙: mock-first 시임

mock 데이터는 `/api/*` 뒤 repository(`services/`)에**만** 둔다. `queries`/컴포넌트는 phase 0(mock)에서도 항상 실제 `/api`를 호출한다. phase 1에서 repository 구현만 Supabase/Claude/Polar로 교체 → **UI 코드 불변**. repository 선택은 서버 env `DATA_SOURCE=mock|live`로 스위치. mock·스텁 인증은 prod 빌드에 새지 않게 env 가드(`DATA_SOURCE` 기준).

## 패턴

- **Server Components 기본.** 인터랙션이 필요한 곳(업로드 드롭존, 매핑 확인 UI, 차트)만 Client Component.
- **CRITICAL: 모든 외부 API 호출(Anthropic·Polar·Supabase service-role)은 `app/api/` Route Handler에서만.** 클라이언트에서 직접 호출 금지(API 키 노출·RLS 우회 방지).
- **집계는 코드, 판단은 AI.** 카테고리 합계·비율 등 숫자는 `lib/`에서 결정론적으로 계산한다. Opus는 진단문·절감제안 배열만 구조화 JSON으로 생성 → 환각·파싱오류 최소, 테스트 용이(ADR-005).
- **TDD 필수.** 새 기능은 테스트 먼저(CSV 파싱·집계·스키마 검증부터).
- 컴포넌트는 `components/`, 타입은 `types/`, 외부 API 래퍼는 `services/`, 순수 로직/유틸은 `lib/`.

## 디렉토리 구조

```
src/
├── app/                 # 페이지 + API 라우트
│   ├── (marketing)/     # 랜딩, 게스트 데모
│   ├── (auth)/          # 로그인/가입 (카카오·구글 OAuth)
│   ├── dashboard/       # Free/Pro 대시보드
│   └── api/             # Route Handler (모든 데이터 접근의 단일 진입점)
├── components/          # ui 프리미티브 + 도메인 컴포넌트
├── queries/            # react-query 훅 (도메인별, apiClient 경유)
├── services/           # 데이터소스 구현 (mock|live repository)
├── lib/                # 순수 로직·유틸 (csv·집계·구독탐지·apiClient)
├── types/              # 타입·계약 (Category enum 등)
└── supabase/           # (phase 1) 마이그레이션/RLS/DB 타입
```

## 데이터 흐름 (단일 경로)

```
컴포넌트 → queries/<domain> (react-query) → apiClient/ApiError → /api/* (Route Handler)
         → services/ repository (mock|live) → [mock 값 | Supabase/Claude/Polar]
```

- 데이터 페칭은 `queries/<domain>` + react-query **단일 경로**. 모두 공용 `apiClient`/`ApiError`를 거쳐 `/api/*`를 호출한다.
- Server Component 서버페치 최적화는 성능 문제가 실제로 보이면 그때 도입한다.
- 로딩/에러/빈(empty) 상태는 `queries` 레벨에서 표준 처리한다.

## 시임 인터페이스 (교체 리스크 큰 2개만 형식화)

```ts
interface TransactionsRepository {
  listByUser(userId: string, range?: DateRange): Promise<Transaction[]>
  insertMany(userId: string, txns: NewTransaction[]): Promise<{ inserted: number }>
  reclassify(userId: string, txnId: string, category: Category): Promise<Transaction>
}
interface LlmService {
  mapColumns(input: ColumnMappingInput): Promise<ColumnMappingResult>          // 헤더+샘플 ≤20행만
  generateInsights(agg: AggregateSnapshot): Promise<Insight[]>                 // Pro (지출 진단 리포트)
  detectSubscriptions(txns: Transaction[]): Promise<SubscriptionCandidate[]>   // Pro (규칙 우선, LLM 보조)
}
```

- uploads·profiles 접근은 formal interface 없이 단순 함수(`services/`). mock/real 반환 타입은 **완전히 동일**, mock은 결정적 값 반환.
- `ColumnMappingInput`: `{ headers: string[]; sampleRows: string[][]; locale: 'ko-KR' }`. `sampleRows`는 데이터 행 최대 20개, 헤더 중복 미포함.
- `ColumnMappingResult`: `{ mapping; confidence; missingRequired; alternatives; rationale }`. `confidence < 0.75` 또는 `missingRequired` 있으면 자동 확정 금지 → 수동 매핑 스텝.

## 데이터 모델 (Supabase Postgres · RLS on, 모든 행 `user_id = auth.uid()`)

| 테이블 | 핵심 컬럼 |
| --- | --- |
| `profiles` | `id`(=auth uid), `plan`('free'\|'pro', **진실 원천**, Polar 웹훅으로만 갱신), `polar_subscription_id`, `polar_customer_id`, `plan_valid_until` |
| `uploads` | `id`, `user_id`, `file_path`(비공개 Storage), `original_name`, `status`('parsing'\|'done'\|'error'), `error_message` |
| `transactions` | `id`, `user_id`, `upload_id`, `occurred_on`(date), `merchant`, `amount`(**integer, KRW 원, ≥0**), `direction`('expense'\|'income'), `category`(enum), `raw`(jsonb) |
| `analyses` | `id`, `user_id`, `period`, `summary`, `insights`(jsonb) — Pro 지출 진단 리포트, user·기간 스코프 |
| `subscriptions` | `id`, `user_id`, `merchant`, `amount`, `cadence`, `confidence`, `evidence_count`, `last_seen_on`, `active` |

- **`amount`는 부호 없는 정수(원)**, 지출/수입 구분은 `direction`으로만. 부호 저장 금지(파서별로 흔들려 집계가 깨짐).
- 환불·매입취소는 `direction='income'`으로 정규화(순지출 = 지출 − 환입). 해외 거래는 원화 청구액만(원통화는 `raw`).
- `category`는 `types/`의 고정 enum(식비·교통·쇼핑·구독·주거/통신·의료·금융·여가·교육·수입·기타 ~12종)만. 자유 문자열 금지.
- 대시보드 집계는 `transactions`에서 **DB 파생 계산**(별도 집계 테이블 없음). `amount`·`merchant`가 평문이라 `SUM`/`GROUP BY`가 DB에서 가능. INDEX `transactions(user_id, occurred_on)`.

## 보안 (CRITICAL — 개인 금융 PII)

- **RLS**: 모든 테이블 `user_id = auth.uid()`. 서버 라우트는 사용자 JWT 컨텍스트로 접근. **service-role 키는 Polar 웹훅 plan 갱신에만** 사용.
- **저장 암호화·접근통제**: Supabase at-rest 암호화 + 비공개 Storage(파일은 서명 URL로만 접근). **컬럼(앱단) 암호화는 하지 않는다** — `amount`/`merchant`를 앱단 암호화하면 대시보드 집계를 DB에서 `SUM`/`GROUP BY`로 수행할 수 없다. 위협모델상 기밀성은 RLS + at-rest + 접근통제로 확보한다.
- **완전 삭제(삭제권)**: 회원 탈퇴 시 `uploads`·`transactions`·`analyses`·`subscriptions` 및 Storage 원본 파일을 전부 삭제한다.
- **출력 신뢰경계**: LLM 출력(매핑·인사이트)은 평문 렌더(마크다운/HTML 금지), 페이월은 데이터 레벨 차단(CSS 블러 아님). 상세는 `UI_GUIDE.md`.

## 환경변수 (전부 서버 전용, `NEXT_PUBLIC_`는 anon만)

- 공개 가능(phase 1): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- 서버 전용(phase 1): `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`.
- `DATA_SOURCE=mock|live` — repository 스위치.
- 인증: 카카오·구글 OAuth provider는 Supabase Auth 대시보드에서 설정. 카카오는 Supabase 기본 provider가 아니라 커스텀 OIDC 등록 필요(ADR-002).

## 배포 (Vercel CLI 자동화)

`vercel` CLI로 배포를 스크립트화(`vercel pull → build → deploy --prebuilt --prod`). **mock 상태(`DATA_SOURCE=mock`)부터 Phase 0에서 배포**해 공개 URL로 확인하고, Phase 1은 시크릿 등록 + `DATA_SOURCE=live` 전환만 수행(배포 스크립트 불변).
