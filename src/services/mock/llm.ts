// Server-only data implementation. Import through src/services/index.ts from Route Handlers.
import 'server-only'

import { detectSubscriptions } from '@/lib/analysis'
import type {
  AggregateSnapshot,
  ColumnMappingInput,
  ColumnMappingResult,
  Insight,
} from '@/types'

import type { LlmService } from '../types'

const HEADER_ALIASES = {
  date: ['이용일자', '거래일', '거래일자', '승인일자'],
  merchant: ['가맹점명', '가맹점', '사용처', '적요'],
  amount: ['이용금액', '거래금액', '결제금액', '원화금액'],
  category: ['업종', '카테고리', '업종명'],
} as const

const REQUIRED_ROLES = ['date', 'merchant', 'amount'] as const

function findHeader(headers: string[], aliases: readonly string[]): number | null {
  const index = headers.findIndex((header) => aliases.includes(header.trim()))
  return index === -1 ? null : index
}

function mapColumns(input: ColumnMappingInput): ColumnMappingResult {
  const mapping = {
    date: findHeader(input.headers, HEADER_ALIASES.date),
    merchant: findHeader(input.headers, HEADER_ALIASES.merchant),
    amount: findHeader(input.headers, HEADER_ALIASES.amount),
    category: findHeader(input.headers, HEADER_ALIASES.category),
  }
  const missingRequired = REQUIRED_ROLES.filter((role) => mapping[role] === null)

  return {
    mapping,
    confidence: missingRequired.length > 0 ? 0.4 : mapping.category === null ? 0.91 : 0.74,
    missingRequired: [...missingRequired],
  }
}

function won(amount: number): string {
  return amount.toLocaleString('ko-KR')
}

function topCategoryInsight(agg: AggregateSnapshot): Insight {
  const top = agg.byCategory[0]
  if (!top) {
    return {
      title: '카테고리 요약',
      kind: 'summary',
      segments: [{ text: '분석할 지출 내역이 없습니다.', emphasis: false }],
    }
  }

  return {
    title: '가장 큰 지출',
    kind: 'summary',
    segments: [
      { text: `${top.category} 지출이 `, emphasis: false },
      { text: `${won(top.amount)}원`, emphasis: true },
      { text: `으로 전체 지출의 ${Math.round(top.ratio * 100)}%입니다.`, emphasis: false },
    ],
  }
}

function freeInsights(agg: AggregateSnapshot): Insight[] {
  return [
    {
      title: `${agg.period} 소비 요약`,
      kind: 'summary',
      segments: [
        { text: '총지출은 ', emphasis: false },
        { text: `${won(agg.totalExpense)}원`, emphasis: true },
        { text: `이고 총수입은 ${won(agg.totalIncome)}원입니다.`, emphasis: false },
      ],
    },
    topCategoryInsight(agg),
  ]
}

function proInsights(agg: AggregateSnapshot): Insight[] {
  const fixedExpense = agg.byCategory
    .filter(({ category }) => ['주거', '구독', '공과금'].includes(category))
    .reduce((sum, { amount }) => sum + amount, 0)
  const variableExpense = agg.totalExpense - fixedExpense
  const top = agg.byCategory[0]
  const topSaving = Math.round((top?.amount ?? 0) * 0.1)

  return [
    {
      title: '현금 흐름 진단',
      kind: 'diagnosis',
      segments: [
        { text: '이번 달 총지출은 ', emphasis: false },
        { text: `${won(agg.totalExpense)}원`, emphasis: true },
        { text: `이며 수입 대비 순지출은 ${won(agg.netExpense)}원입니다.`, emphasis: false },
      ],
    },
    {
      title: '고정비 진단',
      kind: 'diagnosis',
      segments: [
        { text: `고정비는 ${won(fixedExpense)}원이고, 조정 가능한 변동비는 `, emphasis: false },
        { text: `${won(variableExpense)}원`, emphasis: true },
        { text: '입니다.', emphasis: false },
      ],
    },
    {
      title: '상위 카테고리 점검',
      kind: 'suggestion',
      savingKrw: topSaving,
      segments: [{
        text: `${top?.category ?? '주요 카테고리'} 지출을 10% 줄이면 월 ${won(topSaving)}원을 절감할 수 있습니다.`,
        emphasis: false,
      }],
    },
    {
      title: '고정비 재검토',
      kind: 'suggestion',
      savingKrw: Math.round(fixedExpense * 0.05),
      segments: [{
        text: `고정비 ${won(fixedExpense)}원 중 사용하지 않는 구독과 요금제가 있는지 확인해 보세요.`,
        emphasis: false,
      }],
    },
    {
      title: '변동비 한도 설정',
      kind: 'suggestion',
      savingKrw: Math.round(variableExpense * 0.05),
      segments: [{
        text: `변동비 ${won(variableExpense)}원에 주간 한도를 정하면 소비 속도를 관리하기 쉽습니다.`,
        emphasis: false,
      }],
    },
  ]
}

export const mockLlmService: LlmService = {
  async mapColumns(input) {
    return mapColumns(input)
  },

  async generateInsights(agg, plan) {
    return plan === 'pro' ? proInsights(agg) : freeInsights(agg)
  },

  async detectSubscriptions(txns) {
    return detectSubscriptions(txns)
  },
}
