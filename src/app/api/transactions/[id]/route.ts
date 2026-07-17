import { NextResponse } from 'next/server'

import { getTransactionsRepository } from '@/services'

import {
  ApiRouteError,
  resolveCurrentUserId,
  isCategory,
  isRecord,
  readJson,
  withErrorBoundary,
} from '../../_lib/server'

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return withErrorBoundary(async () => {
    const body = await readJson(request)
    if (!isRecord(body) || !isCategory(body.category)) {
      throw new ApiRouteError(400, '카테고리가 유효하지 않습니다')
    }

    const { id } = await context.params
    if (id.length === 0) {
      throw new ApiRouteError(400, '거래 ID가 유효하지 않습니다')
    }

    const transaction = await getTransactionsRepository().reclassify(
      await resolveCurrentUserId(),
      id,
      body.category,
    )
    return NextResponse.json(transaction)
  })
}
