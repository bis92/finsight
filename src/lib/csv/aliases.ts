import type { ColumnRole } from '@/types'

// CSV·PDF 공용 헤더 사전. 값은 화이트스페이스 제거 후 == 또는 부분포함으로 매칭한다.
// 애매한 매칭은 requiresManualMapping(신뢰도<0.75)이 수동 매핑 UX로 흡수한다.
export const HEADER_ALIASES: Record<ColumnRole, readonly string[]> = {
  date: ['이용일자', '거래일자', '승인일자', '매출일자', '거래일', '이용일', '거래일시', '이용일시', '일자', '일시'],
  merchant: ['가맹점명', '가맹점', '사용처', '이용하신곳', '상호', '적요', '거래내용', '내용'],
  amount: ['이용금액', '거래금액', '결제금액', '승인금액', '청구금액', '원화금액', '금액'],
  category: ['업종명', '업종', '카테고리', '분류'],
}

const ROLE_ORDER: readonly ColumnRole[] = ['date', 'merchant', 'amount', 'category']

export function matchColumnRole(text: string): ColumnRole | null {
  const normalized = text.replace(/\s/g, '')
  if (normalized.length === 0) {
    return null
  }
  for (const role of ROLE_ORDER) {
    if (HEADER_ALIASES[role].some((alias) => normalized === alias || normalized.includes(alias))) {
      return role
    }
  }
  return null
}

export function findHeaderIndex(headers: string[], role: ColumnRole): number | null {
  const index = headers.findIndex((header) => matchColumnRole(header) === role)
  return index === -1 ? null : index
}
