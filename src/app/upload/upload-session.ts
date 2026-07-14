import type { CsvEncoding } from '@/lib/csv'
import type { ColumnMappingResult } from '@/types'

export const UPLOAD_SESSION_KEY = 'finsight:upload-draft'

export type UploadDraft = {
  fileName: string
  encoding: CsvEncoding
  headers: string[]
  rows: string[][]
  mappingResult: ColumnMappingResult
}
