import { afterEach, describe, expect, it, vi } from 'vitest'

import { currentKstPeriod, formatKrw, formatKstDate, formatPeriodLabel } from '@/lib/format'

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

describe('formatPeriodLabel', () => {
  it('renders a YYYY-MM period as a Korean year·month label', () => {
    expect(formatPeriodLabel('2026-07')).toBe('2026년 7월')
    expect(formatPeriodLabel('2026-12')).toBe('2026년 12월')
  })
})

describe('currentKstPeriod', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the current YYYY-MM in the Asia/Seoul timezone', () => {
    vi.useFakeTimers()
    // 2026-07-31T20:00Z 는 KST(+9)로 2026-08-01 → 8월로 잡혀야 함
    vi.setSystemTime(new Date('2026-07-31T20:00:00.000Z'))
    expect(currentKstPeriod()).toBe('2026-08')
  })
})
