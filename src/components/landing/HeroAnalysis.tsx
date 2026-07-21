import { Amount, Badge } from '@/components/ui'

/**
 * HeroAnalysis — 마케팅 랜딩 히어로 우측(다크 섹션)에 들어가는 자기완결형
 * "라이브 분석" 인포그래픽. 순수 인라인 SVG + CSS @keyframes 로만 로드 시 1회 재생된다.
 *
 * - 'use client' 없음 (서버 컴포넌트). 애니메이션 라이브러리·외부 이미지 없음.
 * - 모든 @keyframes/애니메이션 CSS 는 아래 단일 <style> 요소에만 두고,
 *   전역 충돌을 막기 위해 'ha-' 클래스 접두사를 사용한다.
 * - prefers-reduced-motion: reduce 에서는 모든 transform/keyframes 를 끄고
 *   최종 조립 상태(불투명·아크 완주·바 full)를 즉시 표시한다.
 * - 장식용 SVG 는 aria-hidden. 숫자·라벨·진단 문장은 애니메이션과 무관하게
 *   항상 DOM 에 존재해 스크린리더가 읽을 수 있다.
 */

// 도넛 아크 기하: 반지름 54, 원주 = 2π·54 ≈ 339.292
const R = 54
const CIRC = 2 * Math.PI * R // ≈ 339.292

type Slice = {
  label: string
  pct: number
  color: string
}

// 합계 100%. draw-on 순서대로 누적 오프셋을 계산한다.
const SLICES: readonly Slice[] = [
  { label: '식비', pct: 43, color: '#0052ff' },
  { label: '쇼핑', pct: 18, color: '#0a2a8f' },
  { label: '카페/간식', pct: 15, color: '#d1ddff' },
  { label: '구독', pct: 14, color: '#5185ff' },
  { label: '기타', pct: 10, color: '#aeb8cc' },
]

// 원본 CSV 를 상징하는 지저분한 모노스페이스 라인들(값은 임의).
const CSV_LINES: readonly string[] = [
  '2026-06-03  스타벅스 강남      6,300',
  '2026-06-07  쿠팡 로켓와우     34,900',
  '2026-06-12  배달의민족       21,500',
  '2026-06-19  넷플릭스 구독      13,500',
]

// 성장하는 카테고리 바(도넛과 동일 데이터).
const BARS = SLICES

export function HeroAnalysis() {
  // 누적 비율 → 각 아크의 dash 시작 회전각과 draw 길이를 계산.
  let cumulative = 0
  const arcs = SLICES.map((slice, i) => {
    const dash = (slice.pct / 100) * CIRC
    const rotation = (cumulative / 100) * 360 - 90 // 12시 방향에서 시작
    cumulative += slice.pct
    return { ...slice, dash, gap: CIRC - dash, rotation, index: i }
  })

  return (
    <div
      className="ha-root relative min-h-[380px] overflow-hidden rounded-xl border border-white/10 bg-surface-dark-elevated p-xl shadow-[0_24px_60px_rgba(0,0,0,.45)]"
      role="figure"
      aria-label="CSV 소비 데이터를 카테고리별 지출과 AI 진단으로 분석한 결과"
    >
      <style>{HA_STYLES}</style>

      {/* 1) 원본 CSV 라인 — fade+slide 로 먼저 등장 */}
      <div className="ha-csv" aria-hidden="true">
        {CSV_LINES.map((line, i) => (
          <div
            key={line}
            className="ha-csv-line font-mono text-[10px] leading-5 text-on-dark-soft/80"
            style={{ animationDelay: `${0.1 + i * 0.12}s` }}
          >
            {line}
          </div>
        ))}
      </div>

      {/* 2) 도넛 차트 + 3) 카테고리 바 */}
      <div className="ha-analysis mt-md flex items-center gap-lg">
        <div className="ha-donut relative shrink-0">
          <svg width={128} height={128} viewBox="0 0 128 128" aria-hidden="true">
            {/* 트랙 */}
            <circle
              cx={64}
              cy={64}
              r={R}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={14}
            />
            {arcs.map((arc) => (
              <circle
                key={arc.label}
                className="ha-arc"
                cx={64}
                cy={64}
                r={R}
                fill="none"
                stroke={arc.color}
                strokeWidth={14}
                strokeLinecap="butt"
                strokeDasharray={`${arc.dash} ${arc.gap}`}
                strokeDashoffset={arc.dash}
                transform={`rotate(${arc.rotation} 64 64)`}
                style={
                  {
                    '--ha-dash': `${arc.dash}`,
                    animationDelay: `${1.05 + arc.index * 0.16}s`,
                  } as React.CSSProperties
                }
              />
            ))}
          </svg>
          {/* 가운데 라벨 — 최상위 카테고리. 항상 DOM 에 존재. */}
          <div className="ha-donut-center absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-caption text-on-dark-soft">식비</span>
            <span className="font-mono text-title-md font-number tabular-nums text-on-dark">43%</span>
          </div>
        </div>

        <ul className="ha-bars flex-1 space-y-sm" aria-label="카테고리별 지출 비중">
          {BARS.map((bar, i) => (
            <li key={bar.label} className="ha-bar-row">
              <div className="flex items-center justify-between text-caption text-on-dark-soft">
                <span>{bar.label}</span>
                <span className="font-mono tabular-nums text-on-dark">{bar.pct}%</span>
              </div>
              <div className="mt-xxs h-1.5 overflow-hidden rounded-pill bg-white/10">
                <div
                  className="ha-bar-fill h-full rounded-pill"
                  style={
                    {
                      '--ha-bar-w': `${bar.pct}%`,
                      backgroundColor: bar.color,
                      animationDelay: `${1.4 + i * 0.1}s`,
                    } as React.CSSProperties
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* 4) 총지출 — clip/blur-in 리빌 */}
      <div className="ha-total mt-lg">
        <p className="text-caption text-on-dark-soft">2026년 6월 총지출</p>
        <Amount value={1847620} direction="expense" className="mt-xxs block text-[28px] text-on-dark" />
      </div>

      {/* 5) AI 진단 카드 */}
      <div className="ha-diag mt-lg rounded-xl border border-white/10 bg-surface-dark p-md">
        <div className="flex items-center justify-between">
          <p className="text-caption text-on-dark-soft">지출 진단</p>
          <Badge variant="pro">OPUS 4.8</Badge>
        </div>

        {/* 생각 중 점 — 진단 문장이 나타나기 전까지 표시(장식) */}
        <div className="ha-thinking mt-sm flex items-center gap-1" aria-hidden="true">
          <span className="ha-dot h-1.5 w-1.5 rounded-full bg-on-dark-soft/70" style={{ animationDelay: '0s' }} />
          <span className="ha-dot h-1.5 w-1.5 rounded-full bg-on-dark-soft/70" style={{ animationDelay: '0.2s' }} />
          <span className="ha-dot h-1.5 w-1.5 rounded-full bg-on-dark-soft/70" style={{ animationDelay: '0.4s' }} />
        </div>

        {/* 진단 문장 — 타이핑되듯 리빌. 텍스트는 항상 DOM 에 존재. */}
        <p className="ha-diag-title mt-sm text-body-md font-title-md text-on-dark">
          고정비보다 변동비를 먼저 살펴보세요.
        </p>
        <p className="ha-diag-sub mt-xxs text-body-sm leading-6 text-on-dark-soft">
          반복되는 배달·쇼핑 지출에서 조정 가능한 항목이 보여요.
        </p>
      </div>
    </div>
  )
}

export default HeroAnalysis

// ---------------------------------------------------------------------------
// 컴포넌트 스코프 애니메이션 CSS. 모든 셀렉터는 'ha-' 접두사로 격리.
// reduced-motion 에서는 전 요소를 최종 조립 상태로 즉시 고정한다.
// ---------------------------------------------------------------------------
const HA_STYLES = `
.ha-root { -webkit-font-smoothing: antialiased; }

@keyframes ha-fade-slide {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes ha-fade-up {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes ha-draw {
  from { stroke-dashoffset: var(--ha-dash); }
  to   { stroke-dashoffset: 0; }
}
@keyframes ha-grow {
  from { width: 0%; }
  to   { width: var(--ha-bar-w); }
}
@keyframes ha-blur-in {
  from { opacity: 0; filter: blur(8px); clip-path: inset(0 100% 0 0); }
  to   { opacity: 1; filter: blur(0); clip-path: inset(0 0 0 0); }
}
@keyframes ha-type-in {
  from { opacity: 0; clip-path: inset(0 100% 0 0); }
  to   { opacity: 1; clip-path: inset(0 0 0 0); }
}
@keyframes ha-dot-pulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
  40%           { opacity: 1;   transform: scale(1); }
}

/* 1) CSV 라인 */
.ha-csv-line {
  opacity: 0;
  animation: ha-fade-slide 0.5s ease-out forwards;
}

/* 2) 도넛 아크 draw-on */
.ha-arc {
  animation: ha-draw 0.7s ease-out forwards;
}
.ha-donut-center {
  opacity: 0;
  animation: ha-fade-slide 0.5s ease-out 1.9s forwards;
}

/* 3) 카테고리 바 성장 */
.ha-bar-fill {
  width: 0%;
  animation: ha-grow 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

/* 4) 총지출 리빌 */
.ha-total {
  opacity: 0;
  animation: ha-blur-in 0.6s ease-out 2.2s forwards;
}

/* 5) AI 진단 카드 */
.ha-diag {
  opacity: 0;
  animation: ha-fade-up 0.5s ease-out 2.5s forwards;
}
.ha-thinking {
  opacity: 0;
  animation: ha-fade-slide 0.4s ease-out 2.7s forwards;
}
.ha-dot {
  animation: ha-dot-pulse 1.2s ease-in-out infinite;
}
.ha-diag-title {
  opacity: 0;
  animation: ha-type-in 0.6s steps(24, end) 3.2s forwards;
}
.ha-diag-sub {
  opacity: 0;
  animation: ha-type-in 0.7s steps(30, end) 3.9s forwards;
}

/* CRITICAL: reduced-motion — 모든 transform/keyframes 끄고 최종 조립 상태 고정 */
@media (prefers-reduced-motion: reduce) {
  .ha-csv-line,
  .ha-donut-center,
  .ha-total,
  .ha-diag,
  .ha-thinking,
  .ha-diag-title,
  .ha-diag-sub {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
    filter: none !important;
    clip-path: none !important;
  }
  .ha-arc {
    animation: none !important;
    stroke-dashoffset: 0 !important;
  }
  .ha-bar-fill {
    animation: none !important;
    width: var(--ha-bar-w) !important;
  }
  .ha-dot {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}
`
