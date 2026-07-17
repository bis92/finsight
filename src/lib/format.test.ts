import { describe, expect, it } from 'vitest'

import { formatKrw, formatKstDate } from '@/lib/format'

describe('formatKrw', () => {
  it('formats KRW with thousands separators and a won suffix', () => {
    expect(formatKrw(1234567)).toBe('1,234,567원')
  })
})

describe('formatKstDate', () => {
  it('formats an ISO calendar date as YYYY.MM.DD', () => {
    expect(formatKstDate('2026-06-01')).toBe('2026.06.01')
  })

  it('uses the Asia/Seoul timezone for instants', () => {
    expect(formatKstDate('2026-06-01T16:00:00.000Z')).toBe('2026.06.02')
  })
})
