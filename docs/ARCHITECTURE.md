# 아키텍처

## 디렉토리 구조
```
src/
├── app/                  # 페이지 + Route Handler
│   ├── (marketing)/      # 랜딩 등 공개 페이지
│   ├── (auth)/           # 로그인/회원가입
│   ├── dashboard/        # 보호된 대시보드
│   └── api/              # Route Handler (webhook, 서버 전용 엔드포인트)
├── components/           # UI 컴포넌트 (ui/ 프리미티브 + 도메인 컴포넌트)
├── queries/              # react-query 훅 (도메인별, 항상 /api/* 호출)
├── services/             # 데이터 소스 구현 (repository) — mock | supabase | claude | polar
├── lib/                  # 순수 로직·유틸 (csv 파싱·정규화·집계·구독탐지·apiClient)
├── types/                # TypeScript 타입 + 시임 인터페이스 계약
└── supabase/             # (phase 1) 마이그레이션 SQL, RLS 정책, 생성된 DB 타입
```

## 개발 단계 (phase)
- **phase 0 `0-mvp-ui`**: mock 데이터로 전 화면 구현. 외부 키 불필요.
- **phase 1 `1-wire-up`**: 실 Supabase(Auth/DB/Storage)·Claude·Polar 연동 + 배포. mock repository만 교체.
- 두 phase 모두 실제로 구현한다. mock-first는 순서이지 범위 축소가 아니다.

## 레이어링 & 시임(seam) — mock-first의 핵심
- **mock은 `/api/*` 뒤의 repository(`services/`)에 둔다.** 클라이언트 `queries`는 phase 0(mock)에서도 **실제 `/api`를 호출**하고, `/api`가 mock repository를 반환한다. phase 1에선 repository 구현만 Supabase/Claude/Polar로 교체 → **클라이언트 코드 0 변경.**
- CRITICAL: mock 데이터를 `queries`(클라이언트)나 컴포넌트에 직접 두지 마라. 이유: phase 1에서 클라 코드를 재작성하게 되고 "UI 불변" 전제가 깨진다.
- repository 선택은 서버 env(`DATA_SOURCE=mock|live`)로 스위치. mock repository·스텁 인증은 **prod 빌드에 새지 않게** env로 가드한다.

## 시임 인터페이스 계약 (교체 리스크 큰 2개만 형식화)
```ts
interface TransactionsRepository {
  listByUser(userId: string, range?: DateRange): Promise<Transaction[]>
  insertMany(userId: string, txns: NewTransaction[]): Promise<{ inserted: number }>
  reclassify(userId: string, txnId: string, category: Category): Promise<Transaction>
}
interface LlmService {
  mapColumns(sampleRows: string[][]): Promise<ColumnMapping>        // 샘플 ≤20행만
  generateInsights(agg: AggregateSnapshot): Promise<Insight[]>      // Pro
  detectSubscriptions(txns: Transaction[]): Promise<Subscription[]> // Pro (규칙 우선, LLM 보조)
}
```
- uploads·profiles 접근은 formal interface 없이 단순 함수(`services/`)로 둔다(과형식화 방지).
- 반환 타입은 mock과 real이 **완전히 동일**해야 한다. mock 구현은 결정적 값을 반환.

## 패턴 & 서버/클라 경계
- **데이터 페칭은 client + `queries`(react-query) 단일 경로.** 모두 `/api/*`를 호출한다. (Server Component 서버페치 최적화는 성능 문제가 실제로 보이면 그때 — MVP는 단일 경로로 단순하게)
- 인터랙션(폼·SideView·재분류 Modal·차트)이 필요한 곳은 `"use client"`.
- 외부 호출(Claude/Polar/Supabase service-role)은 Route Handler/Server Action 안에서만.

## 데이터 흐름
```
[업로드]  단일 CSV → POST /api/uploads
  → Storage(비공개) 저장 → lib/csv: 인코딩 감지 → TextDecoder 디코딩 → 금액/날짜/방향 정규화
  → LlmService.mapColumns(샘플행) → 매핑 확인 스텝(사용자 확정/수정)
  → NewTransaction[] 생성 → insertMany
[조회]  dashboard → queries → /api/analyses → transactions 집계 파생 → UI
[Pro]   /api/insights → LlmService(집계 스냅샷만 전달) → analyses 저장 → UI
[결제]  Polar Checkout → 웹훅 POST /api/webhooks/polar(서명검증 + 단순 멱등) → profiles.plan 갱신
```
- MVP는 **단일 파일 업로드**. 다중파일 병합·중복감지(fingerprint/upsert)는 로드맵. (프로토타입은 "1파일→분석"으로 핵심 Aha 검증)

## 데이터 모델 (Supabase Postgres · RLS on, 모든 행 user_id = auth.uid())
| 테이블 | 핵심 컬럼 |
| --- | --- |
| `profiles` | `id`(=auth uid), `plan`('free'\|'pro'), `polar_subscription_id`, `polar_customer_id`, `plan_valid_until`, `created_at` |
| `uploads` | `id`, `user_id`, `file_path`(Storage 비공개), `original_name`, `status`('parsing'\|'done'\|'error'), `error_message`, `created_at` |
| `transactions` | `id`, `user_id`, `upload_id`, `occurred_on`(date), `merchant`(text), `amount`(**integer, KRW 원, ≥0**), `direction`('expense'\|'income'), `category`(enum), `raw`(jsonb) |
| `analyses` | `id`, `user_id`, `period`(text, 예 '2026-06'), `summary`(text), `insights`(jsonb), `created_at` — **user·기간 스코프** |
| `subscriptions` | `id`, `user_id`, `merchant`, `amount`, `cadence`('monthly'\|'yearly'…), `last_seen_on`, `active`(bool) — 정기결제 탐지 결과 |

규칙·인덱스:
- `amount`는 **부호 없는 정수(원)**, 지출/수입 구분은 `direction`으로만. (KRW는 소수 없음, 부호 저장 시 파서별로 흔들려 집계가 깨진다)
- **환불·매입취소는 `direction='income'`(지출 환입)**으로 정규화, category 유지. 대시보드는 **순지출(지출−환입)**로 표시. (E1)
- **해외/외화 거래는 원화 청구액만** 사용, 원통화는 `raw`에만 보관. (E2)
- `category`는 `types/`의 고정 enum(식비·교통·쇼핑·구독·주거/통신·의료·금융·여가·교육·수입·기타 ~12종)만 사용. 자유 문자열 금지. 재분류 Modal도 이 enum에서만 선택. (E1/집계 무결성)
- 대시보드 집계는 `transactions`에서 **파생 계산**(별도 집계 테이블 없음).
- INDEX `transactions(user_id, occurred_on)` — 대시보드 조회 경로.

## RLS · 서비스롤 · Storage 경계 (phase 1)
- CRITICAL: 유저 데이터(uploads·transactions·analyses) 접근은 **user-scoped 클라이언트(RLS on)**로. `SUPABASE_SERVICE_ROLE_KEY`는 **Polar 웹훅 plan 갱신에만**. 다른 곳에서 service-role로 RLS를 우회하지 마라.
- 모든 테이블 RLS: `user_id = auth.uid()` (profiles는 `id = auth.uid()`).
- Storage 버킷 **비공개**, 경로 `{user_id}/...` 스코프, 다운로드는 **짧은 만료 signed URL**로만.
- API 핸들러는 인증 + **소유권**도 확인(upload_id가 해당 user 소유인지). RLS는 2차 방어선.

## 인코딩 파이프라인 (lib/csv)
1. 파일 바이트에서 인코딩 **감지**(UTF-8/EUC-KR·CP949 휴리스틱).
2. `TextDecoder('euc-kr')` 등으로 **디코딩**(Node 18+ 내장, 무의존). Papaparse에 넘기기 전에 반드시 디코딩.
3. 상단 계좌요약행/빈 줄 제거 → 파싱 → 금액·날짜·방향 정규화.
- **감지 실패 대비:** 확인 스텝 미리보기에서 사용자가 깨짐을 눈으로 확인 → 필요시 **인코딩 수동 선택(UTF-8/EUC-KR) 드롭다운** 제공. (E3)

## 에러 처리 규약
- `/api/*`는 일관된 에러 봉투 `{ message }`(필요시 `code`) 반환. 클라이언트는 `ApiError`(status + message)로 정규화.
- CRITICAL: **의도된 사용자 메시지(검증·업무·권한)는 서버 `message` 그대로 노출.** 상태코드→한글 치환 테이블 금지.
- CRITICAL: **내부 예외(DB·스택·서드파티 원문)를 사용자 메시지로 노출하지 마라.** 5xx는 단일 일반 문구로 덮고 상세는 서버 로그로만.
- **LLM 매핑 실패(무효 JSON·거부·타임아웃):** 응답 스키마 검증 → 실패 시 1회 재시도 → 그래도 실패면 **수동 매핑 스텝으로 자동 폴백.** LLM 실패가 업로드 전체를 죽이지 않게. (E4)
- **부분 실패:** 성공 행은 임포트하고 실패 행 수·사유를 리포트(전량 거부 X).
- **구독 만료 강등(Pro→Free):** 과거 분석/거래는 **열람 허용**, 심화 인사이트·구독탐지 **기능만 잠금.** (E5)
- 로딩/에러/빈(empty) 상태는 `queries` 레벨에서 표준 처리.

## 보안 규약 (MVP — 트래픽 스케일링은 범위 밖)
- 시크릿 서버 전용, `NEXT_PUBLIC_` 금지. 클라이언트 컴포넌트에서 서버 env import 금지.
- 업로드 검증: 확장자·MIME·**최대 크기(예 10MB)·최대 행 수** 상한(입력 검증). ※ 분당 rate limit 등 트래픽 방어는 실사용 트래픽 생기면 도입.
- CSV 셀은 **신뢰불가 입력.** LLM 프롬프트에서 데이터가 지시를 덮어쓰지 못하게 구조화(인젝션 방어). 렌더는 React 기본 이스케이프 유지(`dangerouslySetInnerHTML` 금지).
- 개인 금융데이터: 업로드/거래 **삭제 기능** + "분석 후 원본 CSV 파기" **옵션 토글** + **계정 삭제 시 전량 삭제.** 로그에 CSV 원문·금액·PII 평문 기록 금지. (E8)
- 결제 웹훅: **서명검증 + 단순 멱등(이미 반영된 상태면 무시).** (out-of-order·전용 이벤트 로그 테이블은 실트래픽 시)

## 상태 관리
- 서버 상태: `queries`(react-query). 클라 상태(폼·SideView·Modal 열림): `useState`/`useReducer`. 전역 상태 라이브러리 미도입(MVP).

## 환경변수 (전부 서버 전용, `NEXT_PUBLIC_`는 anon만)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — 공개 가능(phase 1).
- `SUPABASE_SERVICE_ROLE_KEY` · `ANTHROPIC_API_KEY` · `POLAR_ACCESS_TOKEN` · `POLAR_WEBHOOK_SECRET` — 서버 전용(phase 1).
- `DATA_SOURCE=mock|live` — repository 스위치.
