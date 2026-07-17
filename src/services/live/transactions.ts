import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server-client'
import { CATEGORIES } from '@/types'
import type { Category, DateRange, NewTransaction, Transaction } from '@/types'
import type { TransactionRow } from '@/types/database'

import type { TransactionsRepository } from '../types'

function assertAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error('Invalid transaction amount')
  }
}

function assertCategory(category: Category): void {
  if (!CATEGORIES.includes(category)) {
    throw new Error('Invalid transaction category')
  }
}

function toTransaction(row: TransactionRow): Transaction {
  assertAmount(row.amount)
  assertCategory(row.category)

  return {
    id: row.id,
    userId: row.user_id,
    uploadId: row.upload_id,
    occurredOn: row.occurred_on,
    merchant: row.merchant,
    amount: row.amount,
    direction: row.direction,
    category: row.category,
    raw: row.raw,
  }
}

function toInsertRow(userId: string, transaction: NewTransaction) {
  assertAmount(transaction.amount)
  assertCategory(transaction.category)

  return {
    user_id: userId,
    upload_id: transaction.uploadId,
    occurred_on: transaction.occurredOn,
    merchant: transaction.merchant,
    amount: transaction.amount,
    direction: transaction.direction,
    category: transaction.category,
    raw: transaction.raw,
  }
}

export const liveTransactionsRepository: TransactionsRepository = {
  async listByUser(userId: string, range?: DateRange) {
    const client = await createSupabaseServerClient()
    let query = client
      .from('transactions')
      .select('*')
      .eq('user_id', userId)

    if (range) {
      query = query
        .gte('occurred_on', range.from)
        .lte('occurred_on', range.to)
    }

    const { data, error } = await query.order('occurred_on', { ascending: false })
    if (error) {
      throw error
    }

    return data.map(toTransaction)
  },

  async insertMany(userId: string, transactions: NewTransaction[]) {
    if (transactions.length === 0) {
      return { inserted: 0 }
    }

    const rows = transactions.map((transaction) => toInsertRow(userId, transaction))
    const client = await createSupabaseServerClient()
    const { data, error } = await client
      .from('transactions')
      .insert(rows)
      .select('id')

    if (error) {
      throw error
    }

    return { inserted: data.length }
  },

  async reclassify(userId: string, txnId: string, category: Category) {
    assertCategory(category)

    const client = await createSupabaseServerClient()
    const { data, error } = await client
      .from('transactions')
      .update({ category })
      .eq('user_id', userId)
      .eq('id', txnId)
      .select('*')
      .maybeSingle()

    if (error) {
      throw error
    }
    if (!data) {
      throw new Error('Transaction not found')
    }

    return toTransaction(data)
  },
}
