import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { createSupabaseServerClientMock } = vi.hoisted(() => ({
  createSupabaseServerClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server-client', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}))

import { liveTransactionsRepository } from '@/services/live/transactions'
import type { TransactionRow } from '@/types/database'
import type { NewTransaction } from '@/types'

const row: TransactionRow = {
  id: 'txn-1',
  user_id: 'user-1',
  upload_id: 'upload-1',
  occurred_on: '2026-06-03',
  merchant: '배달의민족',
  amount: 23_900,
  direction: 'expense',
  category: '식비',
  raw: { 승인번호: '123456' },
}

const transaction = {
  id: 'txn-1',
  userId: 'user-1',
  uploadId: 'upload-1',
  occurredOn: '2026-06-03',
  merchant: '배달의민족',
  amount: 23_900,
  direction: 'expense' as const,
  category: '식비' as const,
  raw: { 승인번호: '123456' },
}

describe('liveTransactionsRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('maps rows to domain transactions and applies an inclusive date range', async () => {
    const order = vi.fn().mockResolvedValue({ data: [row], error: null })
    const lte = vi.fn(() => ({ order }))
    const gte = vi.fn(() => ({ lte }))
    const eq = vi.fn(() => ({ gte }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ select }))
    createSupabaseServerClientMock.mockResolvedValue({ from })

    await expect(liveTransactionsRepository.listByUser('user-1', {
      from: '2026-06-01',
      to: '2026-06-30',
    })).resolves.toEqual([transaction])

    expect(from).toHaveBeenCalledWith('transactions')
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(gte).toHaveBeenCalledWith('occurred_on', '2026-06-01')
    expect(lte).toHaveBeenCalledWith('occurred_on', '2026-06-30')
    expect(order).toHaveBeenCalledWith('occurred_on', { ascending: false })
  })

  it('inserts mapped rows with user_id and preserves amount, direction, and category', async () => {
    const newTransaction: NewTransaction = {
      uploadId: transaction.uploadId,
      occurredOn: transaction.occurredOn,
      merchant: transaction.merchant,
      amount: transaction.amount,
      direction: transaction.direction,
      category: transaction.category,
      raw: transaction.raw,
    }
    const selectInserted = vi.fn().mockResolvedValue({ data: [{ id: 'txn-1' }], error: null })
    const insert = vi.fn(() => ({ select: selectInserted }))
    const from = vi.fn(() => ({ insert }))
    createSupabaseServerClientMock.mockResolvedValue({ from })

    await expect(liveTransactionsRepository.insertMany('user-1', [newTransaction]))
      .resolves.toEqual({ inserted: 1 })

    expect(insert).toHaveBeenCalledWith([{
      user_id: 'user-1',
      upload_id: 'upload-1',
      occurred_on: '2026-06-03',
      merchant: '배달의민족',
      amount: 23_900,
      direction: 'expense',
      category: '식비',
      raw: { 승인번호: '123456' },
    }])
    expect(selectInserted).toHaveBeenCalledWith('id')
  })

  it('returns zero for an empty insert without creating a database client', async () => {
    await expect(liveTransactionsRepository.insertMany('user-1', []))
      .resolves.toEqual({ inserted: 0 })
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled()
  })

  it('updates only category and maps the updated row', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { ...row, category: '교통' },
      error: null,
    })
    const selectUpdated = vi.fn(() => ({ maybeSingle }))
    const eqTxn = vi.fn(() => ({ select: selectUpdated }))
    const eqUser = vi.fn(() => ({ eq: eqTxn }))
    const update = vi.fn(() => ({ eq: eqUser }))
    const from = vi.fn(() => ({ update }))
    createSupabaseServerClientMock.mockResolvedValue({ from })

    await expect(liveTransactionsRepository.reclassify('user-1', 'txn-1', '교통'))
      .resolves.toEqual({ ...transaction, category: '교통' })
    expect(update).toHaveBeenCalledWith({ category: '교통' })
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1')
    expect(eqTxn).toHaveBeenCalledWith('id', 'txn-1')
  })

  it('throws the mock contract error when the transaction does not exist', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const select = vi.fn(() => ({ maybeSingle }))
    const eqTxn = vi.fn(() => ({ select }))
    const eqUser = vi.fn(() => ({ eq: eqTxn }))
    const update = vi.fn(() => ({ eq: eqUser }))
    createSupabaseServerClientMock.mockResolvedValue({
      from: vi.fn(() => ({ update })),
    })

    await expect(liveTransactionsRepository.reclassify('user-1', 'missing', '교통'))
      .rejects.toThrow('Transaction not found')
  })
})
