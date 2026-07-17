import { describe, expect, it } from 'vitest'

import {
  FREE_MONTHLY_UPLOAD_CAP,
  countUploadsInMonth,
  isUploadAllowed,
} from './upload-cap'

describe('upload cap policy', () => {
  it('always allows Pro uploads regardless of count', () => {
    expect(isUploadAllowed({ plan: 'pro', uploadsThisMonth: 5 })).toBe(true)
    expect(isUploadAllowed({ plan: 'pro', uploadsThisMonth: 500 })).toBe(true)
  })

  it('allows Free below five and blocks at or above five', () => {
    expect(isUploadAllowed({ plan: 'free', uploadsThisMonth: FREE_MONTHLY_UPLOAD_CAP - 1 })).toBe(true)
    expect(isUploadAllowed({ plan: 'free', uploadsThisMonth: FREE_MONTHLY_UPLOAD_CAP })).toBe(false)
    expect(isUploadAllowed({ plan: 'free', uploadsThisMonth: FREE_MONTHLY_UPLOAD_CAP + 1 })).toBe(false)
  })

  it('counts only uploads in the reference UTC calendar month', () => {
    const timestamps = [
      '2026-05-31T23:59:59.999Z',
      '2026-06-01T00:00:00.000Z',
      '2026-06-15T12:00:00.000Z',
      '2026-06-30T23:59:59.999Z',
      '2026-07-01T00:00:00.000Z',
    ]

    expect(countUploadsInMonth(timestamps, new Date('2026-06-17T09:00:00.000Z'))).toBe(3)
  })
})
