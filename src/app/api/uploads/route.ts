import { NextResponse } from 'next/server'

import { getAuthenticatedUserId } from '@/lib/auth/session'
import { getDataSource } from '@/lib/env'
import { logError } from '@/lib/observability/logger'
import { uploadObjectPath } from '@/lib/supabase/storage'
import { getTransactionsRepository, getUploadsService } from '@/services'
import { createUpload, setUploadStatus } from '@/services/live/uploads'

import { enforceLiveUploadCap } from '../_lib/upload-guard'
import {
  ApiRouteError,
  INTERNAL_ERROR_MESSAGE,
  resolveCurrentUserId,
  isRecord,
  readJson,
  requireConfirmedMapping,
  requireTransactions,
  withErrorBoundary,
} from '../_lib/server'

export async function POST(request: Request): Promise<Response> {
  if (getDataSource() === 'live') {
    return postLiveUpload(request)
  }

  return postMockUpload(request)
}

async function postMockUpload(request: Request): Promise<Response> {
  return withErrorBoundary(async () => {
    const body = await readJson(request)
    if (!isRecord(body)) {
      throw new ApiRouteError(400, '업로드 요청 데이터가 유효하지 않습니다')
    }

    // PDF uploads carry Claude-extracted transactions and have no column mapping;
    // CSV uploads must present a confirmed mapping.
    if (body.source !== 'pdf') {
      requireConfirmedMapping(body.mapping)
    }
    const userId = await resolveCurrentUserId()
    const uploads = await getUploadsService()(userId)
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
    await getTransactionsRepository().insertMany(userId, transactions)

    return NextResponse.json(upload, { status: 201 })
  })
}

// 클라이언트는 CSV·PDF 모두 브라우저/서버 추출을 거친 거래를 JSON으로 보낸다
// (CSV는 확인된 mapping 동반, PDF는 /extract가 서버에서 이미 추출). 여기서는 upload
// 레코드를 만들고 RLS 생임자 클라이언트로 거래를 insert한다. 원본 파일 Storage
// 보관은 후속 과제(로드맵) — 현재 클라이언트 세션은 원본 바이트를 보관하지 않는다.
async function postLiveUpload(request: Request): Promise<Response> {
  return withErrorBoundary(async () => {
    const userId = await getAuthenticatedUserId()
    if (!userId) {
      throw new ApiRouteError(401, '인증이 필요합니다')
    }

    const body = await readJson(request)
    if (!isRecord(body)) {
      throw new ApiRouteError(400, '업로드 요청 데이터가 유효하지 않습니다')
    }

    // PDF는 컬럼 매핑이 없다. CSV는 확인된 매핑이 있어야 한다.
    if (body.source !== 'pdf') {
      requireConfirmedMapping(body.mapping)
    }

    // ADR-006: 수익 게이트가 아니라 실제 LLM 비용이 발생하는 live 경로의 비용 안전장치다.
    await enforceLiveUploadCap(userId, new Date())

    const originalName = typeof body.fileName === 'string' && body.fileName.length > 0
      ? body.fileName
      : body.source === 'pdf' ? 'statement.pdf' : 'upload.csv'
    const filePath = uploadObjectPath(userId, crypto.randomUUID(), originalName)
    const upload = await createUpload(userId, originalName, filePath)

    try {
      const submitted = Array.isArray(body.transactions)
        ? body.transactions.map((transaction) => isRecord(transaction)
          ? { ...transaction, uploadId: upload.id }
          : transaction)
        : body.transactions
      const transactions = requireTransactions(submitted)

      await getTransactionsRepository().insertMany(userId, transactions)
      const completed = await setUploadStatus(userId, upload.id, 'done')
      return NextResponse.json(completed, { status: 201 })
    } catch (error) {
      console.error(error)
      try {
        await setUploadStatus(userId, upload.id, 'error', INTERNAL_ERROR_MESSAGE)
      } catch (statusError) {
        await logError('Upload status update failed', { error: statusError, route: '/api/uploads', method: 'POST' })
      }
      throw error
    }
  })
}
