import type { Category } from '@/types'

export type ClassificationRule = Readonly<{
  category: Exclude<Category, '수입' | '기타'>
  keywords: readonly string[]
}>

export const CLASSIFICATION_RULES: readonly ClassificationRule[] = [
  {
    category: '카페/간식',
    keywords: ['투썸', '메가커피', '컴포즈커피', '이디야', '카페', '베이커리'],
  },
  {
    category: '식비',
    keywords: ['스타벅스', '배달의민족', '배민', '요기요', '쿠팡이츠', '식당', '음식점', '버거', '치킨', '피자'],
  },
  {
    category: '교통',
    keywords: ['지하철', '버스', '택시', '카카오t', '카카오택시', '코레일', '주유', '하이패스'],
  },
  {
    category: '구독',
    keywords: ['넷플릭스', '유튜브프리미엄', '유튜브 프리미엄', 'spotify', '스포티파이', 'microsoft 365', '쿠팡 와우', '쿠팡와우'],
  },
  {
    category: '쇼핑',
    keywords: ['무신사', '쿠팡', '11번가', '지마켓', '올리브영', '백화점', '다이소'],
  },
  {
    category: '주거',
    keywords: ['월세', '관리비', '부동산', '주택'],
  },
  {
    category: '공과금',
    keywords: ['전기요금', '가스요금', '수도요금', '통신요금', '도시가스', '한국전력'],
  },
  {
    category: '문화/여가',
    keywords: ['cgv', '메가박스', '롯데시네마', '공연', '전시', '헬스장', '골프'],
  },
  {
    category: '의료',
    keywords: ['병원', '의원', '약국', '치과', '한의원'],
  },
  {
    category: '금융',
    keywords: ['보험', '카드수수료', '대출이자', '증권'],
  },
  {
    category: '교육',
    keywords: ['학원', '교보문고', '알라딘', '교육', '수강료'],
  },
] as const
