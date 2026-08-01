import { describe, expect, it } from 'vitest'

import {
  detectColumns,
  extractRowsToTransactions,
  groupIntoRows,
  type TextItem,
} from './extract'

// PDF 좌표는 y가 클수록 위쪽. 헤더(y=700) 아래로 데이터 행들이 이어진다.
const header: TextItem[] = [
  { str: '이용일자', x: 50, y: 700 },
  { str: '가맹점', x: 150, y: 700 },
  { str: '이용금액', x: 300, y: 700 },
]
const expenseRow: TextItem[] = [
  { str: '2026.06.02', x: 50, y: 680 },
  { str: '배달의민족', x: 150, y: 680 },
  { str: '23,900', x: 300, y: 680 },
]
const incomeRow: TextItem[] = [
  { str: '2026.06.25', x: 48, y: 640 },
  { str: '급여', x: 150, y: 640 },
  { str: '3,200,000', x: 305, y: 640 },
]
const summaryRow: TextItem[] = [
  { str: '합계', x: 150, y: 620 },
  { str: '28,400', x: 300, y: 620 },
]

describe('groupIntoRows', () => {
  it('groups items by y-band top-to-bottom and sorts each row left-to-right', () => {
    const shuffled = [expenseRow[2], header[1], expenseRow[0], header[0], header[2], expenseRow[1]]
    const rows = groupIntoRows(shuffled)

    expect(rows).toEqual([header, expenseRow])
  })
})

describe('detectColumns', () => {
  it('builds anchors when date, merchant, and amount are present', () => {
    const columns = detectColumns(header)

    expect(columns).not.toBeNull()
    expect(columns?.map((column) => column.role)).toEqual(['date', 'merchant', 'amount'])
  })

  it('returns null when a required role is missing', () => {
    expect(detectColumns([{ str: '가맹점', x: 10, y: 700 }, { str: '이용금액', x: 100, y: 700 }])).toBeNull()
  })
})

describe('extractRowsToTransactions', () => {
  it('parses data rows, drops summary rows, and normalizes direction/category', () => {
    const result = extractRowsToTransactions([header, expenseRow, incomeRow, summaryRow])

    expect(result).toEqual([
      { uploadId: '', occurredOn: '2026-06-02', merchant: '배달의민족', amount: 23_900, direction: 'expense', category: '기타', raw: {} },
      { uploadId: '', occurredOn: '2026-06-25', merchant: '급여', amount: 3_200_000, direction: 'income', category: '수입', raw: {} },
    ])
  })

  it('returns an empty array when no header row is found', () => {
    expect(extractRowsToTransactions([expenseRow, incomeRow])).toEqual([])
  })
})
