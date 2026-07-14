'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { aggregate } from '@/lib/analysis'
import { formatKstDate } from '@/lib/format'
import { useInsights } from '@/queries/insights'
import { useProfile } from '@/queries/profile'
import { useReclassify, useTransactions } from '@/queries/transactions'
import type { Category, Transaction } from '@/types'
import { CATEGORIES } from '@/types'
import {
  Amount,
  Badge,
  BarRow,
  Button,
  Card,
  Donut,
  FilterChip,
  Input,
  LegendRow,
  MerchantRow,
  Modal,
  SideView,
  StatCard,
  TxRow,
} from '@/components/ui'

type Tab = 'overview' | 'categories' | 'ledger'

const PERIOD = '2026-06'

function cardName(transaction: Transaction): string | undefined {
  return typeof transaction.raw.card === 'string' ? transaction.raw.card : undefined
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-lg text-left">
      <h2 className="text-title-md font-title-md">{title}</h2>
      {description ? <p className="mt-xs text-body-sm text-muted">{description}</p> : null}
    </div>
  )
}

export function DashboardClient({ guest }: { guest: boolean }) {
  const { transactions, queryState } = useTransactions()
  const { insights, queryState: insightState } = useInsights(PERIOD)
  const { profile } = useProfile()
  const reclassify = useReclassify()
  const [tab, setTab] = useState<Tab>('overview')
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [reclassifying, setReclassifying] = useState(false)
  const [filter, setFilter] = useState<Category | 'all'>('all')

  const snapshot = useMemo(() => aggregate(transactions, PERIOD), [transactions])
  const expenseCategories = snapshot.byCategory.filter((item) => item.category !== '수입')
  const filteredTransactions = filter === 'all'
    ? transactions
    : transactions.filter((transaction) => transaction.category === filter)
  const filteredExpense = filteredTransactions
    .filter((transaction) => transaction.direction === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0)
  const filteredMerchants = aggregate(filteredTransactions, PERIOD).topMerchants.slice(0, 3)
  const maxCategory = Math.max(0, ...expenseCategories.map((item) => item.amount))
  const netBalance = snapshot.totalIncome - snapshot.totalExpense

  if (queryState.status === 'loading') {
    return <main className="mx-auto max-w-container px-lg py-xxl"><p className="text-body-sm text-muted">대시보드를 불러오는 중입니다.</p></main>
  }

  if (queryState.status === 'error') {
    return <main className="mx-auto max-w-container px-lg py-xxl"><p role="alert" className="text-body-sm text-semantic-down">{queryState.error.message}</p></main>
  }

  if (queryState.status === 'empty') {
    return (
      <main className="mx-auto max-w-container px-lg py-section text-left">
        <Card className="max-w-2xl">
          <h1 className="text-title-lg font-title-lg">아직 거래 내역이 없어요</h1>
          <p className="mt-sm text-body text-body">CSV 파일을 올리면 소비 내역을 한눈에 정리해 드려요.</p>
          <Link href="/upload" className="mt-lg inline-flex min-h-11 items-center rounded-pill bg-primary px-md text-button font-button text-on-primary hover:bg-primary-active">파일 업로드하기</Link>
        </Card>
      </main>
    )
  }

  const selectCategory = (category: Category) => {
    if (!selected || guest) return
    reclassify.mutate(
      { id: selected.id, category },
      { onSuccess: () => { setReclassifying(false); setSelected(null) } },
    )
  }

  return (
    <main className="fs-fade mx-auto max-w-container px-lg py-xxl text-left">
      {guest ? (
        <div className="mb-lg flex flex-wrap items-center gap-base rounded-lg border border-primary bg-canvas px-lg py-base">
          <Badge variant="pro">DEMO</Badge>
          <p className="flex-1 text-body-sm text-body">샘플 데이터로 보는 읽기 전용 대시보드입니다.</p>
          <Link href="/upload" className="text-body-sm font-title-sm text-primary">내 파일로 해보기 →</Link>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-lg">
        <div>
          <div className="flex items-center gap-sm">
            <h1 className="text-title-lg font-title-lg">2026년 6월 소비</h1>
            <Badge variant={profile?.plan === 'pro' ? 'pro' : 'free'}>{profile?.plan === 'pro' ? 'PRO' : 'FREE'}</Badge>
          </div>
          <p className="mt-xs text-body-sm text-muted">지출 흐름과 거래 내역을 한곳에서 확인하세요.</p>
        </div>
        <div className="flex rounded-pill bg-surface-strong p-xxs" role="tablist" aria-label="대시보드 보기">
          {([['overview', '개요'], ['categories', '카테고리'], ['ledger', '명세']] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`rounded-pill px-md py-xs text-body-sm font-medium ${tab === value ? 'bg-canvas text-ink shadow-soft' : 'text-muted'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="mt-xl grid gap-lg sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="총지출" value={<Amount value={snapshot.totalExpense} direction="expense" />} />
        <StatCard label="총수입" value={<Amount value={snapshot.totalIncome} direction="income" />} />
        <StatCard label="순수지" value={<Amount value={Math.abs(netBalance)} direction={netBalance >= 0 ? 'income' : 'expense'} />} />
        <StatCard label="거래 건수" value={<span>{transactions.length.toLocaleString('ko-KR')}건</span>} />
      </div>

      {tab === 'overview' ? (
        <div className="mt-lg space-y-lg">
          <div className="grid gap-lg lg:grid-cols-2">
            <Card><SectionHeading title="카테고리별 지출" /><div className="flex flex-col gap-xl sm:flex-row sm:items-center"><Donut data={expenseCategories} size={180} /><div className="min-w-0 flex-1 space-y-xs">{expenseCategories.slice(0, 6).map((item) => <LegendRow key={item.category} {...item} />)}</div></div></Card>
            <Card><SectionHeading title="상위 가맹점" description="지출 금액 기준 상위 6곳" />{snapshot.topMerchants.slice(0, 6).map((item, index) => <MerchantRow key={item.merchant} rank={index + 1} {...item} />)}</Card>
          </div>
          <div className="grid gap-lg lg:grid-cols-[1.35fr_.65fr]">
            <Card><SectionHeading title="최근 거래" />{transactions.slice(0, 8).map((transaction) => <TxRow key={transaction.id} {...transaction} card={cardName(transaction)} onClick={() => setSelected(transaction)} />)}</Card>
            <Card><SectionHeading title="기본 소비 분석" description="Sonnet 4.6 분석" />{insightState.status === 'loading' ? <p className="text-body-sm text-muted">분석을 불러오는 중입니다.</p> : insightState.status === 'error' ? <p role="alert" className="text-body-sm text-semantic-down">{insightState.error.message}</p> : insightState.status === 'empty' ? <p className="text-body-sm text-muted">표시할 분석이 없습니다.</p> : <div className="space-y-lg">{insights.map((insight) => <article key={`${insight.kind}-${insight.title}`}><h3 className="text-title-sm font-title-sm">{insight.title}</h3><p className="mt-xs text-body-sm leading-6 text-body">{insight.segments.map((segment, index) => segment.emphasis ? <strong key={index} className="font-semibold text-ink">{segment.text}</strong> : <span key={index}>{segment.text}</span>)}</p></article>)}</div>}</Card>
          </div>
          <section className="rounded-xl bg-surface-dark p-xl text-on-dark"><p className="text-caption text-on-dark-soft">STEP 11에서 제공</p><h2 className="mt-xs text-title-md font-title-md">지출을 줄일 다음 행동이 궁금한가요?</h2><p className="mt-sm text-body-sm text-on-dark-soft">Pro 지출 진단 리포트에서 맞춤 절감 제안을 확인하세요.</p><Link href="/pro" className="mt-lg inline-flex min-h-11 items-center rounded-pill border border-on-dark/30 px-md text-button font-button text-on-dark">Pro 리포트 보기</Link></section>
        </div>
      ) : null}

      {tab === 'categories' ? (
        <div className="mt-lg grid gap-lg lg:grid-cols-2">
          <Card><SectionHeading title="지출 구성" /><div className="flex justify-center"><Donut data={expenseCategories} size={220} thickness={30} /></div><div className="mt-xl space-y-sm">{expenseCategories.map((item) => <BarRow key={item.category} category={item.category} amount={item.amount} maxAmount={maxCategory} />)}</div></Card>
          <div className="space-y-lg"><Card><SectionHeading title="상위 가맹점" />{snapshot.topMerchants.slice(0, 6).map((item, index) => <MerchantRow key={item.merchant} rank={index + 1} {...item} />)}</Card><Card><SectionHeading title="정기구독 요약" /><p className="text-body-sm text-body">반복 결제 후보와 예상 월 지출은 Pro 리포트에서 확인할 수 있어요.</p><Link href="/pro" className="mt-base inline-block text-body-sm font-title-sm text-primary">Pro에서 확인 →</Link></Card></div>
        </div>
      ) : null}

      {tab === 'ledger' ? (
        <div className="mt-lg grid gap-lg lg:grid-cols-[180px_minmax(0,1fr)_280px]">
          <Card className="p-lg"><SectionHeading title="카테고리" /><div className="flex flex-wrap gap-xs lg:flex-col lg:items-start"><FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>전체</FilterChip>{CATEGORIES.map((category) => <FilterChip key={category} category={category} active={filter === category} onClick={() => setFilter(category)} />)}</div></Card>
          <Card><div className="mb-sm flex items-end justify-between gap-base"><SectionHeading title="거래 원장" description={`${filteredTransactions.length}건`} /><Amount value={filteredExpense} direction="expense" /></div>{filteredTransactions.length ? filteredTransactions.map((transaction) => <TxRow key={transaction.id} {...transaction} card={cardName(transaction)} onClick={() => setSelected(transaction)} />) : <p className="py-xl text-body-sm text-muted">이 카테고리의 거래가 없습니다.</p>}</Card>
          <div className="space-y-lg"><Card title="필터 지출 합계"><Amount value={filteredExpense} direction="expense" className="text-[28px]" /></Card><Card><SectionHeading title="상위 3곳" />{filteredMerchants.map((item, index) => <MerchantRow key={item.merchant} rank={index + 1} {...item} />)}</Card><Card><SectionHeading title="구독 요약" /><p className="text-body-sm text-body">정기구독 후보는 Pro에서 확인할 수 있어요.</p></Card></div>
        </div>
      ) : null}

      <SideView open={selected !== null && !reclassifying} title="거래 상세" onClose={() => setSelected(null)}>
        {selected ? <div className="space-y-xl"><div><p className="text-caption text-muted">가맹점</p><p className="mt-xs text-title-md font-title-md">{selected.merchant}</p><Amount value={selected.amount} direction={selected.direction} className="mt-sm block text-[28px]" /></div><dl className="space-y-base text-body-sm"><div><dt className="text-muted">거래일</dt><dd className="mt-xxs font-mono tabular-nums">{formatKstDate(selected.occurredOn)}</dd></div><div><dt className="text-muted">카드</dt><dd className="mt-xxs">{cardName(selected) ?? '—'}</dd></div><div><dt className="text-muted">카테고리</dt><dd className="mt-xxs">{selected.category}</dd></div></dl><div><label htmlFor="transaction-note" className="text-body-sm text-muted">메모</label><Input id="transaction-note" placeholder="메모를 입력하세요" className="mt-xs" readOnly /></div><Button variant="secondary" className="w-full" disabled={guest} onClick={() => setReclassifying(true)}>카테고리 재분류</Button>{guest ? <p className="text-caption text-muted">데모에서는 거래를 수정할 수 없습니다.</p> : null}</div> : null}
      </SideView>

      <Modal open={reclassifying && selected !== null} title="카테고리 재분류" onClose={() => setReclassifying(false)}>
        <p className="mb-base text-body-sm text-body">새 카테고리를 선택하면 대시보드 집계에 즉시 반영됩니다.</p><div className="flex flex-wrap gap-xs">{CATEGORIES.map((category) => <FilterChip key={category} category={category} active={selected?.category === category} onClick={() => selectCategory(category)} />)}</div>{reclassify.error ? <p role="alert" className="mt-base text-body-sm text-semantic-down">{reclassify.error.message}</p> : null}
      </Modal>
    </main>
  )
}
