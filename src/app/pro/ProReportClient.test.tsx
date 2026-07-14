import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Plan, Transaction } from '@/types'

import { ProReportClient } from './ProReportClient'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const state = vi.hoisted(() => ({ plan: 'free' as Plan }))
const transactions: Transaction[] = [
  { id: 'housing', userId: 'user', uploadId: 'upload', occurredOn: '2026-06-01', merchant: '관리비', amount: 200_000, direction: 'expense', category: '주거', raw: {} },
  { id: 'food', userId: 'user', uploadId: 'upload', occurredOn: '2026-06-02', merchant: '식당', amount: 300_000, direction: 'expense', category: '식비', raw: {} },
]

vi.mock('@/queries/profile', () => ({
  useProfile: () => ({ profile: { id: 'user', plan: state.plan }, queryState: { status: 'success', error: null } }),
}))

vi.mock('@/queries/transactions', () => ({
  useTransactions: () => ({ transactions, queryState: { status: 'success', error: null } }),
}))

vi.mock('@/queries/analyses', () => ({
  useProReport: (_period: string, enabled: boolean) => ({
    report: enabled ? {
      period: '2026-06',
      insights: [
        { title: '진단 1', kind: 'diagnosis', segments: [{ text: '<img src=x onerror=alert(1)>', emphasis: false }] },
        { title: '진단 2', kind: 'diagnosis', segments: [{ text: '고정비를 점검하세요.', emphasis: true }] },
        { title: '진단 3', kind: 'diagnosis', segments: [{ text: '변동비를 관리하세요.', emphasis: false }] },
        { title: '진단 4', kind: 'diagnosis', segments: [{ text: '현금 흐름은 안정적입니다.', emphasis: false }] },
        { title: '절감 1', kind: 'suggestion', savingKrw: 30_000, segments: [{ text: '외식을 줄여보세요.', emphasis: false }] },
        { title: '절감 2', kind: 'suggestion', savingKrw: 20_000, segments: [{ text: '구독을 점검하세요.', emphasis: false }] },
        { title: '절감 3', kind: 'suggestion', savingKrw: 10_000, segments: [{ text: '주간 한도를 정하세요.', emphasis: false }] },
      ],
      subscriptions: [{ merchant: '넷플릭스', amount: 13_500, cadence: 'monthly', confidence: 0.9, lastSeenOn: '2026-06-17' }],
    } : undefined,
    queryState: enabled ? { status: 'success', error: null } : { status: 'loading', error: null },
  }),
}))

describe('ProReportClient', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    state.plan = 'free'
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('renders only the upgrade CTA for a Free profile', async () => {
    await act(async () => root.render(<ProReportClient guest={false} />))

    expect(container.textContent).toContain('Pro로 업그레이드 ₩9,900/월')
    expect(container.textContent).not.toContain('넷플릭스')
    expect(container.textContent).not.toContain('진단 1')
  })

  it('renders diagnosis, computed expense split, savings, and candidates for Pro', async () => {
    state.plan = 'pro'
    await act(async () => root.render(<ProReportClient guest={false} />))

    expect(container.textContent).toContain('진단 1')
    expect(container.textContent).toContain('고정비')
    expect(container.textContent).toContain('200,000원')
    expect(container.textContent).toContain('변동비')
    expect(container.textContent).toContain('300,000원')
    expect(container.textContent).toContain('30,000원')
    expect(container.textContent).toContain('넷플릭스')
    expect(container.textContent).toContain('후보')
  })

  it('renders Insight segments as escaped plain text', async () => {
    state.plan = 'pro'
    await act(async () => root.render(<ProReportClient guest={false} />))

    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('strong')?.textContent).toBe('고정비를 점검하세요.')
  })
})
