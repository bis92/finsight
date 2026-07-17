'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { Card, Badge, Button, Modal, SubscriptionRow } from '@/components/ui'
import { aggregate } from '@/lib/analysis'
import { ApiError, apiClient } from '@/lib/apiClient'
import { formatKrw } from '@/lib/format'
import { useProReport } from '@/queries/analyses'
import { useProfile } from '@/queries/profile'
import { useTransactions } from '@/queries/transactions'
import type { Insight } from '@/types'

const PERIOD = '2026-06'
const FIXED_CATEGORIES = new Set(['주거', '구독', '공과금'])
const CADENCE_LABEL = { monthly: '매월 추정', weekly: '매주 추정', unknown: '주기 추정 중' } as const

function InsightText({ insight }: { insight: Insight }) {
  return (
    <p className="mt-xs text-body-sm leading-6 text-body">
      {insight.segments.map((segment, index) => segment.emphasis
        ? <strong key={index} className="font-semibold text-ink">{segment.text}</strong>
        : <span key={index}>{segment.text}</span>)}
    </p>
  )
}

type ProReportClientProps = {
  guest: boolean
  navigate?: (url: string) => void
}

export function ProReportClient({
  guest,
  navigate = (url) => { window.location.href = url },
}: ProReportClientProps) {
  const { profile, queryState: profileState } = useProfile()
  const isPro = !guest && profile?.plan === 'pro'
  const { report, queryState: reportState } = useProReport(PERIOD, isPro)
  const { transactions, queryState: transactionState } = useTransactions()
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [checkoutPending, setCheckoutPending] = useState(false)
  const [checkoutError, setCheckoutError] = useState<Error | null>(null)
  const checkoutStatus = typeof window === 'undefined'
    ? null
    : new URLSearchParams(window.location.search).get('checkout')

  async function startCheckout() {
    if (checkoutPending) return

    setCheckoutPending(true)
    setCheckoutError(null)
    try {
      const { url } = await apiClient.post<{ url: string }>('/api/checkout', {})
      navigate(url)
    } catch (error) {
      setCheckoutError(error instanceof Error ? error : new Error(String(error)))
      setCheckoutPending(false)
    }
  }

  const expenseSplit = useMemo(() => {
    const snapshot = aggregate(transactions, PERIOD)
    const fixed = snapshot.byCategory
      .filter(({ category }) => FIXED_CATEGORIES.has(category))
      .reduce((sum, { amount }) => sum + amount, 0)
    return { fixed, variable: Math.max(0, snapshot.totalExpense - fixed), total: snapshot.totalExpense }
  }, [transactions])

  if (profileState.status === 'loading') {
    return <main className="mx-auto max-w-container px-lg py-xxl"><p className="text-body-sm text-muted">Pro 권한을 확인하는 중입니다.</p></main>
  }
  if (profileState.status === 'error') {
    return <main className="mx-auto max-w-container px-lg py-xxl"><p role="alert" className="text-body-sm text-semantic-down">{profileState.error.message}</p></main>
  }

  if (!isPro) {
    return (
      <main className="fs-fade mx-auto max-w-container px-lg py-section text-left">
        {checkoutStatus === 'success' && (
          <p role="status" className="mb-lg rounded-md border border-hairline bg-surface-soft p-base text-body-sm text-body">결제가 확인되면 곧 Pro가 활성화됩니다. 활성화 상태는 서버에서 확인합니다.</p>
        )}
        {checkoutStatus === 'cancel' && (
          <p role="status" className="mb-lg rounded-md border border-hairline bg-surface-soft p-base text-body-sm text-body">결제가 취소되었습니다. 플랜은 변경되지 않았습니다.</p>
        )}
        <Card className="mx-auto max-w-2xl">
          <svg aria-hidden="true" className="h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          <Badge variant="pro" className="mt-lg">OPUS 4.8</Badge>
          <h1 className="mt-base text-title-lg font-title-lg">돈을 줄일 다음 행동까지 확인하세요</h1>
          <p className="mt-sm text-body text-body">지출 진단, 맞춤 절감 제안, 정기구독 후보를 Pro 리포트에서 제공합니다.</p>
          {guest ? (
            <Link href="/login" className="mt-xl inline-flex min-h-12 items-center rounded-pill bg-primary px-xl text-button font-button text-on-primary hover:bg-primary-active">가입하고 Pro 체험</Link>
          ) : (
            <Button size="cta" className="mt-xl" onClick={() => setUpgradeOpen(true)}>Pro로 업그레이드 ₩9,900/월</Button>
          )}
        </Card>
        <Modal open={upgradeOpen} title="Pro로 업그레이드" onClose={() => setUpgradeOpen(false)}>
          <p className="font-mono text-[28px] font-medium tabular-nums">₩9,900<span className="font-sans text-body-sm text-muted"> / 월</span></p>
          <ul className="mt-lg space-y-sm text-body-sm text-body"><li>지출 진단 리포트</li><li>맞춤 절감 제안 3건</li><li>정기구독 후보 탐지</li></ul>
          <Button className="mt-xl w-full" disabled={checkoutPending} onClick={startCheckout}>
            {checkoutPending ? '결제 페이지로 이동 중…' : '결제하고 Pro 시작하기'}
          </Button>
          {checkoutError && <p role="alert" className="mt-sm text-caption text-semantic-down">{checkoutError.message}</p>}
          {checkoutError instanceof ApiError && checkoutError.status === 401 && (
            <Link href="/login" className="mt-sm inline-block text-caption text-primary">로그인하기</Link>
          )}
          <p className="mt-sm text-caption text-muted">결제가 완료되면 확인 후 Pro가 활성화됩니다.</p>
        </Modal>
      </main>
    )
  }

  if (reportState.status === 'loading' || transactionState.status === 'loading') {
    return <main className="mx-auto max-w-container px-lg py-xxl"><p className="text-body-sm text-muted">Pro 리포트를 불러오는 중입니다.</p></main>
  }
  if (reportState.status === 'error') {
    return <main className="mx-auto max-w-container px-lg py-xxl"><p role="alert" className="text-body-sm text-semantic-down">{reportState.error.message}</p></main>
  }
  if (!report) return null

  const diagnoses = report.insights.slice(0, 4)
  const suggestions = report.insights.filter(({ kind }) => kind === 'suggestion').slice(0, 3)
  const fixedPercent = expenseSplit.total > 0 ? (expenseSplit.fixed / expenseSplit.total) * 100 : 0

  return (
    <main className="fs-fade mx-auto max-w-container px-lg py-xxl text-left">
      <div className="flex flex-wrap items-center gap-sm"><h1 className="text-title-lg font-title-lg">2026년 6월 Pro 지출 진단</h1><Badge variant="pro">OPUS 4.8</Badge></div>
      <p className="mt-xs text-body-sm text-muted">집계 숫자를 바탕으로 지출을 해석하고 다음 행동을 제안합니다.</p>

      <div className="mt-xl grid gap-lg lg:grid-cols-2">
        <Card><h2 className="text-title-md font-title-md">진단 요약</h2><div className="mt-lg space-y-lg">{diagnoses.map((insight) => <article key={insight.title}><h3 className="text-title-sm font-title-sm">{insight.title}</h3><InsightText insight={insight} /></article>)}</div></Card>
        <Card><h2 className="text-title-md font-title-md">고정비 vs 변동비</h2><div className="mt-xl flex h-sm overflow-hidden rounded-pill bg-surface-strong" aria-label={`고정비 ${formatKrw(expenseSplit.fixed)}, 변동비 ${formatKrw(expenseSplit.variable)}`}><div className="h-full bg-[#0a2a8f]" style={{ width: `${fixedPercent}%` }} /><div className="h-full flex-1 bg-[#7aa1ff]" /></div><div className="mt-lg grid grid-cols-2 gap-base"><div><p className="text-caption text-muted">고정비</p><p className="font-mono text-title-md font-medium tabular-nums">{formatKrw(expenseSplit.fixed)}</p></div><div><p className="text-caption text-muted">변동비</p><p className="font-mono text-title-md font-medium tabular-nums">{formatKrw(expenseSplit.variable)}</p></div></div><p className="mt-lg text-body-sm text-body">고정비는 주거·구독·공과금 합계이며, 나머지 지출은 조정 가능한 변동비로 계산했습니다.</p></Card>
      </div>

      <div className="mt-lg grid gap-lg lg:grid-cols-2">
        <Card><h2 className="text-title-md font-title-md">절감 제안 3건</h2><div className="mt-base space-y-base">{suggestions.map((insight) => <article key={insight.title} className="border-t border-hairline-soft pt-base"><div className="flex gap-sm"><svg aria-hidden="true" className="mt-xxs h-base w-base shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m5 12 4 4L19 6" /></svg><div className="flex-1"><h3 className="text-title-sm font-title-sm">{insight.title}</h3><InsightText insight={insight} /></div><span className="font-mono text-body-sm font-medium text-semantic-up tabular-nums">{formatKrw(insight.savingKrw ?? 0)}</span></div></article>)}</div></Card>
        <Card><h2 className="text-title-md font-title-md">정기구독 후보</h2><p className="mt-xs text-caption text-muted">한 달 거래의 결제 패턴으로 찾은 추정 후보이며, 실제 구독으로 확정된 항목이 아닙니다.</p><div className="mt-base">{report.subscriptions.map((candidate) => <SubscriptionRow key={candidate.merchant} merchant={candidate.merchant} amount={candidate.amount} cadence={CADENCE_LABEL[candidate.cadence]} note={`후보 · 신뢰도 ${Math.round(candidate.confidence * 100)}%`} />)}</div></Card>
      </div>
    </main>
  )
}
