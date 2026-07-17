# Step 1: uploads-storage-live

## 읽어야 할 파일

먼저 아래 파일들을 읽고 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (외부 API·시크릿 server-only · 업로드 CSV는 비공개 Storage + signed URL · RLS user-scoped 접근 · mock은 services 뒤에만)
- `/docs/ARCHITECTURE.md` ("보안" 절 — 비공개 Storage·파일은 서명 URL로만 접근 · "데이터 모델" 절 `uploads` 컬럼: `file_path`·`original_name`·`status`·`error_message`)
- `/docs/ADR.md` (ADR-009 비공개 Storage·완전삭제, ADR-002 Supabase Storage)
- `/src/services/mock/uploads.ts` (mock 구현 — 반환 타입·행위 계약. live는 **완전히 동일한 반환 타입**이어야 한다)
- `/src/services/index.ts` (`getUploadsService` 팩토리 — 여기에 live 분기를 추가한다)
- `/src/types/upload.ts` (`Upload`·`UploadStatus` 계약)
- Step 0 산출물: `/src/services/live/transactions.ts` (live 서비스 파일 배치·`server-only`·매핑 패턴 참고)
- `1-supabase` 산출물: `/src/lib/supabase/server-client.ts` (user-scoped 클라이언트), `/supabase/migrations/` (기존 마이그레이션 네이밍 규칙 `000N_*.sql` 참고), `/src/types/database.ts`

이전 코드를 꼼꼼히 읽고 Storage 보안 모델을 이해한 뒤 작업하라.

## 배경

phase 3는 mock을 유지한 채 live 구현만 추가한다(컷오버는 6-launch). 이 step은 업로드 원본 CSV를 담을 **비공개 Storage bucket**과 그 서명 URL 헬퍼, 그리고 `uploads` 테이블을 읽고 쓰는 live 서비스를 만든다. 원본 CSV는 개인 금융 PII이므로 공개되면 안 된다(ADR-009).

## 작업

**TDD 필수** — Storage 헬퍼·uploads 서비스는 Supabase 클라이언트를 목킹한 단위 테스트를 먼저 작성한다. 실네트워크 금지. SQL 마이그레이션은 코드 로직이 아니라 선언이므로 TDD 대상은 아니되, 정책 내용은 아래 규칙을 정확히 따른다.

1. **비공개 bucket 마이그레이션** — `supabase/migrations/0004_storage.sql`
   - `'uploads'` 이름의 **비공개(public=false)** Storage bucket을 생성한다(`storage.buckets`에 insert, 멱등하게 — 이미 있으면 무시).
   - 이 bucket에 대한 RLS 정책(`storage.objects`)을 정의한다: **각 유저는 자기 소유 경로의 객체만** select/insert/delete 할 수 있다. 소유 판별은 객체 경로 첫 세그먼트가 `auth.uid()`와 일치하는 규칙으로 한다(예: 경로 `"{auth.uid()}/..."`). 즉 파일 경로 컨벤션은 **`<userId>/<uploadId 또는 파일명>`**.
   - CRITICAL: bucket을 **공개로 만들지 마라**. public URL을 활성화하지 마라. 이유: 개인 금융 PII 노출(ADR-009).
   - 기존 마이그레이션(`0001`~`0003`)을 수정하지 마라. 새 파일만 추가한다.

2. **Storage 서명 URL 헬퍼** — `src/lib/supabase/storage.ts`
   - 파일 상단에 `import 'server-only'`. 서버 전용.
   - 업로드/다운로드를 **서명 URL로만** 다루는 헬퍼 함수를 둔다. 시그니처(핵심 개념 수준):
     ```ts
     const UPLOADS_BUCKET = 'uploads'
     function uploadObjectPath(userId: string, uploadId: string, originalName: string): string  // `<userId>/<uploadId>-<sanitized name>`
     async function createSignedUploadUrl(userId: string, path: string): Promise<{ signedUrl: string; token: string; path: string }>
     async function createSignedDownloadUrl(path: string, expiresInSeconds?: number): Promise<{ signedUrl: string }>
     async function removeObjects(paths: string[]): Promise<void>  // Storage 원본 삭제 (step4 account-deletion에서 재사용)
     ```
   - 모든 Storage 접근은 **user-scoped 클라이언트의 `.storage`**를 경유한다(RLS로 소유 격리). 경로는 항상 `<userId>/...`로 시작하게 강제한다.
   - `removeObjects`는 step4(계정 완전삭제)에서 재사용된다 — 여기서 만들어 둔다.

3. **uploads live 서비스** — `src/services/live/uploads.ts`
   - `import 'server-only'`. mock(`listMockUploadsByUser`)과 **완전히 동일한 반환 타입**(`Upload[]`)을 지켜, 그 외에 create/status 함수를 둔다. 최소:
     ```ts
     async function listUploadsByUser(userId: string): Promise<Upload[]>                        // uploads 조회, DB행→Upload 매핑
     async function createUpload(userId: string, originalName: string, filePath: string): Promise<Upload>   // status='parsing'으로 insert
     async function setUploadStatus(userId: string, uploadId: string, status: UploadStatus, errorMessage?: string | null): Promise<Upload>  // 상태 전이
     ```
   - 모든 DB 접근은 user-scoped 클라이언트 경유(RLS). `file_path`↔`filePath`, `original_name`↔`originalName`, `error_message`↔`errorMessage` 매핑.
   - mock 함수 이름/시그니처와 **팩토리에서 교체 가능하도록** 정렬한다(list 반환 타입 동일 필수).

4. **팩토리 live 분기 추가** — `src/services/index.ts`
   - `getUploadsService()`가 `getDataSource() === 'live'`일 때 live uploads 서비스(list 함수 또는 서비스 묶음)를 반환하도록 분기 추가.
   - CRITICAL: mock 반환 타입과 완전히 동일해야 한다(ADR-008). 다른 팩토리(`profile`/`llm`)와 `DATA_SOURCE` 기본값은 건드리지 마라.

## Acceptance Criteria

```bash
npm run build
npm test
```

- 테스트 최소(Supabase 클라이언트 목킹, 실네트워크 없음):
  - `uploadObjectPath`가 `<userId>/`로 시작하는 경로를 만들고 파일명을 안전하게 정규화한다.
  - `createSignedUploadUrl`/`createSignedDownloadUrl`이 목킹된 `.storage`의 서명 URL API를 호출하고 결과를 반환한다.
  - `listUploadsByUser`가 DB 행을 `Upload`로 매핑, `createUpload`가 `status='parsing'`으로 insert, `setUploadStatus`가 상태를 전이한다.
  - live `listUploadsByUser` 반환이 mock `listMockUploadsByUser`와 동일한 `Upload[]` 형태다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - bucket이 **비공개**(public=false)이고 public URL이 없는가?
   - Storage 접근이 **서명 URL로만** 이뤄지고 경로가 `<userId>/...`로 소유 격리되는가?
   - Storage·DB 접근이 user-scoped 클라이언트(RLS) 경유인가? service-role 미사용인가?
   - `getUploadsService`만 live 분기가 추가되고 다른 팩토리·`DATA_SOURCE` 기본값은 불변인가?
3. 결과에 따라 `phases/3-data-live/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "비공개 bucket 마이그레이션·서명URL 헬퍼·live uploads 서비스·팩토리 분기 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message": "구체적 에러"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "사유"` 후 중단

## 금지사항

- Storage bucket을 공개로 만들거나 public URL을 활성화하지 마라. 이유: CLAUDE.md·ADR-009 — 개인 금융 PII는 비공개 Storage + 서명 URL로만 접근한다.
- service-role 클라이언트로 Storage/DB에 접근하지 마라. 이유: RLS 우회 — service-role은 Polar 웹훅 plan 갱신에만.
- 객체 경로를 `<userId>/` 접두 없이 만들지 마라. 이유: 소유 격리 정책이 첫 세그먼트로 `auth.uid()`를 검사한다.
- 기존 마이그레이션(`0001`~`0003`)이나 다른 팩토리(`profile`/`llm`)·`DATA_SOURCE` 기본값을 수정하지 마라. 이유: 이 phase는 mock 동작 유지, 각 조각은 별도 step scope.
- mock uploads 서비스를 수정하지 마라. 이유: mock 동작은 phase 내내 유지된다.
- 실제 Supabase 네트워크 호출을 테스트에 넣지 마라. 이유: 클라이언트 목킹 단위 테스트로 검증한다.
- 기존 테스트를 깨뜨리지 마라.
