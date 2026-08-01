import { getDocumentProxy } from 'unpdf'

import { matchColumnRole } from '@/lib/csv/aliases'
import { normalizeAmount, normalizeDate } from '@/lib/csv'
import { normalizeExtractedTransactions } from '@/lib/pdf'
import type { ColumnRole, Direction, NewTransaction, PdfExtractionInput } from '@/types'

export type TextItem = { str: string; x: number; y: number }
export type ColumnAnchor = { role: ColumnRole; lo: number; hi: number }

const Y_TOLERANCE = 3
const REQUIRED_ROLES: readonly ColumnRole[] = ['date', 'merchant', 'amount']

export function groupIntoRows(items: TextItem[], yTolerance = Y_TOLERANCE): TextItem[][] {
  const rows: TextItem[][] = []
  for (const item of [...items].sort((left, right) => right.y - left.y)) {
    const row = rows.at(-1)
    if (row && Math.abs(row[0].y - item.y) <= yTolerance) {
      row.push(item)
    } else {
      rows.push([item])
    }
  }
  return rows.map((row) => [...row].sort((left, right) => left.x - right.x))
}

export function detectColumns(row: TextItem[]): ColumnAnchor[] | null {
  const matched: Array<{ role: ColumnRole; x: number }> = []
  const seen = new Set<ColumnRole>()
  for (const item of [...row].sort((left, right) => left.x - right.x)) {
    const role = matchColumnRole(item.str)
    if (role && !seen.has(role)) {
      seen.add(role)
      matched.push({ role, x: item.x })
    }
  }
  if (!REQUIRED_ROLES.every((role) => seen.has(role))) {
    return null
  }

  const sorted = matched.sort((left, right) => left.x - right.x)
  return sorted.map((column, index) => {
    const previous = sorted[index - 1]
    const next = sorted[index + 1]
    return {
      role: column.role,
      lo: previous ? (previous.x + column.x) / 2 : Number.NEGATIVE_INFINITY,
      hi: next ? (column.x + next.x) / 2 : Number.POSITIVE_INFINITY,
    }
  })
}

export function rowToCells(row: TextItem[], columns: ColumnAnchor[]): Partial<Record<ColumnRole, string>> {
  const cells: Partial<Record<ColumnRole, string>> = {}
  for (const item of [...row].sort((left, right) => left.x - right.x)) {
    const column = columns.find(({ lo, hi }) => item.x >= lo && item.x < hi)
    if (column) {
      cells[column.role] = (cells[column.role] ?? '') + item.str
    }
  }
  return cells
}

export function extractRowsToTransactions(rows: TextItem[][]): NewTransaction[] {
  let columns: ColumnAnchor[] | null = null
  const extracted: Array<{ occurredOn: string; merchant: string; amount: number; direction: Direction }> = []

  for (const row of rows) {
    if (!columns) {
      columns = detectColumns(row)
      continue
    }

    const cells = rowToCells(row, columns)
    const occurredOn = normalizeDate(cells.date ?? '')
    const amount = normalizeAmount(cells.amount ?? '')
    const merchant = (cells.merchant ?? '').trim()
    if (!occurredOn || !amount || merchant.length === 0) {
      continue
    }

    extracted.push({
      occurredOn,
      merchant,
      amount: amount.amount,
      direction: amount.isCredit ? 'income' : 'expense',
    })
  }

  if (!columns) {
    return []
  }
  return normalizeExtractedTransactions({ transactions: extracted })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isTextItem(item: any): item is { str: string; transform: number[] } {
  return typeof item?.str === 'string' && Array.isArray(item?.transform)
}

export async function extractTransactions(input: PdfExtractionInput): Promise<NewTransaction[]> {
  const bytes = new Uint8Array(Buffer.from(input.dataBase64, 'base64'))
  const pdf = await getDocumentProxy(bytes)

  const rows: TextItem[][] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const items: TextItem[] = []
    for (const item of content.items) {
      if (isTextItem(item) && item.str.trim() !== '') {
        items.push({ str: item.str, x: item.transform[4], y: item.transform[5] })
      }
    }
    rows.push(...groupIntoRows(items))
  }

  return extractRowsToTransactions(rows)
}
