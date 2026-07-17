import { CATEGORIES } from '@/types'
import type {
  AggregateSnapshot,
  Cadence,
  Category,
  NewTransaction,
  SubscriptionCandidate,
  Transaction,
} from '@/types'

import { CLASSIFICATION_RULES } from './rules'

const TOP_MERCHANT_LIMIT = 10
const DAY_IN_MS = 24 * 60 * 60 * 1000

type ClassifiableTransaction = NewTransaction | Transaction

export function classify(txn: ClassifiableTransaction): Category {
  if (txn.direction === 'income') {
    return '수입'
  }

  const merchant = txn.merchant.toLocaleLowerCase('ko-KR')
  const rule = CLASSIFICATION_RULES.find(({ keywords }) =>
    keywords.some((keyword) => merchant.includes(keyword.toLocaleLowerCase('ko-KR'))),
  )

  return rule?.category ?? '기타'
}

export function classifyMany<T extends ClassifiableTransaction>(
  txns: readonly T[],
): Array<T & { category: Category }> {
  return txns.map((txn) => ({ ...txn, category: classify(txn) }))
}

export function aggregate(
  txns: readonly Transaction[],
  period: string,
): AggregateSnapshot {
  let totalExpense = 0
  let totalIncome = 0
  const categoryAmounts = new Map<Category, number>()
  const merchantTotals = new Map<string, { amount: number; count: number }>()

  for (const txn of txns) {
    if (txn.direction === 'income') {
      totalIncome += txn.amount
      continue
    }

    totalExpense += txn.amount
    categoryAmounts.set(
      txn.category,
      (categoryAmounts.get(txn.category) ?? 0) + txn.amount,
    )

    const currentMerchant = merchantTotals.get(txn.merchant)
    merchantTotals.set(txn.merchant, {
      amount: (currentMerchant?.amount ?? 0) + txn.amount,
      count: (currentMerchant?.count ?? 0) + 1,
    })
  }

  const byCategory = Array.from(categoryAmounts, ([category, amount]) => ({
    category,
    amount,
    ratio: totalExpense === 0 ? 0 : amount / totalExpense,
  })).sort((left, right) =>
    right.amount - left.amount
      || CATEGORIES.indexOf(left.category) - CATEGORIES.indexOf(right.category),
  )

  const topMerchants = Array.from(merchantTotals, ([merchant, total]) => ({
    merchant,
    ...total,
  }))
    .sort((left, right) =>
      right.amount - left.amount || left.merchant.localeCompare(right.merchant, 'ko-KR'),
    )
    .slice(0, TOP_MERCHANT_LIMIT)

  return {
    period,
    totalExpense,
    totalIncome,
    netExpense: totalExpense - totalIncome,
    byCategory,
    topMerchants,
  }
}

type Charge = {
  txn: Transaction
  timestamp: number
}

function normalizedMerchant(merchant: string): string {
  return merchant.toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]/gu, '')
}

function isSimilarAmount(reference: number, candidate: number): boolean {
  const tolerance = Math.max(1_000, reference * 0.05)
  return Math.abs(reference - candidate) <= tolerance
}

function clusterBySimilarAmount(charges: Charge[]): Charge[][] {
  const clusters: Charge[][] = []

  for (const charge of charges.sort((left, right) => left.txn.amount - right.txn.amount)) {
    const cluster = clusters.find((items) => {
      const average = items.reduce((sum, item) => sum + item.txn.amount, 0) / items.length
      return isSimilarAmount(average, charge.txn.amount)
    })

    if (cluster) {
      cluster.push(charge)
    } else {
      clusters.push([charge])
    }
  }

  return clusters
}

function intervalDays(charges: Charge[]): number[] {
  const timestamps = [...new Set(charges.map(({ timestamp }) => timestamp))].sort(
    (left, right) => left - right,
  )

  return timestamps.slice(1).map((timestamp, index) =>
    Math.round((timestamp - (timestamps[index] ?? timestamp)) / DAY_IN_MS),
  )
}

function detectCadence(charges: Charge[]): Cadence {
  const intervals = intervalDays(charges)
  if (intervals.length === 0) {
    return 'unknown'
  }
  if (intervals.every((days) => days >= 25 && days <= 35)) {
    return 'monthly'
  }
  if (intervals.every((days) => days >= 6 && days <= 8)) {
    return 'weekly'
  }
  return 'unknown'
}

function confidenceFor(cadence: Cadence, count: number): number {
  if (cadence === 'monthly') {
    return Math.min(0.95, 0.82 + count * 0.03)
  }
  if (cadence === 'weekly') {
    return Math.min(0.92, 0.78 + count * 0.03)
  }
  return count === 1 ? 0.45 : 0.5
}

export function detectSubscriptions(
  txns: readonly Transaction[],
): SubscriptionCandidate[] {
  const byMerchant = new Map<string, Charge[]>()

  for (const txn of txns) {
    if (txn.direction !== 'expense') {
      continue
    }

    const timestamp = Date.parse(`${txn.occurredOn}T00:00:00Z`)
    if (!Number.isFinite(timestamp)) {
      continue
    }

    const key = normalizedMerchant(txn.merchant)
    if (key.length === 0) {
      continue
    }
    byMerchant.set(key, [...(byMerchant.get(key) ?? []), { txn, timestamp }])
  }

  const candidates: SubscriptionCandidate[] = []

  for (const charges of byMerchant.values()) {
    for (const cluster of clusterBySimilarAmount(charges)) {
      const cadence = detectCadence(cluster)
      const subscriptionSignal = cluster.some(({ txn }) =>
        txn.category === '구독' || classify(txn) === '구독',
      )

      if (cadence === 'unknown' && !subscriptionSignal) {
        continue
      }

      const sorted = [...cluster].sort((left, right) => left.timestamp - right.timestamp)
      const last = sorted.at(-1)
      if (!last) {
        continue
      }

      candidates.push({
        merchant: last.txn.merchant,
        amount: Math.round(
          cluster.reduce((sum, { txn }) => sum + txn.amount, 0) / cluster.length,
        ),
        cadence,
        confidence: confidenceFor(cadence, cluster.length),
        lastSeenOn: last.txn.occurredOn,
      })
    }
  }

  return candidates.sort((left, right) =>
    right.confidence - left.confidence
      || right.amount - left.amount
      || left.merchant.localeCompare(right.merchant, 'ko-KR'),
  )
}
