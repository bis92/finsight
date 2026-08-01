import type {
  ColumnMappingInput,
  ColumnMappingResult,
  Direction,
  NewTransaction,
} from '@/types'

export type CsvEncoding = 'utf-8' | 'euc-kr'

const UTF8_BOM = [0xef, 0xbb, 0xbf] as const
const INCOME_SIGNAL = /(환불|취소|입금|급여|수입)/

export function detectEncoding(bytes: Uint8Array): CsvEncoding {
  if (UTF8_BOM.every((byte, index) => bytes[index] === byte)) {
    return 'utf-8'
  }

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return 'utf-8'
  } catch {
    return 'euc-kr'
  }
}

export function decodeCsv(
  bytes: Uint8Array,
  encoding: CsvEncoding,
): string {
  if (encoding === 'utf-8') {
    return new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '')
  }

  return new TextDecoder('euc-kr').decode(bytes).replace(/^\uFEFF/, '')
}

function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === '')
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const records: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const pushRow = () => {
    row.push(cell)
    if (!isBlankRow(row)) {
      records.push(row)
    }
    row = []
    cell = ''
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += character
      }
      continue
    }

    if (character === '"' && cell.length === 0) {
      inQuotes = true
    } else if (character === ',') {
      row.push(cell)
      cell = ''
    } else if (character === '\n') {
      pushRow()
    } else if (character !== '\r') {
      cell += character
    }
  }

  if (cell.length > 0 || row.length > 0) {
    pushRow()
  }

  const [headerRow = [], ...rows] = records
  const headers = headerRow.map((header, index) =>
    index === 0 ? header.replace(/^\uFEFF/, '') : header,
  )

  return { headers, rows }
}

export function buildMappingInput(
  headers: string[],
  rows: string[][],
  locale: ColumnMappingInput['locale'] = 'ko-KR',
): ColumnMappingInput {
  return {
    headers,
    sampleRows: rows.slice(0, 20),
    locale,
  }
}

export function requiresManualMapping(result: ColumnMappingResult): boolean {
  return result.confidence < 0.75 || result.missingRequired.length > 0
}

export function normalizeDate(value: string): string | null {
  const match = value.trim().match(/^(\d{2}|\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (!match) {
    return null
  }

  const [, yearPart, monthPart, dayPart] = match
  const year = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart)
  const month = Number(monthPart)
  const day = Number(dayPart)
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function normalizeAmount(value: string): { amount: number; isCredit: boolean } | null {
  const trimmed = value.trim()
  const parenthesized = /^\(.*\)$/.test(trimmed)
  const negative = /-/.test(trimmed)
  const digits = trimmed
    .replace(/^\((.*)\)$/, '$1')
    .replace(/[₩원,\s]/g, '')
    .replace(/^[+-]/, '')

  if (!/^\d+$/.test(digits)) {
    return null
  }

  const amount = Number(digits)
  if (!Number.isSafeInteger(amount)) {
    return null
  }

  return { amount, isCredit: parenthesized || negative }
}

/**
 * 셀 값에서 금액(부호 없는 정수)과 direction을 도출하는 단일 진실 원천.
 * CSV(applyMapping)와 PDF(extractRowsToTransactions) 양쪽이 공유한다.
 *
 * - debit/credit(은행 이중 컬럼)이 하나라도 있으면 그것으로 판정: credit만 → income,
 *   debit → expense(둘 다 값이 있으면 debit=expense 우선), 둘 다 무효 → null.
 * - 없으면 amount 단일 컬럼: 부호(괄호/음수) 또는 incomeSignalText의 수입 키워드로 direction.
 */
export function resolveAmountDirection(cells: {
  amount?: string
  debit?: string
  credit?: string
  incomeSignalText?: string
}): { amount: number; direction: Direction } | null {
  const debit = cells.debit ? normalizeAmount(cells.debit) : null
  const credit = cells.credit ? normalizeAmount(cells.credit) : null

  if (debit || credit) {
    if (debit) {
      return { amount: debit.amount, direction: 'expense' }
    }
    return { amount: credit!.amount, direction: 'income' }
  }

  const single = cells.amount ? normalizeAmount(cells.amount) : null
  if (!single) {
    return null
  }
  const direction: Direction =
    single.isCredit || (cells.incomeSignalText ? INCOME_SIGNAL.test(cells.incomeSignalText) : false)
      ? 'income'
      : 'expense'
  return { amount: single.amount, direction }
}

function buildRaw(headers: string[], row: string[]): Record<string, unknown> {
  return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
}

function hasUsableIndex(index: number | null, headers: string[]): index is number {
  return index !== null && Number.isInteger(index) && index >= 0 && index < headers.length
}

export function applyMapping(
  headers: string[],
  rows: string[][],
  mapping: ColumnMappingResult['mapping'],
): NewTransaction[] {
  const { date: dateIndex, merchant: merchantIndex } = mapping
  const amountIndex = hasUsableIndex(mapping.amount, headers) ? mapping.amount : null
  const debitIndex = hasUsableIndex(mapping.debit, headers) ? mapping.debit : null
  const creditIndex = hasUsableIndex(mapping.credit, headers) ? mapping.credit : null

  if (
    !hasUsableIndex(dateIndex, headers) ||
    !hasUsableIndex(merchantIndex, headers) ||
    (amountIndex === null && debitIndex === null && creditIndex === null)
  ) {
    return []
  }

  const cellAt = (row: string[], index: number | null): string | undefined =>
    index === null ? undefined : row[index]

  return rows.flatMap((row): NewTransaction[] => {
    const occurredOn = normalizeDate(row[dateIndex] ?? '')
    if (!occurredOn) {
      return []
    }

    const resolved = resolveAmountDirection({
      amount: cellAt(row, amountIndex),
      debit: cellAt(row, debitIndex),
      credit: cellAt(row, creditIndex),
      incomeSignalText: row.join(' '),
    })
    if (!resolved) {
      return []
    }

    return [{
      uploadId: '',
      occurredOn,
      merchant: row[merchantIndex] ?? '',
      amount: resolved.amount,
      direction: resolved.direction,
      category: resolved.direction === 'income' ? '수입' : '기타',
      raw: buildRaw(headers, row),
    }]
  })
}
