import iconv from 'iconv-lite'
import { describe, expect, it } from 'vitest'

import {
  applyMapping,
  buildMappingInput,
  decodeCsv,
  detectEncoding,
  parseCsv,
  requiresManualMapping,
  resolveAmountDirection,
} from '@/lib/csv'
import type { ColumnMappingResult } from '@/types'

const mapping: ColumnMappingResult['mapping'] = {
  date: 0,
  merchant: 1,
  amount: 2,
  debit: null,
  credit: null,
  category: 3,
}

describe('resolveAmountDirection', () => {
  it('derives expense from a bank debit (출금) column', () => {
    expect(resolveAmountDirection({ debit: '4,500', credit: '' })).toEqual({ amount: 4500, direction: 'expense' })
  })

  it('derives income from a bank credit (입금) column', () => {
    expect(resolveAmountDirection({ debit: '', credit: '3,000,000' })).toEqual({ amount: 3_000_000, direction: 'income' })
  })

  it('drops a bank row where both debit and credit are empty', () => {
    expect(resolveAmountDirection({ debit: '', credit: '' })).toBeNull()
  })

  it('prefers debit (expense) when both columns carry a value', () => {
    expect(resolveAmountDirection({ debit: '1,000', credit: '2,000' })).toEqual({ amount: 1000, direction: 'expense' })
  })

  it('uses a single amount column with sign for direction', () => {
    expect(resolveAmountDirection({ amount: '(4,500)' })).toEqual({ amount: 4500, direction: 'income' })
    expect(resolveAmountDirection({ amount: '4,500' })).toEqual({ amount: 4500, direction: 'expense' })
  })

  it('reads income keywords from incomeSignalText for a single amount column', () => {
    expect(resolveAmountDirection({ amount: '3,000', incomeSignalText: '급여 이체' })).toEqual({ amount: 3000, direction: 'income' })
  })

  it('returns null when nothing resolves to a valid amount', () => {
    expect(resolveAmountDirection({ amount: '금액없음' })).toBeNull()
    expect(resolveAmountDirection({})).toBeNull()
  })
})

describe('CSV encoding', () => {
  it('detects and decodes a UTF-8 CSV with a BOM', () => {
    const bytes = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('이용일자,가맹점명\n2026.06.01,편의점', 'utf8'),
    ])

    expect(detectEncoding(bytes)).toBe('utf-8')
    expect(decodeCsv(bytes, 'utf-8')).toContain('가맹점명')
  })

  it('detects and decodes an EUC-KR CSV', () => {
    const bytes = iconv.encode('이용일자,가맹점명\n2026.06.01,편의점', 'euc-kr')

    expect(detectEncoding(bytes)).toBe('euc-kr')
    expect(decodeCsv(bytes, 'euc-kr')).toContain('편의점')
  })
})

describe('parseCsv', () => {
  it('parses quoted commas and escaped quotes while ignoring blank rows', () => {
    const parsed = parseCsv(
      '날짜,가맹점,메모\r\n2026-06-01,"카페, 봄","""쿠폰"" 사용"\r\n,,\r\n\r\n',
    )

    expect(parsed).toEqual({
      headers: ['날짜', '가맹점', '메모'],
      rows: [['2026-06-01', '카페, 봄', '"쿠폰" 사용']],
    })
  })
})

describe('buildMappingInput', () => {
  it('limits LLM mapping samples to 20 data rows without adding the header', () => {
    const headers = ['날짜', '가맹점']
    const rows = Array.from({ length: 25 }, (_, index) => [`row-${index}`, '상점'])

    const input = buildMappingInput(headers, rows)

    expect(input).toEqual({
      headers,
      sampleRows: rows.slice(0, 20),
      locale: 'ko-KR',
    })
    expect(input.sampleRows).toHaveLength(20)
    expect(input.sampleRows).not.toContainEqual(headers)
  })
})

describe('requiresManualMapping', () => {
  it('requires confirmation when confidence is below 0.75 or a required role is missing', () => {
    expect(requiresManualMapping({ mapping, confidence: 0.74, missingRequired: [] })).toBe(true)
    expect(requiresManualMapping({ mapping, confidence: 0.99, missingRequired: ['amount'] })).toBe(true)
  })

  it('allows confirmation when confidence is at least 0.75 and required roles exist', () => {
    expect(requiresManualMapping({ mapping, confidence: 0.75, missingRequired: [] })).toBe(false)
  })
})

describe('applyMapping', () => {
  it('normalizes dates, signed amounts, parentheses, and refund signals', () => {
    const rows = [
      ['2026.06.01', '일반 상점', '₩ 1,200', '식비'],
      ['2026-06-02', '카드 환불', '-1,000', '식비'],
      ['26/06/03', '매입취소', '(2,500)', '쇼핑'],
      ['2026/06/04', '<script>alert(1)</script>', '3 000원', '자유 카테고리'],
    ]

    const transactions = applyMapping(
      ['이용일자', '가맹점명', '이용금액', '업종'],
      rows,
      mapping,
    )

    expect(transactions.map(({ occurredOn, merchant, amount, direction, category }) => ({
      occurredOn,
      merchant,
      amount,
      direction,
      category,
    }))).toEqual([
      {
        occurredOn: '2026-06-01',
        merchant: '일반 상점',
        amount: 1200,
        direction: 'expense',
        category: '기타',
      },
      {
        occurredOn: '2026-06-02',
        merchant: '카드 환불',
        amount: 1000,
        direction: 'income',
        category: '수입',
      },
      {
        occurredOn: '2026-06-03',
        merchant: '매입취소',
        amount: 2500,
        direction: 'income',
        category: '수입',
      },
      {
        occurredOn: '2026-06-04',
        merchant: '<script>alert(1)</script>',
        amount: 3000,
        direction: 'expense',
        category: '기타',
      },
    ])
    expect(transactions[0]?.raw).toEqual({
      이용일자: '2026.06.01',
      가맹점명: '일반 상점',
      이용금액: '₩ 1,200',
      업종: '식비',
    })
    expect(transactions.every(({ amount }) => Number.isInteger(amount) && amount >= 0)).toBe(true)
  })

  it('skips rows whose date or amount cannot be normalized', () => {
    const transactions = applyMapping(
      ['날짜', '가맹점', '금액', '업종'],
      [
        ['not-a-date', '상점 A', '1,000', '식비'],
        ['2026-02-30', '상점 B', '2,000', '식비'],
        ['2026-06-03', '상점 C', '금액 없음', '식비'],
        ['2026-06-04', '상점 D', '4,000', '식비'],
      ],
      mapping,
    )

    expect(transactions).toHaveLength(1)
    expect(transactions[0]?.merchant).toBe('상점 D')
  })

  it('derives direction from separate 출금액/입금액 bank columns', () => {
    const bankMapping: ColumnMappingResult['mapping'] = {
      date: 0, merchant: 1, amount: null, debit: 2, credit: 3, category: null,
    }
    const transactions = applyMapping(
      ['거래일시', '적요', '출금액', '입금액', '잔액'],
      [
        ['2026-07-01', '스타벅스', '4,500', '', '120,000'],
        ['2026-07-05', '급여', '', '3,000,000', '3,120,000'],
        ['2026-07-06', '알수없음', '', '', '3,120,000'],
      ],
      bankMapping,
    )

    expect(transactions).toEqual([
      { uploadId: '', occurredOn: '2026-07-01', merchant: '스타벅스', amount: 4500, direction: 'expense', category: '기타', raw: { 거래일시: '2026-07-01', 적요: '스타벅스', 출금액: '4,500', 입금액: '', 잔액: '120,000' } },
      { uploadId: '', occurredOn: '2026-07-05', merchant: '급여', amount: 3_000_000, direction: 'income', category: '수입', raw: { 거래일시: '2026-07-05', 적요: '급여', 출금액: '', 입금액: '3,000,000', 잔액: '3,120,000' } },
    ])
  })
})
