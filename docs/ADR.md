# Architecture Decision Records

> 계획의 단일 원천은 `plan.md`다. 상충 시 plan.md가 우선한다.

## 철학

개인 금융 PII를 다루는 B2C SaaS. **보안·데이터 무결성을 최우선**으로 하되, mock-first 시임으로 UI를 먼저 완성하고 실연동은 repository 교체로 처리해 UI 코드를 불변으로 유지한다. LLM은 얇게 추상화하고 비용을 구조적으로 통제한다.

---

### ADR-001: Next.js 15 (App Router) 풀스택 + Vercel 배포
**결정**: Next.js 15 App Router로 페이지 + Route Handler를 한 코드베이스에서, Vercel에 `vercel` CLI로 자동 배포.
**이유**: 프론트/백엔드 단일 스택으로 MVP 속도 확보. 외부 API 호출을 서버(Route Handler)에 가둬 시크릿·비용을 통제. Vercel은 Next.js 1급 지원.
**트레이드오프**: 서버리스 콜드스타트·벤더 락인. 무거운 백그라운드 작업엔 부적합(현재 범위엔 문제 없음).

### ADR-002: Supabase (Auth + Postgres + Storage, RLS)
**결정**: 인증·DB·스토리지를 Supabase로 통합. 모든 테이블 RLS `user_id = auth.uid()`.
**이유**: 세 가지를 한 곳에서 + RLS로 크로스테넌트 격리를 DB 레벨에서 강제. 이메일 + 구글 소셜 로그인.
**트레이드오프**: 벤더 종속. service-role 키 오남용 시 RLS 우회 위험 → **service-role은 Polar 웹훅 plan 갱신에만** 사용으로 제한.

### ADR-003: Claude API (`claude-opus-4-8`), 얇은 추상화
**결정**: LLM은 Claude API(`@anthropic-ai/sdk`), 모델 `claude-opus-4-8`(Opus 4.8) 고정. `LlmService` 인터페이스로 얇게 추상화. 어댑티브 씽킹(`thinking:{type:"adaptive"}`), effort는 작업별 차등, 구조화 출력은 `output_config.format`.
**이유**: 컬럼 매핑·심화 인사이트에 고품질 추론 필요. 얇은 추상화로 mock/live 교체와 프롬프트 격리.
**트레이드오프**: 단가 $5/$25 per 1M(Sonnet의 ~1.67배) → 비용 통제책(ADR-005)이 필수 전제. `budget_tokens`·`temperature`·마지막 assistant 프리필은 400(사용 금지).

### ADR-004: Polar (Merchant of Record, 구독)
**결정**: 구독 결제는 Polar(MoR). 권한의 유일한 진실 원천은 웹훅으로 갱신된 `profiles.plan`.
**이유**: MoR가 부가세·인보이스를 대행. 웹훅 단일 경로로 plan을 갱신해 셀프 업그레이드 차단.
**트레이드오프**: 결제 프로바이더 종속. 웹훅 순서 뒤섞임 대응은 MVP 밖(단순 멱등만).

### ADR-005: 거래 분류는 규칙 기반 + 배치 (LLM 비용 통제)
**결정**: CSV 전체 행을 LLM에 넣지 않는다. 컬럼 매핑만 샘플 ≤20행을 LLM에, 실제 거래 분류는 규칙 기반 + (필요시 소량) 배치.
**이유**: 수백~수천 행을 매 업로드마다 LLM에 넣으면 비용·지연이 폭증. LLM 호출은 기본 경로 3회 이하로 상한.
**트레이드오프**: 규칙 기반 분류의 정확도 한계 → 재분류 Modal(category enum)로 사용자 보정.

### ADR-006: 과금 = 기능 깊이로 가름 (횟수 제한 아님)
**결정**: Free(사실 조회)/Pro(해석·코칭)를 기능 깊이로 구분. Pro 앵커는 심화 인사이트 + 정기구독 후보 탐지.
**이유**: 명세서는 월 1회라 횟수 제한이 무의미. Free=집계(LLM 가벼움), Pro=추론(LLM 무거움)이라 매출이 LLM 비용을 커버.
**트레이드오프**: Free만으로도 상당한 가치 제공 → 전환 설득이 페이월 UX에 달림.

### ADR-007: mock-first 시임 (`DATA_SOURCE` 스위치)
**결정**: mock 데이터는 `/api/*` 뒤 repository(`services/`)에만. `DATA_SOURCE=mock|live` 서버 env로 전환. UI/queries는 phase 0에서도 실제 `/api`를 호출.
**이유**: UI를 먼저 완성하고 실연동 시 repository 구현만 교체해 UI 코드 불변. mock 상태로 먼저 배포해 핵심 루프를 조기 검증.
**트레이드오프**: mock/real 반환 타입을 완전히 동일하게 유지하는 규율 필요. 스텁 인증이 공개 mock 배포에 노출되므로 `DATA_SOURCE` 기준 가드로 live에서 fail-closed.
