import type { CsvEncoding } from '@/lib/csv'
import type { ColumnMappingResult, NewTransaction } from '@/types'

export const UPLOAD_SESSION_KEY = 'finsight:upload-draft'

/** CSV upload: parsed in the browser, reviewed as a column mapping. */
export type CsvUploadDraft = {
  source: 'csv'
  fileName: string
  encoding: CsvEncoding
  headers: string[]
  rows: string[][]
  mappingResult: ColumnMappingResult
}

/** PDF upload: transactions extracted server-side by Claude, reviewed as a table. */
export type PdfUploadDraft = {
  source: 'pdf'
  fileName: string
  transactions: NewTransaction[]
}

export type UploadDraft = CsvUploadDraft | PdfUploadDraft
