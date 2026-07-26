import { NextResponse } from 'next/server'

import { getDataSource } from '@/lib/env'
import { assertPdfBytes, PdfValidationError } from '@/lib/pdf'
import { getLlmService } from '@/services'

import {
  ApiRouteError,
  isRecord,
  readJson,
  resolveCurrentUserId,
  withErrorBoundary,
} from '../../_lib/server'
import { enforceLiveUploadCap } from '../../_lib/upload-guard'

// PDF extraction endpoint. Claude reads the statement PDF (server-only, secrets
// never leave the server) and returns normalized transactions the review step
// confirms before commit. The upload cap is checked here because this is where
// the LLM cost is incurred (ADR-006).
export async function POST(request: Request): Promise<Response> {
  return withErrorBoundary(async () => {
    const body = await readJson(request)
    if (
      !isRecord(body)
      || typeof body.fileName !== 'string'
      || typeof body.dataBase64 !== 'string'
      || body.dataBase64.length === 0
    ) {
      throw new ApiRouteError(400, 'PDF 업로드 요청 데이터가 유효하지 않습니다')
    }

    const userId = await resolveCurrentUserId()
    if (getDataSource() === 'live') {
      await enforceLiveUploadCap(userId, new Date())
    }

    const bytes = new Uint8Array(Buffer.from(body.dataBase64, 'base64'))
    try {
      assertPdfBytes(bytes)
    } catch (error) {
      if (error instanceof PdfValidationError) {
        throw new ApiRouteError(400, error.message)
      }
      throw error
    }

    const transactions = await getLlmService().extractTransactions({
      fileName: body.fileName,
      dataBase64: body.dataBase64,
    })
    if (transactions.length === 0) {
      throw new ApiRouteError(400, '거래 내역을 찾지 못했습니다')
    }

    return NextResponse.json(transactions)
  })
}
