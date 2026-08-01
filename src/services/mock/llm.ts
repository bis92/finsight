// Server-only data implementation. Import through src/services/index.ts from Route Handlers.
import 'server-only'

import { detectSubscriptions } from '@/lib/analysis'
import { won } from '@/lib/analysis/insights'
import type { AggregateSnapshot, Insight } from '@/types'

import type { LlmService } from '../types'

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
  async generateProInsights(agg) {
    return proInsights(agg)
  },

  async detectSubscriptions(txns) {
    return detectSubscriptions(txns)
  },
}
