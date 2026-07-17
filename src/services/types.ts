import type {
  AggregateSnapshot,
  Category,
  ColumnMappingInput,
  ColumnMappingResult,
  DateRange,
  Insight,
  NewTransaction,
  Plan,
  SubscriptionCandidate,
  Transaction,
} from '@/types'

export interface TransactionsRepository {
  listByUser(userId: string, range?: DateRange): Promise<Transaction[]>
  insertMany(userId: string, txns: NewTransaction[]): Promise<{ inserted: number }>
  reclassify(userId: string, txnId: string, category: Category): Promise<Transaction>
}

export interface LlmService {
  mapColumns(input: ColumnMappingInput): Promise<ColumnMappingResult>
  generateInsights(agg: AggregateSnapshot, plan: Plan): Promise<Insight[]>
  detectSubscriptions(txns: Transaction[]): Promise<SubscriptionCandidate[]>
}
