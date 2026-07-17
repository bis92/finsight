import { NextResponse } from 'next/server'

import { getTransactionsRepository } from '@/services'

import {
  resolveCurrentUserId,
  optionalDateRange,
  withErrorBoundary,
} from '../_lib/server'

export async function GET(request: Request): Promise<Response> {
  return withErrorBoundary(async () => {
    const range = optionalDateRange(request.url)
    const userId = await resolveCurrentUserId()
    const transactions = await getTransactionsRepository().listByUser(
      userId,
      range,
    )
    return NextResponse.json({ transactions })
  })
}
