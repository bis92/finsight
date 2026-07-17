import type { Category } from '@/types/transaction'

export type CategoryTotal = {
  category: Category
  amount: number
  ratio: number
}

export type MerchantTotal = {
  merchant: string
  amount: number
  count: number
}

export type AggregateSnapshot = {
  period: string
  totalExpense: number
  totalIncome: number
  netExpense: number
  byCategory: CategoryTotal[]
  topMerchants: MerchantTotal[]
}

export type InsightSegment = {
  text: string
  emphasis: boolean
}

export type InsightKind = 'summary' | 'diagnosis' | 'suggestion'

export type Insight = {
  title: string
  /** Plain-text segments only. Render emphasis without interpreting HTML or Markdown. */
  segments: InsightSegment[]
  kind: InsightKind
  /** Non-negative integer amount in KRW for suggestion items. */
  savingKrw?: number
}

export type Cadence = 'monthly' | 'weekly' | 'unknown'

export type SubscriptionCandidate = {
  merchant: string
  /** Non-negative integer amount in KRW. */
  amount: number
  cadence: Cadence
  confidence: number
  /** ISO 8601 calendar date in YYYY-MM-DD format. */
  lastSeenOn: string
}
