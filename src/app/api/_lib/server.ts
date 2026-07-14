import { NextResponse } from 'next/server'

import { CATEGORIES } from '@/types'
import type {
  Category,
  ColumnMappingResult,
  DateRange,
  NewTransaction,
} from '@/types'

export const CURRENT_USER_ID = 'mock-free-user'
export const INTERNAL_ERROR_MESSAGE = '일시적인 오류가 발생했습니다'

export class ApiRouteError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiRouteError'
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function requirePeriod(url: string): string {
  const period = new URL(url).searchParams.get('period')
  if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/u.test(period)) {
    throw new ApiRouteError(400, '기간 형식이 유효하지 않습니다')
  }
  return period
}

export function periodRange(period: string): DateRange {
  const [yearText, monthText] = period.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()

  return {
    from: `${period}-01`,
    to: `${period}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function optionalDateRange(url: string): DateRange | undefined {
  const searchParams = new URL(url).searchParams
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (from === null && to === null) {
    return undefined
  }
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
    throw new ApiRouteError(400, '조회 기간이 유효하지 않습니다')
  }
  return { from, to }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiRouteError(400, '요청 본문이 유효하지 않습니다')
  }
}

function isMapping(value: unknown): value is ColumnMappingResult['mapping'] {
  if (!isRecord(value)) {
    return false
  }

  return ['date', 'merchant', 'amount', 'category'].every((role) => {
    const index = value[role]
    return index === null || (Number.isInteger(index) && (index as number) >= 0)
  })
}

export function requireConfirmedMapping(value: unknown): ColumnMappingResult['mapping'] {
  if (!isMapping(value)) {
    throw new ApiRouteError(400, '컬럼 매핑이 유효하지 않습니다')
  }
  if (value.date === null || value.merchant === null || value.amount === null) {
    throw new ApiRouteError(400, '필수 컬럼 매핑이 누락되었습니다')
  }
  return value
}

export function requireTransactions(value: unknown): NewTransaction[] {
  if (!Array.isArray(value)) {
    throw new ApiRouteError(400, '거래 목록이 유효하지 않습니다')
  }

  const valid = value.every((transaction) =>
    isRecord(transaction)
    && typeof transaction.uploadId === 'string'
    && transaction.uploadId.length > 0
    && isIsoDate(transaction.occurredOn)
    && typeof transaction.merchant === 'string'
    && transaction.merchant.trim().length > 0
    && Number.isInteger(transaction.amount)
    && (transaction.amount as number) >= 0
    && (transaction.direction === 'expense' || transaction.direction === 'income')
    && isCategory(transaction.category)
    && isRecord(transaction.raw),
  )

  if (!valid) {
    throw new ApiRouteError(400, '거래 데이터가 유효하지 않습니다')
  }
  return value as NewTransaction[]
}

export async function withErrorBoundary(
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler()
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }

    console.error(error)
    return NextResponse.json(
      { message: INTERNAL_ERROR_MESSAGE },
      { status: 500 },
    )
  }
}
