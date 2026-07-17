import { NextResponse } from 'next/server'

import { getAuthenticatedUserId } from '@/lib/auth/session'
import { applyMapping, decodeCsv, detectEncoding, parseCsv } from '@/lib/csv'
import { getDataSource } from '@/lib/env'
import { createSignedUploadUrl, uploadObjectPath } from '@/lib/supabase/storage'
import {
  FREE_UPLOAD_CAP_MESSAGE,
  getUtcMonthRange,
  isUploadAllowed,
} from '@/lib/upload-cap'
import { getProfileService, getTransactionsRepository, getUploadsService } from '@/services'
import { countUploadsInRange, createUpload, setUploadStatus } from '@/services/live/uploads'
import type { ColumnMappingResult } from '@/types'

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

    requireConfirmedMapping(body.mapping)
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

async function postLiveUpload(request: Request): Promise<Response> {
  return withErrorBoundary(async () => {
    const userId = await getAuthenticatedUserId()
    if (!userId) {
      throw new ApiRouteError(401, '인증이 필요합니다')
    }

    // ADR-006: 수익 게이트가 아니라 실제 LLM 비용이 발생하는 live 경로의 비용 안전장치다.
    await enforceLiveUploadCap(userId, new Date())

    const form = await readUploadForm(request)
    const mapping = requireConfirmedMapping(parseMapping(form.get('mapping')))
    const file = requireCsvFile(form.get('file'))
    const fileBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(fileBuffer)
    const filePath = uploadObjectPath(userId, crypto.randomUUID(), file.name)
    const upload = await createUpload(userId, file.name, filePath)

    try {
      await storeOriginalCsv(userId, filePath, fileBuffer, file.type)
      const { headers, rows } = parseCsv(decodeCsv(bytes, detectEncoding(bytes)))
      const transactions = applyMapping(headers, rows, mapping).map((transaction) => ({
        ...transaction,
        uploadId: upload.id,
      }))
      if (transactions.length === 0) {
        throw new Error('CSV did not contain any valid transactions')
      }

      await getTransactionsRepository().insertMany(userId, transactions)
      const completed = await setUploadStatus(userId, upload.id, 'done')
      return NextResponse.json(completed, { status: 201 })
    } catch (error) {
      console.error(error)
      try {
        await setUploadStatus(userId, upload.id, 'error', INTERNAL_ERROR_MESSAGE)
      } catch (statusError) {
        console.error(statusError)
      }
      throw error
    }
  })
}

async function enforceLiveUploadCap(userId: string, now: Date): Promise<void> {
  // Polar webhook이 갱신한 서버 profiles.plan만 신뢰한다.
  const profile = await getProfileService()(userId)
  if (profile.plan === 'pro') {
    return
  }

  const { start, end } = getUtcMonthRange(now)
  const uploadsThisMonth = await countUploadsInRange(
    userId,
    start.toISOString(),
    end.toISOString(),
  )
  if (!isUploadAllowed({ plan: profile.plan, uploadsThisMonth })) {
    throw new ApiRouteError(402, FREE_UPLOAD_CAP_MESSAGE)
  }
}

async function readUploadForm(request: Request): Promise<FormData> {
  try {
    return await request.formData()
  } catch {
    throw new ApiRouteError(400, '업로드 요청 데이터가 유효하지 않습니다')
  }
}

function parseMapping(value: FormDataEntryValue | null): unknown {
  if (typeof value !== 'string') {
    return null
  }

  try {
    return JSON.parse(value) as ColumnMappingResult['mapping']
  } catch {
    return null
  }
}

function requireCsvFile(value: FormDataEntryValue | null): File {
  if (!(value instanceof File) || !value.name.toLowerCase().endsWith('.csv')) {
    throw new ApiRouteError(400, 'CSV 파일이 필요합니다')
  }
  return value
}

async function storeOriginalCsv(
  userId: string,
  filePath: string,
  fileBuffer: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const { signedUrl } = await createSignedUploadUrl(userId, filePath)
  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'content-type': contentType || 'text/csv' },
    body: fileBuffer,
  })

  if (!response.ok) {
    throw new Error('Failed to store uploaded CSV')
  }
}
