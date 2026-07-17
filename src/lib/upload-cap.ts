import type { Plan } from '@/types'

/** ADR-006: revenue gating이 아닌 live LLM 비용 폭주 방지 안전장치다. */
export const FREE_MONTHLY_UPLOAD_CAP = 5
export const FREE_UPLOAD_CAP_MESSAGE =
  '이번 달 무료 업로드 5회를 모두 사용했습니다. Pro로 업그레이드하면 무제한입니다.'

export function isUploadAllowed(params: {
  plan: Plan
  uploadsThisMonth: number
}): boolean {
  return params.plan === 'pro' || params.uploadsThisMonth < FREE_MONTHLY_UPLOAD_CAP
}

export function getUtcMonthRange(referenceDate: Date): {
  start: Date
  end: Date
} {
  const year = referenceDate.getUTCFullYear()
  const month = referenceDate.getUTCMonth()
  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 1)),
  }
}

export function countUploadsInMonth(
  timestamps: readonly (Date | string)[],
  referenceDate: Date,
): number {
  const { start, end } = getUtcMonthRange(referenceDate)
  return timestamps.filter((timestamp) => {
    const time = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime()
    return time >= start.getTime() && time < end.getTime()
  }).length
}
