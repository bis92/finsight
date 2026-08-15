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

<!-- iteration별 기록 추가 -->
