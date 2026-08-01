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

  // 실제 카드사 명세서는 인식되는 컬럼(이용일·이용금액·이용하신곳) 사이에
  // 인식 못 하는 컬럼(카드번호·취소여부·결제방법·사업자번호·과세유형)이 낀다.
  // 밴드 경계가 인식된 라벨만으로 계산되면 인접 컬럼 값이 셀에 섞여 전부 드롭된다.
  it('ignores unrecognized columns wedged between recognized ones', () => {
    const wideHeader: TextItem[] = [
      { str: '이용일', x: 59, y: 660 },
      { str: '카드번호', x: 134, y: 660 },
      { str: '취소여부', x: 204, y: 660 },
      { str: '결제방법', x: 254, y: 660 },
      { str: '이용금액', x: 311, y: 660 },
      { str: '이용하신곳', x: 371, y: 660 },
      { str: '사업자번호', x: 435, y: 660 },
      { str: '과세유형', x: 502, y: 660 },
    ]
    const wideRow: TextItem[] = [
      { str: '2026-07-01', x: 48, y: 632 },
      { str: '6258-04**-****-6036', x: 105, y: 632 },
      { str: '정상', x: 212, y: 632 },
      { str: '일시불', x: 258, y: 632 },
      { str: '600', x: 319, y: 632 },
      { str: '아이스무빙(봉천점)', x: 357, y: 632 },
      { str: '7773101646', x: 429, y: 632 },
      { str: '일반과세자', x: 499, y: 632 },
    ]

    expect(extractRowsToTransactions([wideHeader, wideRow])).toEqual([
      { uploadId: '', occurredOn: '2026-07-01', merchant: '아이스무빙(봉천점)', amount: 600, direction: 'expense', category: '기타', raw: {} },
    ])
  })

  // 은행 거래내역은 출금액/입금액이 분리된 컬럼이다. direction은 어느 컬럼이
  // 채워졌는지로 결정된다(입금 상대방 이름에 수입 키워드가 없어도 income).
  it('derives direction from separate 출금액/입금액 columns in a bank statement', () => {
    const bankHeader: TextItem[] = [
      { str: '거래일시', x: 50, y: 700 },
      { str: '적요', x: 150, y: 700 },
      { str: '출금액', x: 250, y: 700 },
      { str: '입금액', x: 350, y: 700 },
      { str: '잔액', x: 450, y: 700 },
    ]
    const withdrawalRow: TextItem[] = [
      { str: '2026-07-01', x: 48, y: 680 },
      { str: '스타벅스', x: 150, y: 680 },
      { str: '4,500', x: 255, y: 680 },
      { str: '120,000', x: 455, y: 680 },
    ]
    const depositRow: TextItem[] = [
      { str: '2026-07-05', x: 48, y: 660 },
      { str: '홍길동', x: 150, y: 660 },
      { str: '3,000,000', x: 350, y: 660 },
      { str: '3,120,000', x: 455, y: 660 },
    ]

    expect(extractRowsToTransactions([bankHeader, withdrawalRow, depositRow])).toEqual([
      { uploadId: '', occurredOn: '2026-07-01', merchant: '스타벅스', amount: 4500, direction: 'expense', category: '기타', raw: {} },
      { uploadId: '', occurredOn: '2026-07-05', merchant: '홍길동', amount: 3_000_000, direction: 'income', category: '수입', raw: {} },
    ])
  })
})
