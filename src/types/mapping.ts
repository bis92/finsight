// amount = 카드 단일 금액 컬럼. debit/credit = 은행 거래내역의 출금액/입금액 분리 컬럼.
// 한 포맷은 amount 또는 debit/credit 중 하나를 쓴다(둘 다 필수는 아님).
export type ColumnRole = 'date' | 'merchant' | 'amount' | 'debit' | 'credit' | 'category'

export type ColumnMappingInput = {
  headers: string[]
  /** Data rows only, excluding headers. Callers must limit this to at most 20 rows. */
  sampleRows: string[][]
  locale: 'ko-KR'
}

export type ColumnMappingResult = {
  /** Header index for each role, or null when no column was identified. */
  mapping: Record<ColumnRole, number | null>
  confidence: number
  missingRequired: ColumnRole[]
}
