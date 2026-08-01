import type { AggregateSnapshot, Insight } from '@/types'

export function won(amount: number): string {
  return amount.toLocaleString('ko-KR')
}

const EMPTY_INSIGHT: Insight = {
  title: '소비 분석',
  kind: 'summary',
  segments: [{ text: '분석할 거래 내역이 없습니다.', emphasis: false }],
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

// Free 플랜 인사이트: 앱이 이미 계산한 집계값으로 사실만 서술한다(조언·진단은 Pro/Opus 몫).
export function buildFreeInsights(agg: AggregateSnapshot): Insight[] {
  if (
    agg.totalExpense === 0 && agg.totalIncome === 0
    && agg.byCategory.length === 0 && agg.topMerchants.length === 0
  ) {
    return [EMPTY_INSIGHT]
  }

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
