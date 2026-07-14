import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Transaction } from '@/types'

import { DashboardClient } from './DashboardClient'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mutate = vi.fn()

const transactions: Transaction[] = [
  { id: 'tx-1', userId: 'user', uploadId: 'upload', occurredOn: '2026-06-03', merchant: '배달의민족', amount: 23900, direction: 'expense', category: '식비', raw: { card: '신한카드' } },
  { id: 'tx-2', userId: 'user', uploadId: 'upload', occurredOn: '2026-06-05', merchant: '배달의민족', amount: 10100, direction: 'expense', category: '식비', raw: { card: '신한카드' } },
  { id: 'tx-3', userId: 'user', uploadId: 'upload', occurredOn: '2026-06-25', merchant: '급여 입금', amount: 3200000, direction: 'income', category: '수입', raw: {} },
]

vi.mock('@/queries/transactions', () => ({
  useTransactions: () => ({ transactions, queryState: { status: 'success', error: null } }),
  useReclassify: () => ({ mutate, isPending: false, error: null }),
}))

vi.mock('@/queries/insights', () => ({
  useInsights: () => ({
    insights: [{ title: '기본 분석', kind: 'summary', segments: [{ text: '식비가 가장 큰 지출이에요.', emphasis: true }] }],
    queryState: { status: 'success', error: null },
  }),
}))

vi.mock('@/queries/profile', () => ({
  useProfile: () => ({ profile: { id: 'user', plan: 'free' }, queryState: { status: 'success', error: null } }),
}))

describe('DashboardClient', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mutate.mockReset()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('renders aggregate KPIs, category, and top merchant from query data', async () => {
    await act(async () => root.render(<DashboardClient guest={false} />))

    expect(container.textContent).toContain('총지출')
    expect(container.textContent).toContain('34,000원')
    expect(container.textContent).toContain('순수지')
    expect(container.textContent).toContain('3,166,000원')
    expect(container.textContent).toContain('식비')
    expect(container.textContent).toContain('배달의민족')
    expect(container.textContent).toContain('식비가 가장 큰 지출이에요.')
  })

  it('sends only an enum category through the reclassify mutation', async () => {
    await act(async () => root.render(<DashboardClient guest={false} />))

    const transaction = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('배달의민족'))
    await act(async () => transaction?.click())
    const openModal = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '카테고리 재분류')
    await act(async () => openModal?.click())
    const shopping = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '쇼핑')
    await act(async () => shopping?.click())

    expect(mutate).toHaveBeenCalledWith(
      { id: 'tx-1', category: '쇼핑' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })
})
