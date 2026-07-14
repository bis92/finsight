import { NextResponse } from 'next/server'

import { getLlmService } from '@/services'

import {
  ApiRouteError,
  isRecord,
  readJson,
  withErrorBoundary,
} from '../../_lib/server'

const MAX_SAMPLE_ROWS = 20

export async function POST(request: Request): Promise<Response> {
  return withErrorBoundary(async () => {
    const body = await readJson(request)
    if (!isRecord(body)
      || !Array.isArray(body.headers)
      || !body.headers.every((header) => typeof header === 'string')
      || body.headers.length === 0
      || !Array.isArray(body.sampleRows)
      || !body.sampleRows.every((row) =>
        Array.isArray(row) && row.every((cell) => typeof cell === 'string'),
      )) {
      throw new ApiRouteError(400, '매핑 요청 데이터가 유효하지 않습니다')
    }

    const result = await getLlmService().mapColumns({
      headers: body.headers,
      sampleRows: body.sampleRows.slice(0, MAX_SAMPLE_ROWS),
      locale: 'ko-KR',
    })
    return NextResponse.json(result)
  })
}
