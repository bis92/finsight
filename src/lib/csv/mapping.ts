import type { ColumnMappingInput, ColumnMappingResult } from '@/types'

import { findHeaderIndex, missingRequiredRoles } from './aliases'

export function mapColumns(input: ColumnMappingInput): ColumnMappingResult {
  const mapping = {
    date: findHeaderIndex(input.headers, 'date'),
    merchant: findHeaderIndex(input.headers, 'merchant'),
    amount: findHeaderIndex(input.headers, 'amount'),
    debit: findHeaderIndex(input.headers, 'debit'),
    credit: findHeaderIndex(input.headers, 'credit'),
    category: findHeaderIndex(input.headers, 'category'),
  }
  const missingRequired = missingRequiredRoles(mapping)
  const confidence = missingRequired.length > 0
    ? 0.4
    : mapping.category === null ? 0.85 : 0.95

  return { mapping, confidence, missingRequired }
}
