export type ColumnRole = 'date' | 'merchant' | 'amount' | 'category'

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
