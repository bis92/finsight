import { NextResponse } from 'next/server'

import { getTransactionsRepository } from '@/services'

import {
  CURRENT_USER_ID,
  optionalDateRange,
  withErrorBoundary,
} from '../_lib/server'

export async function GET(request: Request): Promise<Response> {
  return withErrorBoundary(async () => {
    const range = optionalDateRange(request.url)
    const transactions = await getTransactionsRepository().listByUser(
      CURRENT_USER_ID,
      range,
    )
    return NextResponse.json({ transactions })
  })
}
