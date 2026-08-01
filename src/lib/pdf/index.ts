import type { Direction, NewTransaction } from '@/types'

/** Upper bound on accepted PDF size. Bounds PDF parse cost and request size for
 * a single-file MVP upload. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46] as const // %PDF
const INCOME_SIGNAL = /(환불|취소|입금|급여|수입)/

/** Thrown for user-correctable PDF problems (wrong type, oversize). Routes map
 * this to a 400 with the message; other errors stay internal (500). */
export class PdfValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfValidationError'
  }
}

export function assertPdfBytes(bytes: Uint8Array): void {
  if (bytes.length < PDF_MAGIC.length || PDF_MAGIC.some((byte, index) => bytes[index] !== byte)) {
    throw new PdfValidationError('PDF 파일이 아닙니다')
  }
  if (bytes.length > MAX_PDF_BYTES) {
    throw new PdfValidationError('PDF 파일이 너무 큽니다 (최대 10MB)')
  }
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false
  }
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function normalizeAmount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  const amount = Math.round(Math.abs(value))
  return amount > 0 && Number.isSafeInteger(amount) ? amount : null
}

function toRows(raw: unknown): unknown[] {
  if (Array.isArray(raw)) {
    return raw
  }
  if (typeof raw === 'object' && raw !== null && Array.isArray((raw as { transactions?: unknown }).transactions)) {
    return (raw as { transactions: unknown[] }).transactions
  }
  return []
}

/**
 * Validates and normalizes the coordinate-parser output into stored-shape
 * transactions. Amounts become unsigned integers with a separate `direction`;
 * refunds/cancellations normalize to income. Invalid rows are dropped. Category
 * is a placeholder — callers run rule-based `classifyMany` afterwards, matching
 * the CSV path.
 */
export function normalizeExtractedTransactions(raw: unknown): NewTransaction[] {
  return toRows(raw).flatMap((row): NewTransaction[] => {
    if (typeof row !== 'object' || row === null) {
      return []
    }

    const item = row as Record<string, unknown>
    const occurredOn = item.occurredOn
    const merchant = typeof item.merchant === 'string' ? item.merchant.trim() : ''
    const amount = normalizeAmount(item.amount)

    if (!isIsoDate(occurredOn) || merchant.length === 0 || amount === null) {
      return []
    }

    const direction: Direction =
      item.direction === 'income' || INCOME_SIGNAL.test(merchant) ? 'income' : 'expense'

    return [{
      uploadId: '',
      occurredOn,
      merchant,
      amount,
      direction,
      category: direction === 'income' ? '수입' : '기타',
      raw: {},
    }]
  })
}
