import Link from 'next/link'
import type { ReactNode } from 'react'

import { Badge, Card, Footer, ThemeToggle, TopNav } from '@/components/ui'
import { HeroAnalysis } from '@/components/landing/HeroAnalysis'

type IconProps = { className?: string }

function stroke(path: ReactNode) {
  return function Icon({ className }: IconProps) {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        {path}
      </svg>
    )
  }
}

const IconColumns = stroke(<><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="16" rx="1" /><path d="M18 9h3M18 13h3" /></>)
const IconChart = stroke(<><path d="M12 3a9 9 0 1 0 9 9h-9z" /><path d="M14 3.5a7 7 0 0 1 6.5 6.5H14z" /></>)
const IconTarget = stroke(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /></>)
const IconLock = stroke(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>)
const IconShield = stroke(<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />)
const IconTrash = stroke(<path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-8 0v12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7" />)
const IconCheck = stroke(<path d="m5 12 4 4L19 6" />)

const steps = [
  ['올리기', '은행·카드사 CSV 한 개를 끌어놓기만 하면 돼요. 카드사마다 다른 형식도 알아서 인식합니다.'],
  ['확인하기', 'AI가 잡은 컬럼 매핑을 한눈에 확인하고, 필요하면 바로 고쳐요. 샘플 20행만 분석합니다.'],
  ['인사이트', '지출·수입·카테고리·가맹점이 정확한 숫자로 정리되고, 다음에 볼 지점을 알려드려요.'],
] as const

const features = [
  [IconColumns, '카드사가 뭐든, 올리면 바로 인식', '신한·삼성·국민… 제각각인 CSV 컬럼을 샘플 20행 이내로 자동 매핑하고, 확정 전에 직접 확인해요.'],
  [IconChart, '흩어진 소비가 한 화면으로', '지출·수입·카테고리·가맹점을 결정론적 집계로 정리해, 내 돈의 흐름을 한눈에 봅니다.'],
  [IconTarget, '숫자에서 다음 행동까지', 'Pro 지출 진단이 지출 구조를 해석하고, 줄일 수 있는 실행 가능한 절감 지점을 짚어줘요.'],
] as const

const guarantees = [
  [IconShield, '비공개 저장', '원본 파일은 사용자 전용 비공개 스토리지에 두고, 접근 통제를 기본으로 설계했습니다.'],
  [IconLock, '최소 전송', '컬럼 인식에는 헤더와 샘플 20행만 AI로 보냅니다. 전체 거래는 브라우저에서 변환돼요.'],
  [IconTrash, '언제든 완전 삭제', '데이터는 내 것입니다. 원하면 원본과 분석 결과를 한 번에 완전히 지울 수 있어요.'],
] as const

const freePerks = ['통합 대시보드 전체', '카테고리·가맹점 집계', '기본 소비 분석 (Sonnet 4.6)']
const proPerks = ['Free의 모든 기능', '지출 진단 리포트 (Opus 4.8)', '맞춤 절감 제안 3건', '정기구독 후보 탐지']

export default function HomePage() {
  return (
    <div className="bg-canvas">
      <TopNav
        actions={
          <>
            <div className="hidden items-center gap-lg md:flex">
              <a href="#how" className="text-nav font-nav text-body hover:text-ink">이용 방법</a>
              <a href="#features" className="text-nav font-nav text-body hover:text-ink">기능</a>
              <a href="#pricing" className="text-nav font-nav text-body hover:text-ink">요금제</a>
              <a href="#security" className="text-nav font-nav text-body hover:text-ink">보안</a>
            </div>
            <ThemeToggle />
            <Link href="/login" className="text-nav font-nav text-body hover:text-ink">로그인</Link>
            <Link href="/login" className="inline-flex min-h-11 items-center rounded-pill bg-primary px-md text-button font-button text-on-primary hover:bg-primary-active">시작하기</Link>
          </>
        }
      />

      <main>
        {/* Hero */}
        <section className="bg-surface-dark text-on-dark">
          <div className="mx-auto grid max-w-container gap-xxl px-lg py-section lg:grid-cols-[1.05fr_.95fr] lg:items-center">
            <div className="fs-fade text-left">
              <Badge className="border border-on-dark/15 bg-surface-dark-elevated text-on-dark">CSV 소비 분석</Badge>
              <h1 className="mt-lg max-w-3xl font-display text-display-md font-display sm:text-display-lg lg:text-display-xl">
                내 돈이 어디로 갔는지,<br />
                <span className="text-primary">3분</span> 안에.
              </h1>
              <p className="mt-lg max-w-xl text-body-md leading-7 text-on-dark-soft">
                은행 거래내역이나 카드 명세서 CSV를 올리면 지출 흐름을 정확한 숫자로 정리하고, 다음에 볼 지점을 알려드려요.
              </p>
              <div className="mt-xl flex flex-wrap gap-sm">
                <Link href="/login" className="inline-flex min-h-12 items-center rounded-pill bg-primary px-xl text-button font-button text-on-primary shadow-soft hover:bg-primary-active">내 파일로 시작하기</Link>
                <Link href="/dashboard?guest=1" className="inline-flex min-h-12 items-center gap-xs rounded-pill border border-on-dark/40 px-xl text-button font-button text-on-dark hover:border-on-dark">
                  샘플로 먼저 보기
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
              <p className="mt-lg flex flex-wrap items-center gap-x-sm gap-y-xs text-caption text-on-dark-soft">
                <IconLock className="h-base w-base text-semantic-up" />
                가입·카드 등록 없이 시작 · 원본은 비공개 저장 · 언제든 완전 삭제
              </p>
            </div>

            <HeroAnalysis />
          </div>
        </section>

        {/* Metrics strip */}
        <section aria-label="핵심 지표" className="border-b border-hairline bg-canvas">
          <dl className="mx-auto grid max-w-container grid-cols-1 divide-y divide-hairline px-lg sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {([
              ['3분', '첫 인사이트까지'],
              ['20행', 'AI에 보내는 최대 샘플'],
              ['₩0', '가입·기본 분석 비용'],
            ] as const).map(([value, label]) => (
              <div key={label} className="flex flex-col items-start gap-xxs py-xl sm:items-center sm:px-lg">
                <dt className="font-mono text-[36px] font-number leading-none tabular-nums text-ink">{value}</dt>
                <dd className="text-body-sm text-muted">{label}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* How it works */}
        <section id="how" className="bg-surface-soft">
          <div className="mx-auto max-w-container px-lg py-section text-left">
            <p className="text-caption-strong font-caption-strong text-primary">이용 방법</p>
            <h2 className="mt-sm max-w-2xl font-display text-display-sm font-display">세 걸음이면 끝나요</h2>
            <div className="mt-xl grid gap-lg md:grid-cols-3">
              {steps.map(([title, body], index) => (
                <Card key={title}>
                  <span className="font-mono text-[28px] font-number tabular-nums text-primary">{String(index + 1).padStart(2, '0')}</span>
                  <h3 className="mt-base text-title-md font-title-md">{title}</h3>
                  <p className="mt-sm text-body-sm leading-6 text-body">{body}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-container px-lg py-section text-left">
          <p className="text-caption-strong font-caption-strong text-primary">기능</p>
          <h2 className="mt-sm max-w-2xl font-display text-display-sm font-display">CSV 한 장에서 소비 흐름까지</h2>
          <div className="mt-xl grid gap-lg md:grid-cols-3">
            {features.map(([Icon, title, body]) => (
              <Card key={title}>
                <Icon className="h-xl w-xl text-primary" />
                <h3 className="mt-lg text-title-md font-title-md">{title}</h3>
                <p className="mt-sm text-body-sm leading-6 text-body">{body}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="bg-surface-soft">
          <div className="mx-auto max-w-container px-lg py-section text-left">
            <p className="text-caption-strong font-caption-strong text-primary">요금제</p>
            <h2 className="mt-sm max-w-2xl font-display text-display-sm font-display">필요한 깊이만 선택하세요</h2>
            <div className="mt-xl grid items-start gap-lg md:grid-cols-2">
              <Card>
                <p className="text-title-md font-title-md">Free</p>
                <p className="mt-lg font-mono text-[36px] font-number tabular-nums">₩0</p>
                <p className="mt-xs text-body-sm text-muted">대시보드 전체와 기본 소비 분석</p>
                <ul className="mt-lg space-y-sm">
                  {freePerks.map((perk) => (
                    <li key={perk} className="flex items-center gap-sm text-body-sm text-body"><IconCheck className="h-base w-base shrink-0 text-semantic-up" />{perk}</li>
                  ))}
                </ul>
                <Link href="/login" className="mt-xl inline-flex min-h-11 items-center rounded-pill border border-hairline px-md text-button font-button text-ink hover:bg-surface-soft">무료로 시작하기</Link>
              </Card>
              <div className="rounded-xl bg-surface-dark p-card text-on-dark">
                <div className="flex items-center justify-between"><p className="text-title-md font-title-md">Pro</p><Badge variant="pro">OPUS 4.8</Badge></div>
                <p className="mt-lg font-mono text-[36px] font-number tabular-nums">₩9,900<span className="font-sans text-body-sm text-on-dark-soft">/월</span></p>
                <p className="mt-xs text-body-sm text-on-dark-soft">심화 지출 진단과 정기구독 후보 탐지</p>
                <ul className="mt-lg space-y-sm">
                  {proPerks.map((perk) => (
                    <li key={perk} className="flex items-center gap-sm text-body-sm text-on-dark"><IconCheck className="h-base w-base shrink-0 text-primary" />{perk}</li>
                  ))}
                </ul>
                <Link href="/login" className="mt-xl inline-flex min-h-11 items-center rounded-pill bg-primary px-md text-button font-button text-on-primary hover:bg-primary-active">Pro 시작하기</Link>
              </div>
            </div>
          </div>
        </section>

        {/* Security */}
        <section id="security" className="mx-auto max-w-container px-lg py-section text-left">
          <p className="text-caption-strong font-caption-strong text-primary">보안</p>
          <h2 className="mt-sm max-w-2xl font-display text-display-sm font-display">금융 데이터의 경계를 지킵니다</h2>
          <p className="mt-base max-w-2xl text-body-md leading-7 text-body">내 금융 데이터를 맡기는 일이니까, 세 가지를 기본 원칙으로 설계했어요.</p>
          <div className="mt-xl grid gap-lg md:grid-cols-3">
            {guarantees.map(([Icon, title, body]) => (
              <Card key={title}>
                <Icon className="h-xl w-xl text-primary" />
                <h3 className="mt-lg text-title-sm font-title-sm">{title}</h3>
                <p className="mt-sm text-body-sm leading-6 text-body">{body}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-surface-dark text-on-dark">
          <div className="mx-auto flex max-w-container flex-col items-start gap-lg px-lg py-xxl text-left lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="max-w-xl font-display text-display-sm font-display">지금 내 소비부터 확인해 보세요</h2>
              <p className="mt-sm text-body-md text-on-dark-soft">가입 없이 샘플로 먼저 보거나, 내 CSV로 바로 시작할 수 있어요.</p>
            </div>
            <div className="flex flex-wrap gap-sm">
              <Link href="/login" className="inline-flex min-h-12 items-center rounded-pill bg-primary px-xl text-button font-button text-on-primary hover:bg-primary-active">내 파일로 시작하기</Link>
              <Link href="/dashboard?guest=1" className="inline-flex min-h-12 items-center rounded-pill border border-on-dark/40 px-xl text-button font-button text-on-dark hover:border-on-dark">샘플로 먼저 보기</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
