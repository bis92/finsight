import type { ColumnRole } from '@/types'

// CSV·PDF 공용 헤더 사전. 값은 화이트스페이스 제거 후 == 또는 부분포함으로 매칭한다.
// 애매한 매칭은 requiresManualMapping(신뢰도<0.75)이 수동 매핑 UX로 흡수한다.
export const HEADER_ALIASES: Record<ColumnRole, readonly string[]> = {
  date: ['이용일자', '거래일자', '승인일자', '매출일자', '거래일', '이용일', '승인일', '거래일시', '이용일시', '거래일자및시간', '일자', '일시'],
  merchant: ['가맹점명', '가맹점', '사용처', '이용하신곳', '상호', '적요', '거래내용', '기재내용', '내용', '보내는분/받는분'],
  debit: ['출금액', '출금금액', '출금', '인출금액', '인출', '지급액', '보낸금액'],
  credit: ['입금액', '입금금액', '입금', '예치금액', '예치', '받은금액'],
  amount: ['이용금액', '거래금액', '결제금액', '승인금액', '청구금액', '원화금액', '금액'],
  category: ['업종명', '업종', '카테고리', '분류'],
}

// debit/credit은 amount보다 먼저 검사해야 한다. '출금액'·'입금액'은 '금액'(amount)
// 별칭을 substring으로 포함하므로, 순서가 뒤바뀌면 은행 이중 컬럼이 amount로 잘못 잡힌다.
const ROLE_ORDER: readonly ColumnRole[] = ['date', 'merchant', 'debit', 'credit', 'amount', 'category']

// 필수: date·merchant + 금액을 나르는 role(amount|debit|credit) 최소 하나.
const CORE_REQUIRED_ROLES: readonly ColumnRole[] = ['date', 'merchant']
const AMOUNT_ROLES: readonly ColumnRole[] = ['amount', 'debit', 'credit']

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

export function hasRequiredRoles(present: Set<ColumnRole>): boolean {
  return CORE_REQUIRED_ROLES.every((role) => present.has(role))
    && AMOUNT_ROLES.some((role) => present.has(role))
}

/** UI·매핑 검증 공용. 부족한 필수 role 목록. 금액 role이 전무하면 대표로 'amount'를 보고한다. */
export function missingRequiredRoles(mapping: Record<ColumnRole, number | null>): ColumnRole[] {
  const missing: ColumnRole[] = []
  for (const role of CORE_REQUIRED_ROLES) {
    if (mapping[role] === null) {
      missing.push(role)
    }
  }
  if (AMOUNT_ROLES.every((role) => mapping[role] === null)) {
    missing.push('amount')
  }
  return missing
}

export function findHeaderIndex(headers: string[], role: ColumnRole): number | null {
  const index = headers.findIndex((header) => matchColumnRole(header) === role)
  return index === -1 ? null : index
}
