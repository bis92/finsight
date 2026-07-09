# UI 디자인 가이드

## 디자인 원칙
1. **도구처럼 보여야 한다.** 마케팅 랜딩이 아니라 매일 여는 금융 대시보드. 화려함보다 신뢰·가독성.
2. **숫자가 주인공.** 금액·비율·차트가 먼저 읽히게. 장식은 정보를 가리지 않는다.
3. **Light 서피스 기본.** 금융 데이터는 밝고 명료한 배경에서 신뢰감을 준다. (다크모드는 출시 후 옵션)

## AI 슬롭 안티패턴 — 하지 마라
| 금지 사항 | 이유 |
|-----------|------|
| backdrop-filter: blur() (glass morphism) | AI 템플릿의 가장 흔한 징후 |
| gradient-text (배경 그라데이션 텍스트) | AI SaaS 랜딩의 1번 특징 |
| "Powered by AI" 배지 | 장식일 뿐 사용자 가치 없음 |
| box-shadow 글로우/네온 애니메이션 | AI 슬롭 |
| 보라/인디고 브랜드 색상 | "AI=보라색" 클리셰 |
| 모든 카드에 동일한 rounded-2xl | 템플릿 느낌 |
| 배경 gradient orb (blur-3xl 원형) | 모든 AI 랜딩의 장식 |

## 색상 (Light)
### 배경
| 용도 | 값 |
|------|------|
| 페이지 | #ffffff |
| 서피스/카드 | #ffffff (border로 구분) |
| 미묘한 강조면 | #f6f7f8 |

### 텍스트
| 용도 | 값 |
|------|------|
| 주 텍스트 | text-neutral-900 |
| 본문 | text-neutral-700 |
| 보조 | text-neutral-500 |
| 비활성 | text-neutral-400 |

### 데이터/시맨틱 색상
| 용도 | 값 |
|------|------|
| 수입/긍정/절감 | #15803d (green-700) |
| 지출/부정/경고 | #b91c1c (red-700) |
| 액센트(인터랙션·링크·CTA) | #0f766e (teal-700) — 보라 금지 |
| 중립/기본 | #737373 (neutral-500) |
| 보더 | #e5e5e5 (neutral-200) |

차트 카테고리 색은 위 시맨틱과 충돌하지 않는 채도 낮은 팔레트를 쓰고, 인접 조각은 명도로 구분한다.

## 컴포넌트
### 카드
```
rounded-lg bg-white border border-neutral-200 p-6
```
### 버튼
```
Primary: rounded-lg bg-teal-700 text-white hover:bg-teal-800 px-4 py-2 text-sm font-medium
Secondary: rounded-lg border border-neutral-300 text-neutral-800 hover:bg-neutral-50
Text: text-neutral-500 hover:text-neutral-800
```
### 입력 필드
```
rounded-lg bg-white border border-neutral-300 px-4 py-2.5 focus:border-teal-600 focus:ring-1 focus:ring-teal-600
```

## 레이아웃
- 대시보드 전체 너비: max-w-6xl, 랜딩 섹션: max-w-5xl
- 좌측 정렬 기본. 데이터/폼 중앙 정렬 금지(히어로 카피 정도만 예외).
- 간격: gap-3~4, 섹션 간 space-y-8

## 타이포그래피
| 용도 | 스타일 |
|------|--------|
| 페이지 제목 | text-2xl font-semibold text-neutral-900 |
| 카드 제목 | text-sm font-medium text-neutral-500 |
| 금액(강조 숫자) | text-2xl font-semibold tabular-nums |
| 본문 | text-sm text-neutral-700 leading-relaxed |

- 숫자는 `tabular-nums`로 자릿수 정렬. 금액은 천단위 구분.

## 상세 표출 (사용자 전역 규약 준수)
- 거래/분석 **읽기 전용 상세 → SideView(우측 Drawer/Collapse)**. 리스트 컨텍스트 유지.
- 입력/수정/생성 → **Modal**. SideView에서 인라인 편집 금지.

## 애니메이션
- 허용: fade-in(0.2~0.3s), 컨텐츠 slide-up(0.3s). 그 외 금지.

## 아이콘
- SVG 인라인, strokeWidth 1.5. 아이콘을 둥근 배경 박스로 감싸지 않는다.
