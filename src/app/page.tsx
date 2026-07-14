import Link from 'next/link'

import { Amount, Badge, Card, Footer, TopNav } from '@/components/ui'

const features = [
  ['컬럼 자동 매핑', '카드사마다 다른 CSV 컬럼을 샘플 20행 이내로 인식하고, 확정 전 직접 확인할 수 있어요.'],
  ['통합 대시보드', '지출·수입·카테고리·가맹점을 결정론적 집계로 한 화면에 정리해요.'],
  ['Pro 지출 진단', '집계된 숫자를 바탕으로 지출 구조와 실행 가능한 절감 제안을 보여줘요.'],
] as const

export default function HomePage() {
  return (
    <div className="bg-canvas">
      <TopNav actions={<><div className="hidden items-center gap-lg md:flex"><a href="#features" className="text-nav font-nav text-body">기능</a><a href="#pricing" className="text-nav font-nav text-body">요금제</a><a href="#security" className="text-nav font-nav text-body">보안</a></div><Link href="/login" className="text-nav font-nav text-body">로그인</Link><Link href="/login" className="inline-flex min-h-11 items-center rounded-pill bg-primary px-md text-button font-button text-on-primary hover:bg-primary-active">시작하기</Link></>} />

      <main>
        <section className="bg-surface-dark text-on-dark">
          <div className="mx-auto grid max-w-container gap-xxl px-lg py-section lg:grid-cols-[1.05fr_.95fr] lg:items-center">
            <div className="text-left">
              <Badge className="border border-on-dark/20 bg-surface-dark-elevated text-on-dark">CSV 소비 분석</Badge>
              <h1 className="mt-lg max-w-3xl font-display text-display-md font-display sm:text-display-lg lg:text-display-xl">내 돈이 어디로 갔는지, 3분 안에.</h1>
              <p className="mt-lg max-w-xl text-body-md leading-7 text-on-dark-soft">은행 거래내역이나 카드 명세서 CSV를 올리면 지출 흐름을 정확한 숫자로 정리하고, 다음에 볼 지점을 알려드려요.</p>
              <div className="mt-xl flex flex-wrap gap-sm"><Link href="/login" className="inline-flex min-h-12 items-center rounded-pill bg-primary px-xl text-button font-button text-on-primary hover:bg-primary-active">내 파일로 시작하기</Link><Link href="/dashboard?guest=1" className="inline-flex min-h-12 items-center rounded-pill border border-on-dark/40 px-xl text-button font-button text-on-dark">샘플로 먼저 보기</Link></div>
            </div>
            <div className="relative min-h-[380px]" aria-label="대시보드 미리보기">
              <div className="absolute left-0 top-4 w-[78%] rounded-xl border border-white/10 bg-surface-dark-elevated p-xl shadow-[0_24px_60px_rgba(0,0,0,.45)]"><p className="text-caption text-on-dark-soft">2026년 6월 총지출</p><Amount value={1847620} direction="expense" className="mt-sm block text-[32px] text-on-dark" /><div className="mt-xl h-2 overflow-hidden rounded-pill bg-white/10"><div className="h-full w-3/5 bg-primary" /></div><p className="mt-sm text-caption text-on-dark-soft">식비와 쇼핑이 전체 지출의 48%예요.</p></div>
              <div className="absolute bottom-4 right-0 w-[82%] rounded-xl border border-white/10 bg-canvas p-xl text-ink shadow-[0_24px_60px_rgba(0,0,0,.45)]"><div className="flex items-center justify-between"><p className="text-caption text-muted">지출 진단</p><Badge variant="pro">OPUS 4.8</Badge></div><p className="mt-lg text-title-md font-title-md">고정비보다 변동비를 먼저 살펴보세요.</p><p className="mt-sm text-body-sm leading-6 text-body">반복되는 배달·쇼핑 지출에서 조정 가능한 항목이 보여요.</p></div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-container px-lg py-section text-left"><p className="text-caption-strong font-caption-strong text-primary">기능</p><h2 className="mt-sm font-display text-display-sm font-display">CSV 한 장에서 소비 흐름까지</h2><div className="mt-xl grid gap-lg md:grid-cols-3">{features.map(([title, body]) => <Card key={title}><h3 className="text-title-md font-title-md">{title}</h3><p className="mt-sm text-body-sm leading-6 text-body">{body}</p></Card>)}</div></section>

        <section id="pricing" className="bg-surface-soft"><div className="mx-auto max-w-container px-lg py-section text-left"><p className="text-caption-strong font-caption-strong text-primary">요금제</p><h2 className="mt-sm font-display text-display-sm font-display">필요한 깊이만 선택하세요</h2><div className="mt-xl grid gap-lg md:grid-cols-2"><Card><p className="text-title-md font-title-md">Free</p><p className="mt-lg font-mono text-[36px] font-number tabular-nums">₩0</p><p className="mt-sm text-body-sm text-body">대시보드 전체와 기본 소비 분석</p><Link href="/login" className="mt-xl inline-flex min-h-11 items-center rounded-pill border border-hairline px-md text-button font-button text-ink">무료로 시작하기</Link></Card><div className="rounded-xl bg-surface-dark p-card text-on-dark"><div className="flex items-center justify-between"><p className="text-title-md font-title-md">Pro</p><Badge variant="pro">OPUS 4.8</Badge></div><p className="mt-lg font-mono text-[36px] font-number tabular-nums">₩9,900<span className="font-sans text-body-sm text-on-dark-soft">/월</span></p><p className="mt-sm text-body-sm text-on-dark-soft">심화 지출 진단과 정기구독 후보 탐지</p><Link href="/login" className="mt-xl inline-flex min-h-11 items-center rounded-pill bg-primary px-md text-button font-button text-on-primary">Pro 시작하기</Link></div></div></div></section>

        <section id="security" className="mx-auto max-w-container px-lg py-section text-left"><p className="text-caption-strong font-caption-strong text-primary">보안</p><h2 className="mt-sm font-display text-display-sm font-display">금융 데이터의 경계를 지킵니다</h2><p className="mt-base max-w-2xl text-body-md leading-7 text-body">원본 파일은 비공개 저장소에 두고, 사용자별 접근 통제와 완전 삭제를 기본 원칙으로 설계했습니다.</p></section>
      </main>
      <Footer />
    </div>
  )
}
