import { NextResponse } from 'next/server'

import { getTransactionsRepository, getUploadsService } from '@/services'

import {
  ApiRouteError,
  CURRENT_USER_ID,
  isRecord,
  readJson,
  requireConfirmedMapping,
  requireTransactions,
  withErrorBoundary,
} from '../_lib/server'

export async function POST(request: Request): Promise<Response> {
  return withErrorBoundary(async () => {
    const body = await readJson(request)
    if (!isRecord(body)) {
      throw new ApiRouteError(400, '업로드 요청 데이터가 유효하지 않습니다')
    }

    requireConfirmedMapping(body.mapping)
    const uploads = await getUploadsService()(CURRENT_USER_ID)
    const upload = uploads[0]
    if (!upload) {
      throw new Error('Upload was not found before inserting transactions')
    }
    const submitted = Array.isArray(body.transactions)
      ? body.transactions.map((transaction) => isRecord(transaction)
        ? { ...transaction, uploadId: upload.id }
        : transaction)
      : body.transactions
    const transactions = requireTransactions(submitted)
    await getTransactionsRepository().insertMany(CURRENT_USER_ID, transactions)

    return NextResponse.json(upload, { status: 201 })
  })
}
