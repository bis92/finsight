# Step 4: account-deletion

## 읽어야 할 파일

먼저 아래 파일들을 읽고 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (완전 삭제·삭제권 · RLS user-scoped 접근 · service-role은 Polar 웹훅에만 · 내부 예외 노출 금지 · 업로드 CSV는 비공개 Storage)
- `/docs/ARCHITECTURE.md` ("보안" 절 — "완전 삭제(삭제권): 회원 탈퇴 시 `uploads`·`transactions`·`analyses`·`subscriptions` 및 Storage 원본 파일을 전부 삭제")
- `/docs/ADR.md` (**ADR-009** 완전삭제·삭제권·비공개 Storage, ADR-002 RLS)
- `/src/app/api/_lib/server.ts` (`withErrorBoundary`·`ApiRouteError`·`INTERNAL_ERROR_MESSAGE` — 재사용)
- `/src/app/api/uploads/route.ts` (Route Handler 작성 관례 참고)
- Step 1 산출물: `/src/lib/supabase/storage.ts` (`removeObjects` — Storage 원본 파일 삭제 헬퍼)
- Step 0 산출물: `/src/services/live/transactions.ts` (user-scoped 접근 패턴)
- `1-supabase`/`2-auth` 산출물: `/src/lib/supabase/server-client.ts` (user-scoped 클라이언트), `/src/lib/auth/session.ts` (`getAuthenticatedUserId`)

이전 코드를 꼼꼼히 읽고 삭제권(ADR-009)과 자기 데이터 격리 규칙을 이해한 뒤 작업하라.

## 배경

phase 3는 mock을 유지한 채 live 구현만 추가한다(컷오버는 6-launch). 이 step은 ADR-009의 **삭제권(회원 탈퇴 시 완전 삭제)**을 구현하는 `DELETE /api/account` 라우트를 만든다. 유저가 탈퇴하면 그의 DB 데이터와 Storage 원본 파일을 전부 지운다.

## 작업

**TDD 필수** — 삭제 시퀀스(자기 데이터만 삭제 + Storage 파일 삭제)를 서비스/Supabase 목킹 단위 테스트로 먼저 고정한다. 실네트워크 금지.

1. **계정 완전삭제 라우트** — `src/app/api/account/route.ts`
   - `DELETE` 핸들러를 `withErrorBoundary`로 감싼다.
   - 사용자 식별: `getAuthenticatedUserId()`(2-auth). 인증 없으면 401/403 + 의도된 메시지. **클라이언트가 보낸 userId를 신뢰하지 마라** — 서버 세션에서 결정한 uid만 사용한다.
   - 삭제 시퀀스(모두 **user-scoped 클라이언트**, RLS로 자기 행만):
     1. Storage 원본 파일 삭제: 해당 유저의 `uploads.file_path` 목록을 조회해 `removeObjects(paths)`(Step 1)로 비공개 bucket 객체를 지운다. 경로는 `<userId>/...` 소유분만.
     2. DB 행 삭제: `transactions`·`analyses`·`subscriptions`·`uploads`를 삭제한다. FK 의존이 있으면 자식(예: `transactions`)→부모(`uploads`) 순서로. `profiles` 행 자체의 삭제/유지는 인증 계정 삭제(2-auth/Supabase Auth) 정책과 정합하게 정한다.
   - 성공 시 204(또는 200 + 확인 메시지) 반환. 부분 실패 시에도 내부 상세를 노출하지 않고 5xx 일반 문구로 덮되, 어디까지 삭제됐는지는 `console.error`로 남긴다.

2. **핵심 규칙 (CRITICAL)**
   - **자기 데이터만 삭제한다.** 모든 삭제는 user-scoped 클라이언트로 RLS(`user_id = auth.uid()`) 하에 수행한다. 다른 유저 데이터에 절대 접근/삭제하지 마라. 이유: CLAUDE.md·ADR-009 — 크로스테넌트 격리.
   - **Storage 원본 파일도 삭제한다.** DB 행만 지우고 비공개 bucket의 CSV 원본을 남기지 마라. 삭제권은 원본 파일까지 포함한다(ADR-009). 이유: 개인 금융 PII 잔존 방지.
   - **service-role을 쓰지 마라.** 삭제는 user-scoped(RLS)로 충분하다. 이유: service-role은 Polar 웹훅 plan 갱신 전용.
   - **내부 예외를 노출하지 마라.** 5xx는 일반 문구, 상세는 서버 로그로만.

3. **범위**
   - 이 라우트는 데이터·Storage 삭제에 집중한다. Supabase Auth 계정 자체 삭제(Auth admin API)는 2-auth 정책/후속 phase와 정합하게 처리하되, **service-role admin 호출이 필요하면** 그 경계를 명확히 주석으로 남기고 이 step 범위(데이터 삭제) 밖 동작은 최소화한다.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 테스트 최소(서비스/Supabase 목킹, 실네트워크 없음):
  - `DELETE /api/account`가 인증된 uid로 `transactions`·`analyses`·`subscriptions`·`uploads`를 삭제하고 `removeObjects`로 Storage 원본을 지운다.
  - 삭제가 모두 user-scoped(RLS) 경유이며 다른 유저 uid로의 삭제 경로가 없다.
  - 인증 없을 때 401/403로 거부한다.
  - 삭제 중 실패 시 응답이 내부 상세를 노출하지 않는다(일반 문구).

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - `uploads`·`transactions`·`analyses`·`subscriptions` + Storage 원본이 모두 삭제되는가(ADR-009)?
   - 모든 삭제가 user-scoped(RLS)이고 자기 데이터만인가? service-role 미사용인가?
   - 사용자 식별이 서버 세션(`getAuthenticatedUserId`)에서 오고 클라이언트 userId를 불신하는가?
   - 5xx가 일반 문구로 덮이고 상세는 서버 로그만인가?
3. 결과에 따라 `phases/3-data-live/index.json`의 step 4를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "DELETE /api/account 완전삭제·DB+Storage 삭제 시퀀스·격리/에러정책 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- 다른 유저의 데이터·Storage 객체에 접근하거나 삭제하지 마라. 이유: CLAUDE.md·ADR-009 — user-scoped(RLS)로 자기 데이터만.
- Storage 원본 CSV 파일을 남긴 채 DB 행만 삭제하지 마라. 이유: 삭제권은 원본 파일까지 포함한다(ADR-009).
- 클라이언트가 보낸 userId로 삭제 대상을 결정하지 마라. 이유: 서버 세션 uid만 신뢰(타인 데이터 삭제 방지).
- service-role 클라이언트로 데이터 삭제를 수행하지 마라. 이유: RLS 우회 — service-role은 Polar 웹훅 plan 갱신 전용.
- 내부 예외(DB·Storage 원문/스택)를 응답 body로 내보내지 마라. 이유: 정보 노출 방지(의도된 검증/권한 메시지는 예외).
- `DATA_SOURCE` 기본값이나 mock 경로를 바꾸지 마라. 이유: 이 phase는 mock 동작 유지, 컷오버는 6-launch.
- 기존 테스트를 깨뜨리지 마라.
