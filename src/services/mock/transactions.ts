// Server-only data implementation. Import through src/services/index.ts from Route Handlers.
import 'server-only'

import type { Category, DateRange, NewTransaction, Transaction } from '@/types'

import { MOCK_TRANSACTIONS } from './fixtures/transactions'
import type { TransactionsRepository } from '../types'

function cloneForUser(transaction: Transaction, userId: string): Transaction {
  return {
    ...transaction,
    userId,
    raw: { ...transaction.raw },
  }
}

function inRange(transaction: Transaction, range?: DateRange): boolean {
  return !range
    || (transaction.occurredOn >= range.from && transaction.occurredOn <= range.to)
}

export const mockTransactionsRepository: TransactionsRepository = {
  async listByUser(userId, range) {
    return MOCK_TRANSACTIONS
      .filter((transaction) => inRange(transaction, range))
      .map((transaction) => cloneForUser(transaction, userId))
  },

  async insertMany(_userId: string, txns: NewTransaction[]) {
    return { inserted: txns.length }
  },

  async reclassify(userId: string, txnId: string, category: Category) {
    const transaction = MOCK_TRANSACTIONS.find(({ id }) => id === txnId)
    if (!transaction) {
      throw new Error('Transaction not found')
    }

    return {
      ...cloneForUser(transaction, userId),
      category,
    }
  },
}
