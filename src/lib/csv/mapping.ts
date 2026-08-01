import type { ColumnMappingInput, ColumnMappingResult, ColumnRole } from '@/types'

import { findHeaderIndex } from './aliases'

const REQUIRED_ROLES: readonly ColumnRole[] = ['date', 'merchant', 'amount']

export function mapColumns(input: ColumnMappingInput): ColumnMappingResult {
  const mapping = {
    date: findHeaderIndex(input.headers, 'date'),
    merchant: findHeaderIndex(input.headers, 'merchant'),
    amount: findHeaderIndex(input.headers, 'amount'),
    category: findHeaderIndex(input.headers, 'category'),
  }
  const missingRequired = REQUIRED_ROLES.filter((role) => mapping[role] === null)
  const confidence = missingRequired.length > 0
    ? 0.4
    : mapping.category === null ? 0.85 : 0.95

  return { mapping, confidence, missingRequired: [...missingRequired] }
}
