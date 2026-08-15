# Lighthouse Autoresearch Loop — 2026-08-15

대상: 랜딩 `/` (로컬 프로덕션 빌드, 3회 median)
종료 조건: Performance ≥ 95 / 3회 정체 / 15 iteration

## Baseline (iteration 0)

| 지표 | 값 |
|------|-----|
| Performance | 61 |
| Accessibility | 96 |
| Best Practices | 100 |
| SEO | 100 |
| LCP | 6789 ms |
| TBT | 0 ms |
| CLS | 0 |
| FCP | 6189 ms |
| Speed Index | 6189 ms |

Opportunities: `unused-javascript` (~150ms)

관찰: TBT 0·CLS 0으로 인터랙션/레이아웃은 양호하나 **FCP·LCP가 ~6.2–6.8s로 과도하게 높음** →
초기 렌더 차단(폰트/CSS)·hero 렌더 지연이 Performance 병목으로 추정.

## Iterations

### Iteration 1 — 렌더 차단 폰트 체인 제거 → **revert**

**시도한 최적화**: `globals.css`의 render-blocking 폰트 `@import` 체인(Inter·JetBrains Mono·Pretendard CDN)을 제거하고 `next/font`(google + local self-host)로 전환.

**측정 델타** (baseline → iter1):

| 지표 | baseline | iter1 | 판정 |
|------|------|------|------|
| Performance | 61 | 75~77 | +14~16 (improved) |
| Accessibility | 96 | 96 | — |
| Best Practices | 100 | 96→(수정 후)100 | 회귀 발생 후 해소 |
| SEO | 100 | 100 | — |
| FCP | 6189ms | **912ms** | 대폭 개선 |
| LCP | 6789ms | **14558~19209ms** | **악화** |

**진행 경과**:
1. 1차 변경 후 BP 100→96 회귀. 원인 = `errors-in-console`: **React #418 하이드레이션 불일치**
   (`<head>`에 유효하지 않은 `<div dangerouslySetInnerHTML>` 주입). → `isRegression` 가드가 잡음.
2. Pretendard를 `next/font/local` self-host로 전환해 하이드레이션 버그 해소, BP 100 복구.
3. 그러나 **LCP가 14.5~19.2s로 악화**. Performance 총점은 75(LCP 25% 가중이 0점이어도 TBT·CLS·FCP·SI 만점이라 0.75).
4. LCP 진단: **가장 느린 네트워크 요청 47ms, 폰트 16~20ms** — 네트워크/폰트 원인 아님.
   `largest-contentful-paint-element` audit **MISSING** → hero의 largest paint가 늦게 확정되는
   **렌더링 아티팩트**(HeroAnalysis 클라이언트 애니메이션 유력). FCP를 0.9s로 당기니 기존에 가려졌던
   late-LCP가 드러남. `display: optional` + weight 축소로도 14.5s로만 내려가 폰트 문제 아님을 재확인.

**결정: revert**. FCP 6.2s→0.9s 이득은 크지만 LCP 아티팩트가 미해결이라 known-good 상태로 되돌림.
후속 iteration에서 hero late-LCP를 먼저 진단·해소한 뒤 폰트 최적화를 재적용하는 순서가 맞다.

### 루프 로직 개선점 (이번 검증에서 발견)

`isRegression`이 **카테고리 점수만** 보고 개별 코어 웹 바이탈(LCP/CLS/TBT)은 안 봐서,
Performance 총점이 오르면 LCP가 무너져도 keep으로 판정될 뻔했다.
→ `decision.ts`에 **코어 지표 회귀 가드**(예: LCP가 baseline 대비 20% 이상 악화 시 regression) 추가 필요.
