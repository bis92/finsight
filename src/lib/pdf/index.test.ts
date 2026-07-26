import { describe, expect, it } from 'vitest'

import {
  assertPdfBytes,
  MAX_PDF_BYTES,
  normalizeExtractedTransactions,
  PdfValidationError,
} from '@/lib/pdf'

function pdfBytes(size = 8): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set([0x25, 0x50, 0x44, 0x46], 0) // %PDF
  return bytes
}

describe('assertPdfBytes', () => {
  it('accepts bytes starting with the %PDF magic number', () => {
    expect(() => assertPdfBytes(pdfBytes())).not.toThrow()
  })

  it('rejects bytes that are not a PDF', () => {
    const notPdf = new Uint8Array([0x50, 0x4b, 0x03, 0x04]) // ZIP magic
    expect(() => assertPdfBytes(notPdf)).toThrow(PdfValidationError)
  })

  it('rejects an empty file', () => {
    expect(() => assertPdfBytes(new Uint8Array())).toThrow(PdfValidationError)
  })

  it('rejects files larger than the size limit', () => {
    const oversize = pdfBytes(MAX_PDF_BYTES + 1)
    expect(() => assertPdfBytes(oversize)).toThrow(PdfValidationError)
  })
})

describe('normalizeExtractedTransactions', () => {
  it('normalizes a well-formed extraction into unsigned-integer expense transactions', () => {
    const result = normalizeExtractedTransactions({
      transactions: [
        { occurredOn: '2026-06-01', merchant: '배달의민족', amount: 23900, direction: 'expense' },
        { occurredOn: '2026-06-03', merchant: '스타벅스', amount: 4500, direction: 'expense' },
      ],
    })

    expect(result).toEqual([
      { uploadId: '', occurredOn: '2026-06-01', merchant: '배달의민족', amount: 23900, direction: 'expense', category: '기타', raw: {} },
      { uploadId: '', occurredOn: '2026-06-03', merchant: '스타벅스', amount: 4500, direction: 'expense', category: '기타', raw: {} },
    ])
  })

  it('accepts a bare array as well as a wrapped object', () => {
    const wrapped = normalizeExtractedTransactions({ transactions: [{ occurredOn: '2026-06-01', merchant: 'A', amount: 100, direction: 'expense' }] })
    const bare = normalizeExtractedTransactions([{ occurredOn: '2026-06-01', merchant: 'A', amount: 100, direction: 'expense' }])
    expect(bare).toEqual(wrapped)
  })

  it('forces amounts to non-negative rounded integers', () => {
    const result = normalizeExtractedTransactions([
      { occurredOn: '2026-06-01', merchant: 'A', amount: -1200.6, direction: 'expense' },
    ])
    expect(result[0]?.amount).toBe(1201)
  })

  it('normalizes refunds and cancellations to income with the 수입 category', () => {
    const result = normalizeExtractedTransactions([
      { occurredOn: '2026-06-02', merchant: '스타벅스 취소', amount: 4500, direction: 'expense' },
      { occurredOn: '2026-06-05', merchant: '급여', amount: 3_000_000, direction: 'income' },
    ])
    expect(result).toEqual([
      { uploadId: '', occurredOn: '2026-06-02', merchant: '스타벅스 취소', amount: 4500, direction: 'income', category: '수입', raw: {} },
      { uploadId: '', occurredOn: '2026-06-05', merchant: '급여', amount: 3_000_000, direction: 'income', category: '수입', raw: {} },
    ])
  })

  it('drops rows with invalid dates, empty merchants, or non-positive amounts', () => {
    const result = normalizeExtractedTransactions({
      transactions: [
        { occurredOn: '2026-13-40', merchant: 'A', amount: 100, direction: 'expense' },
        { occurredOn: '2026-06-01', merchant: '   ', amount: 100, direction: 'expense' },
        { occurredOn: '2026-06-01', merchant: 'B', amount: 0, direction: 'expense' },
        { occurredOn: '2026-06-01', merchant: 'C', amount: 'x', direction: 'expense' },
        'not-an-object',
        { occurredOn: '2026-06-01', merchant: '유효', amount: 500, direction: 'expense' },
      ],
    })
    expect(result).toEqual([
      { uploadId: '', occurredOn: '2026-06-01', merchant: '유효', amount: 500, direction: 'expense', category: '기타', raw: {} },
    ])
  })

  it('trims merchant whitespace and defaults an unknown direction to expense', () => {
    const result = normalizeExtractedTransactions([
      { occurredOn: '2026-06-01', merchant: '  카페  ', amount: 3000, direction: 'weird' },
    ])
    expect(result[0]).toMatchObject({ merchant: '카페', direction: 'expense', category: '기타' })
  })

  it('returns an empty array for malformed input', () => {
    expect(normalizeExtractedTransactions(null)).toEqual([])
    expect(normalizeExtractedTransactions({})).toEqual([])
    expect(normalizeExtractedTransactions({ transactions: 'nope' })).toEqual([])
  })
})
