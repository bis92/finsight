const KOREAN_NUMBER_FORMAT = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 0,
})

const KST_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function formatKrw(value: number): string {
  return `${KOREAN_NUMBER_FORMAT.format(Math.round(value))}원`
}

export function formatKstDate(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value.replaceAll('-', '.')
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('유효한 날짜를 입력해 주세요.')
  }

  const parts = KST_DATE_FORMAT.formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value

  return `${part('year')}.${part('month')}.${part('day')}`
}
