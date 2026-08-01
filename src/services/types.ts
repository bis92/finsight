import type {
  AggregateSnapshot,
  Category,
  DateRange,
  Insight,
  NewTransaction,
  SubscriptionCandidate,
  Transaction,
} from '@/types'

export interface TransactionsRepository {
  listByUser(userId: string, range?: DateRange): Promise<Transaction[]>
  insertMany(userId: string, txns: NewTransaction[]): Promise<{ inserted: number }>
  reclassify(userId: string, txnId: string, category: Category): Promise<Transaction>
}

export interface LlmService {
  /** Pro-only deep insights via Opus. Free insights are built in lib/analysis/insights. */
  generateProInsights(agg: AggregateSnapshot): Promise<Insight[]>
  detectSubscriptions(txns: Transaction[]): Promise<SubscriptionCandidate[]>
}
