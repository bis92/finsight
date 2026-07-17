# Step 6: data-layer

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (데이터 페칭 단일 경로 · apiClient/ApiError · API 에러 message 그대로 노출)
- `/docs/ARCHITECTURE.md` (데이터 흐름 · queries/<domain> + react-query 단일 경로 · 로딩/에러/빈 상태 표준화)
- `/docs/UI_GUIDE.md` (출력 신뢰경계 · 에러는 서버 message 그대로)
- Step 0: `src/app/providers.tsx` (QueryClientProvider)
- Step 1: `src/types/`
- Step 5: `src/app/api/` (라우트 경로·응답 형태)

이전 step의 API 라우트 계약을 꼼꼼히 읽고, 각 훅이 어떤 엔드포인트를 호출하는지 매핑한 뒤 작업하라.

## 작업

클라이언트 데이터 페칭의 **단일 경로**를 만든다: `컴포넌트 → queries/<domain> (react-query) → apiClient/ApiError → /api/*`.

1. **공용 apiClient** — `src/lib/apiClient.ts`
   - `fetch` 래퍼. JSON 요청/응답, 상대경로 `/api/*` 호출.
   - `ApiError` 클래스: `{ status: number; message: string }`. 응답이 실패면 **서버 응답 `message`를 그대로** 담아 throw.
     - CRITICAL: 상태코드→한글 치환 테이블을 만들지 마라. 서버 `message`를 그대로 노출한다. 이유: CLAUDE.md·UI_GUIDE 전역 규약.
   - 시그니처 예: `apiClient.get<T>(path)`, `apiClient.post<T>(path, body)`, `apiClient.patch<T>(path, body)`.

2. **도메인별 react-query 훅** — `src/queries/<domain>/`
   - 도메인: `transactions`, `insights`, `uploads`(매핑 요청·업로드 확정), `profile`, `analyses`(pro-report).
   - 예: `useTransactions(range)`, `useReclassify()`(mutation), `useMappingPreview()`(mutation, POST mapping), `useUpload()`(mutation), `useInsights(period)`, `useProfile()`, `useProReport()`.
   - 모두 `apiClient` 경유. queryKey는 도메인+파라미터로 일관되게. mutation 성공 시 관련 query invalidate.
   - CRITICAL: 훅/컴포넌트에서 `services/`나 외부 SDK를 직접 import하지 마라. 반드시 `/api/*`를 apiClient로 호출. 이유: mock-first 시임 — phase 1에 UI 불변.
   - 로딩/에러/빈 상태를 이 레이어에서 표준 처리(공통 타입·헬퍼). 컴포넌트가 매번 재구현하지 않도록.

3. **mock 금지 재확인** — queries에는 어떤 mock 데이터도 두지 않는다(항상 실제 `/api` 호출). 이유: ARCHITECTURE mock-first.

## Acceptance Criteria

```bash
npm run build
npm test        # apiClient(ApiError 매핑) 단위 테스트 통과
```

- 테스트 최소: `apiClient`가 실패 응답의 서버 `message`를 그대로 `ApiError.message`에 담는지, 성공 시 파싱된 JSON 반환하는지(fetch mock).

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 모든 훅이 apiClient/`/api/*` 단일 경로를 지나는가?
   - queries/컴포넌트에 mock·직접 services import가 없는가?
   - ApiError가 서버 message를 그대로 노출하는가(상태코드 치환 테이블 없음)?
3. 결과에 따라 `phases/0-mvp/index.json`의 step 6을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "apiClient + 도메인 훅 목록 요약"`
   - 수정 3회 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 중단

## 금지사항

- queries/컴포넌트에서 `services/`·외부 SDK를 직접 import하지 마라. 이유: 단일 경로·시임 불변.
- 상태코드→한글 치환 테이블을 만들지 마라. 서버 message 그대로. 이유: 전역 규약.
- queries에 mock 데이터를 넣지 마라. 이유: mock은 services 뒤에만.
- 기존 테스트를 깨뜨리지 마라.
