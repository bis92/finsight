import type { Insight, Cadence } from '@/types/analysis'
import type { Plan } from '@/types/plan'
import type { Category, Direction } from '@/types/transaction'
import type { UploadStatus } from '@/types/upload'

export type ProfileRow = {
  id: string
  plan: Plan
  polar_subscription_id: string | null
  polar_customer_id: string | null
  created_at: string
}

export type UploadRow = {
  id: string
  user_id: string
  file_path: string
  original_name: string
  status: UploadStatus
  error_message: string | null
  created_at: string
}

export type TransactionRow = {
  id: string
  user_id: string
  upload_id: string
  occurred_on: string
  merchant: string
  /** Non-negative integer amount in KRW. Direction is represented separately. */
  amount: number
  direction: Direction
  category: Category
  raw: Record<string, unknown>
}

export type AnalysisRow = {
  id: string
  user_id: string
  period: string
  summary: string | null
  insights: Insight[]
  created_at: string
}

export type SubscriptionRow = {
  id: string
  user_id: string
  merchant: string
  /** Non-negative integer amount in KRW. */
  amount: number
  cadence: Cadence
  confidence: number
  last_seen_on: string
}

type Table<Row> = {
  Row: Row
  Insert: Partial<Row>
  Update: Partial<Row>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow>
      uploads: Table<UploadRow>
      transactions: Table<TransactionRow>
      analyses: Table<AnalysisRow>
      subscriptions: Table<SubscriptionRow>
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: {
      plan_enum: Plan
      direction_enum: Direction
      upload_status_enum: UploadStatus
      category_enum: Category
      cadence_enum: Cadence
    }
    CompositeTypes: Record<never, never>
  }
}
