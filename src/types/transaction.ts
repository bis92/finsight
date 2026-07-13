export const CATEGORIES = [
  '식비',
  '카페/간식',
  '교통',
  '쇼핑',
  '구독',
  '주거',
  '공과금',
  '문화/여가',
  '의료',
  '금융',
  '교육',
  '수입',
  '기타',
] as const

export type Category = (typeof CATEGORIES)[number]

const CATEGORY_LABELS = {
  식비: '식비',
  '카페/간식': '카페/간식',
  교통: '교통',
  쇼핑: '쇼핑',
  구독: '구독',
  주거: '주거',
  공과금: '공과금',
  '문화/여가': '문화/여가',
  의료: '의료',
  금융: '금융',
  교육: '교육',
  수입: '수입',
  기타: '기타',
} satisfies Record<Category, string>

export function categoryLabel(category: Category): string {
  return CATEGORY_LABELS[category]
}

export type Direction = 'expense' | 'income'

export type Transaction = {
  id: string
  userId: string
  uploadId: string
  /** ISO 8601 calendar date in YYYY-MM-DD format. */
  occurredOn: string
  merchant: string
  /** Non-negative integer amount in KRW. Direction is represented separately. */
  amount: number
  direction: Direction
  category: Category
  raw: Record<string, unknown>
}

export type NewTransaction = Omit<Transaction, 'id' | 'userId'>

export type DateRange = {
  /** Inclusive ISO 8601 calendar date in YYYY-MM-DD format. */
  from: string
  /** Inclusive ISO 8601 calendar date in YYYY-MM-DD format. */
  to: string
}
