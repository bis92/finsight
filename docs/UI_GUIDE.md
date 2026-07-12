# UI 디자인 가이드

> 이 가이드는 `PRD.md`·`ARCHITECTURE.md`·`ADR.md`와 함께 계획의 단일 원천이다. **Light 서피스 기본**(다크모드는 출시 후).

## 디자인 원칙

1. **한국어 우선** — 모든 UI 카피·레이블·에러 문구·날짜·통화는 한국어/원화(₩)/KST 기준. 금액은 천단위 콤마 + `원`(또는 `₩`) 표기, 날짜는 `YYYY.MM.DD`(KST). 영어 혼용은 최소화하고, 불가피한 기술 용어만 원문 유지.
2. **도구처럼 보인다** — 마케팅 페이지가 아니라 매일 여는 금융 대시보드. 신뢰·가독성이 최우선.
3. **숫자가 주인공** — 금액·비율·차트를 먼저 보여준다. Pro 지출 진단 리포트의 서술형 텍스트는 숫자를 보조한다.
4. **Light 서피스 기본** — 흰 배경 + border로 구분. 다크모드는 로드맵.

## AI 슬롭 안티패턴 — 하지 마라

| 금지 사항 | 이유 |
|-----------|------|
| backdrop-filter: blur() (glass morphism) | AI 템플릿의 가장 흔한 징후 |
| gradient-text (배경 그라데이션 텍스트) | AI가 만든 SaaS 랜딩의 1번 특징 |
| "Powered by AI" 배지 | 기능이 아니라 장식. 사용자에게 가치 없음 |
| box-shadow 글로우/네온 애니메이션 | AI 슬롭 |
| **보라/인디고 브랜드 색상** | "AI = 보라색" 클리셰. 액센트는 teal |
| 모든 카드에 동일한 rounded-2xl | 균일한 둥근 모서리는 템플릿 느낌 |
| 배경 gradient orb (blur-3xl 원형) | 모든 AI 랜딩에 있는 장식 |
| 데이터/폼 중앙 정렬 | 좌측 정렬이 기본 |

## 색상 (Light)

### 배경
| 용도 | 값 |
|------|------|
| 페이지 / 카드 | `#ffffff` (border로 구분) |
| 강조면 | `#f6f7f8` |

### 텍스트
| 용도 | 값 |
|------|------|
| 주 텍스트 | `text-neutral-900` |
| 본문 | `text-neutral-700` |
| 보조 | `text-neutral-500` |
| 비활성 | `text-neutral-400` |

### 데이터/시맨틱 색상
| 용도 | 값 |
|------|------|
| 수입·절감 | `green-700 #15803d` |
| 지출·경고 | `red-700 #b91c1c` |
| 액센트(링크·CTA) | `teal-700 #0f766e` (**보라 금지**) |
| 보더 | `neutral-200` |

- 차트는 채도 낮은 팔레트, 인접 조각은 명도로 구분.

## 컴포넌트

### 카드
```
rounded-lg bg-white border border-neutral-200 p-6
```

### 버튼
```
Primary:   bg-teal-700 text-white
Secondary: border
Text:      (텍스트 버튼)
```

### 입력 필드
```
border-neutral-300 focus:border-teal-600
```

### 매핑 확인 UI
- 감지된 컬럼을 표로 보여주고, 각 행에 "날짜/가맹점/금액/카테고리" 드롭다운. 잘못 매핑된 건 사용자가 바로 바꾼다.
- `confidence < 0.75` 또는 필수 컬럼 누락 시 자동 확정하지 말고 수동 매핑 스텝으로 유도(ARCHITECTURE 시임 인터페이스 참조).

## 상세 표출 (전역 규약)

- 읽기전용 상세 → **SideView**(우측 Drawer/Collapse). SideView 인라인 편집 금지.
- 입력/수정/생성 → **Modal**. (예: 오분류 재분류는 category enum 선택 Modal)

## 레이아웃

- 전체 너비: 대시보드 `max-w-6xl`, 랜딩 `max-w-5xl`.
- 정렬: 좌측 정렬 기본. 데이터/폼 중앙 정렬 금지.

## 타이포그래피

| 용도 | 스타일 |
|------|--------|
| 페이지 제목 | `text-2xl font-semibold` |
| 카드 제목 | `text-sm text-neutral-500` |
| 금액 | `text-2xl font-semibold tabular-nums` (천단위 구분) |
| 본문 | `text-sm text-neutral-700` |

## 애니메이션

- fade-in (0.2~0.3s), slide-up (0.3s)만 허용.
- 그 외 모든 애니메이션 금지.

## 아이콘

- SVG 인라인, strokeWidth 1.5.
- 둥근 배경 박스로 감싸지 않는다.

## 출력 신뢰경계 (보안)

- LLM 출력(매핑·인사이트)은 **평문 렌더**. 마크다운/HTML 렌더 금지, `dangerouslySetInnerHTML` 금지. React 기본 이스케이프 유지.
- 페이월은 **데이터 레벨 차단**(CSS 블러 아님).
- 에러 표시는 서버 응답 `message` 그대로. 상태코드→한글 치환 테이블 금지.
