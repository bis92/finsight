# 내부 분석 엔진 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CSV 컬럼매핑·PDF 거래추출·Free 인사이트를 LLM 없이 내부 규칙/파서(`src/lib/`)로 처리하고, LLM(Opus)은 Pro 진단 인사이트·구독 감지 검증에만 남긴다.

**Architecture:** 내부 엔진은 외부 API가 없으므로 `LlmService` 시임이 아닌 `src/lib/` 순수 함수로 두고 라우트 핸들러가 직접 호출한다. `LlmService`는 Opus 2개 메서드로 축소한다. 모든 라우트의 응답 계약(`ColumnMappingResult`/`NewTransaction[]`/`Insight[]`)은 불변이라 UI/`queries` 코드는 건드리지 않는다.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Vitest, `unpdf`(신규, pdfjs 좌표 추출), 기존 `@anthropic-ai/sdk`(Pro 경로만).

## Global Constraints

- 거래 금액은 **부호 없는 정수(KRW 원)** + `direction`(`'expense'|'income'`). 부호로 지출/수입 표현 금지.
- 환불·매입취소·입금·급여·수입 신호(`(환불|취소|입금|급여|수입)`)는 `direction='income'`으로 정규화.
- `category`는 `src/types/transaction.ts`의 고정 enum만 사용. 추출 직후 category는 placeholder(`수입`/`기타`)이고 규칙 분류(`classifyMany`)는 기존 커밋 경로에서 수행.
- 응답 계약(반환 타입)을 바꾸지 마라 — UI 불변.
- 시크릿·외부 호출은 서버 전용. 새 lib는 순수 로직(테스트 가능)으로.
- LLM 모델: Pro 인사이트·구독 검증만 Opus(`claude-opus-4-8`). 그 외 LLM 호출 없음.
- TDD 필수(`lib/` 로직은 테스트 선행 — tdd-guard 강제). 커밋은 conventional commits.
- 커밋 메시지 말미: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

**신규 파일**
- `src/lib/csv/aliases.ts` — 헤더 별칭 사전 + 역할 매칭(CSV·PDF 공용)
- `src/lib/csv/aliases.test.ts`
- `src/lib/csv/mapping.ts` — CSV 컬럼 매핑 규칙 엔진
- `src/lib/csv/mapping.test.ts`
- `src/lib/analysis/insights.ts` — Free 인사이트 템플릿 엔진
- `src/lib/analysis/insights.test.ts`
- `src/lib/pdf/extract.ts` — 좌표 기반 PDF 표 파서
- `src/lib/pdf/extract.test.ts`

**수정 파일**
- `src/lib/csv/index.ts` — `normalizeDate`/`normalizeAmount` export
- `src/services/types.ts` — `LlmService` 축소
- `src/services/live/llm.ts` — Opus 2개만 남김
- `src/services/mock/llm.ts` — Opus 2개만 남김
- `src/app/api/uploads/mapping/route.ts` — lib `mapColumns` 직접 호출
- `src/app/api/uploads/extract/route.ts` — lib `extractTransactions` 직접 호출
- `src/app/api/insights/route.ts` — free=템플릿, pro=Opus 분기
- `src/app/api/pro-report/route.ts` — `generateProInsights` 호출
- `src/services/live/llm.test.ts` — 제거 메서드 테스트 정리
- `src/app/api/uploads/extract/route.test.ts` — lib mock으로 전환
- `src/app/api/routes.test.ts` — cutover 반영

**의존성**: `unpdf` 추가.

---

## Task 1: 공용 헤더 별칭 모듈

**Files:**
- Create: `src/lib/csv/aliases.ts`
- Test: `src/lib/csv/aliases.test.ts`

**Interfaces:**
- Produces:
  - `matchColumnRole(text: string): ColumnRole | null`
  - `findHeaderIndex(headers: string[], role: ColumnRole): number | null`
  - `HEADER_ALIASES: Record<ColumnRole, readonly string[]>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/csv/aliases.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { findHeaderIndex, matchColumnRole } from './aliases'

describe('matchColumnRole', () => {
  it('matches exact aliases per role', () => {
    expect(matchColumnRole('이용일자')).toBe('date')
    expect(matchColumnRole('가맹점명')).toBe('merchant')
    expect(matchColumnRole('이용금액')).toBe('amount')
    expect(matchColumnRole('업종')).toBe('category')
  })

  it('ignores surrounding whitespace and matches by containment', () => {
    expect(matchColumnRole(' 거래일시 ')).toBe('date')
    expect(matchColumnRole('거래내용')).toBe('merchant')
    expect(matchColumnRole('승인금액')).toBe('amount')
  })

  it('returns null for unknown headers', () => {
    expect(matchColumnRole('메모')).toBeNull()
    expect(matchColumnRole('')).toBeNull()
  })
})

describe('findHeaderIndex', () => {
  it('finds the first header index for a role', () => {
    const headers = ['이용일자', '가맹점명', '이용금액', '업종']
    expect(findHeaderIndex(headers, 'date')).toBe(0)
    expect(findHeaderIndex(headers, 'merchant')).toBe(1)
    expect(findHeaderIndex(headers, 'amount')).toBe(2)
    expect(findHeaderIndex(headers, 'category')).toBe(3)
  })

  it('returns null when no header matches the role', () => {
    expect(findHeaderIndex(['이용일자', '가맹점명'], 'amount')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/csv/aliases.test.ts`
Expected: FAIL — `Cannot find module './aliases'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/csv/aliases.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/csv/aliases.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv/aliases.ts src/lib/csv/aliases.test.ts
git commit -m "$(cat <<'EOF'
feat(csv): 공용 헤더 별칭 매칭 모듈 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: CSV 컬럼 매핑 규칙 엔진

**Files:**
- Create: `src/lib/csv/mapping.ts`
- Test: `src/lib/csv/mapping.test.ts`

**Interfaces:**
- Consumes: `findHeaderIndex` (Task 1), `ColumnMappingInput`/`ColumnMappingResult` (`@/types`)
- Produces: `mapColumns(input: ColumnMappingInput): ColumnMappingResult` (동기)

- [ ] **Step 1: Write the failing test**

Create `src/lib/csv/mapping.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { requiresManualMapping } from './index'
import { mapColumns } from './mapping'

describe('mapColumns (rule engine)', () => {
  it('maps all roles from known headers with high confidence', () => {
    const result = mapColumns({
      headers: ['이용일자', '가맹점명', '이용금액', '업종'],
      sampleRows: [['2026.06.01', '배달의민족', '23900', '음식점']],
      locale: 'ko-KR',
    })

    expect(result).toEqual({
      mapping: { date: 0, merchant: 1, amount: 2, category: 3 },
      confidence: 0.95,
      missingRequired: [],
    })
    expect(requiresManualMapping(result)).toBe(false)
  })

  it('keeps required-only mappings above the manual-review threshold', () => {
    const result = mapColumns({
      headers: ['거래일자', '가맹점', '거래금액'],
      sampleRows: [],
      locale: 'ko-KR',
    })

    expect(result.mapping).toEqual({ date: 0, merchant: 1, amount: 2, category: null })
    expect(result.confidence).toBe(0.85)
    expect(requiresManualMapping(result)).toBe(false)
  })

  it('flags missing required columns for manual mapping', () => {
    const result = mapColumns({
      headers: ['메모', '가맹점명', '수량'],
      sampleRows: [],
      locale: 'ko-KR',
    })

    expect(result.mapping).toEqual({ date: null, merchant: 1, amount: null, category: null })
    expect(result.confidence).toBe(0.4)
    expect(result.missingRequired).toEqual(['date', 'amount'])
    expect(requiresManualMapping(result)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/csv/mapping.test.ts`
Expected: FAIL — `Cannot find module './mapping'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/csv/mapping.ts`:

```ts
import type { ColumnMappingInput, ColumnMappingResult, ColumnRole } from '@/types'

import { findHeaderIndex } from './aliases'

const REQUIRED_ROLES: readonly ColumnRole[] = ['date', 'merchant', 'amount']

export function mapColumns(input: ColumnMappingInput): ColumnMappingResult {
  const mapping = {
    date: findHeaderIndex(input.headers, 'date'),
    merchant: findHeaderIndex(input.headers, 'merchant'),
    amount: findHeaderIndex(input.headers, 'amount'),
    category: findHeaderIndex(input.headers, 'category'),
  }
  const missingRequired = REQUIRED_ROLES.filter((role) => mapping[role] === null)
  const confidence = missingRequired.length > 0
    ? 0.4
    : mapping.category === null ? 0.85 : 0.95

  return { mapping, confidence, missingRequired: [...missingRequired] }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/csv/mapping.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv/mapping.ts src/lib/csv/mapping.test.ts
git commit -m "$(cat <<'EOF'
feat(csv): 규칙 기반 컬럼 매핑 엔진 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Free 인사이트 템플릿 엔진

**Files:**
- Create: `src/lib/analysis/insights.ts`
- Test: `src/lib/analysis/insights.test.ts`

**Interfaces:**
- Consumes: `AggregateSnapshot`/`Insight` (`@/types`)
- Produces:
  - `buildFreeInsights(agg: AggregateSnapshot): Insight[]`
  - `won(amount: number): string`

- [ ] **Step 1: Write the failing test**

Create `src/lib/analysis/insights.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import type { AggregateSnapshot } from '@/types'

import { buildFreeInsights } from './insights'

const snapshot: AggregateSnapshot = {
  period: '2026-06',
  totalExpense: 1_000_000,
  totalIncome: 3_200_000,
  netExpense: -2_200_000,
  byCategory: [
    { category: '식비', amount: 400_000, ratio: 0.4 },
    { category: '주거', amount: 300_000, ratio: 0.3 },
  ],
  topMerchants: [{ merchant: '배달의민족', amount: 200_000, count: 4 }],
}

describe('buildFreeInsights', () => {
  it('produces summary-only insights from precomputed aggregates', () => {
    const insights = buildFreeInsights(snapshot)

    expect(insights.every((insight) => insight.kind === 'summary')).toBe(true)
    expect(insights.every((insight) => insight.savingKrw === undefined)).toBe(true)
    expect(insights[0].segments.map((segment) => segment.text).join('')).toContain('1,000,000원')
    const topText = insights[1].segments.map((segment) => segment.text).join('')
    expect(topText).toContain('식비')
    expect(topText).toContain('400,000원')
    expect(topText).toContain('40%')
  })

  it('returns the deterministic empty-state insight when there is no data', () => {
    const empty: AggregateSnapshot = {
      period: '2026-06', totalExpense: 0, totalIncome: 0, netExpense: 0, byCategory: [], topMerchants: [],
    }

    expect(buildFreeInsights(empty)).toEqual([
      { title: '소비 분석', kind: 'summary', segments: [{ text: '분석할 거래 내역이 없습니다.', emphasis: false }] },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/lib/analysis/insights.test.ts`
Expected: FAIL — `Cannot find module './insights'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/analysis/insights.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/lib/analysis/insights.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/insights.ts src/lib/analysis/insights.test.ts
git commit -m "$(cat <<'EOF'
feat(analysis): Free 인사이트 템플릿 엔진 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 좌표 기반 PDF 표 파서

**Files:**
- Modify: `src/lib/csv/index.ts` (normalizeDate·normalizeAmount export)
- Create: `src/lib/pdf/extract.ts`
- Test: `src/lib/pdf/extract.test.ts`
- 의존성: `unpdf`

**Interfaces:**
- Consumes: `matchColumnRole` (Task 1), `normalizeDate`/`normalizeAmount` (`@/lib/csv`), `normalizeExtractedTransactions` (`@/lib/pdf`), `PdfExtractionInput`/`NewTransaction`/`Direction` (`@/types`)
- Produces:
  - `type TextItem = { str: string; x: number; y: number }`
  - `groupIntoRows(items: TextItem[], yTolerance?: number): TextItem[][]`
  - `detectColumns(row: TextItem[]): ColumnAnchor[] | null`
  - `rowToCells(row: TextItem[], columns: ColumnAnchor[]): Partial<Record<ColumnRole, string>>`
  - `extractRowsToTransactions(rows: TextItem[][]): NewTransaction[]`
  - `extractTransactions(input: PdfExtractionInput): Promise<NewTransaction[]>`

- [ ] **Step 1: Install unpdf**

Run: `npm install unpdf`
Expected: `unpdf` added to `dependencies` in `package.json`.

- [ ] **Step 2: Export the CSV normalizers for reuse**

In `src/lib/csv/index.ts`, add the `export` keyword to the two existing private functions (do not change their bodies):

```ts
export function normalizeDate(value: string): string | null {
```

```ts
export function normalizeAmount(value: string): { amount: number; isCredit: boolean } | null {
```

- [ ] **Step 3: Write the failing test**

Create `src/lib/pdf/extract.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  detectColumns,
  extractRowsToTransactions,
  groupIntoRows,
  type TextItem,
} from './extract'

// PDF 좌표는 y가 클수록 위쪽. 헤더(y=700) 아래로 데이터 행들이 이어진다.
const header: TextItem[] = [
  { str: '이용일자', x: 50, y: 700 },
  { str: '가맹점', x: 150, y: 700 },
  { str: '이용금액', x: 300, y: 700 },
]
const expenseRow: TextItem[] = [
  { str: '2026.06.02', x: 50, y: 680 },
  { str: '배달의민족', x: 150, y: 680 },
  { str: '23,900', x: 300, y: 680 },
]
const incomeRow: TextItem[] = [
  { str: '2026.06.25', x: 48, y: 640 },
  { str: '급여', x: 150, y: 640 },
  { str: '3,200,000', x: 305, y: 640 },
]
const summaryRow: TextItem[] = [
  { str: '합계', x: 150, y: 620 },
  { str: '28,400', x: 300, y: 620 },
]

describe('groupIntoRows', () => {
  it('groups items by y-band top-to-bottom and sorts each row left-to-right', () => {
    const shuffled = [expenseRow[2], header[1], expenseRow[0], header[0], header[2], expenseRow[1]]
    const rows = groupIntoRows(shuffled)

    expect(rows).toEqual([header, expenseRow])
  })
})

describe('detectColumns', () => {
  it('builds anchors when date, merchant, and amount are present', () => {
    const columns = detectColumns(header)

    expect(columns).not.toBeNull()
    expect(columns?.map((column) => column.role)).toEqual(['date', 'merchant', 'amount'])
  })

  it('returns null when a required role is missing', () => {
    expect(detectColumns([{ str: '가맹점', x: 10, y: 700 }, { str: '이용금액', x: 100, y: 700 }])).toBeNull()
  })
})

describe('extractRowsToTransactions', () => {
  it('parses data rows, drops summary rows, and normalizes direction/category', () => {
    const result = extractRowsToTransactions([header, expenseRow, incomeRow, summaryRow])

    expect(result).toEqual([
      { uploadId: '', occurredOn: '2026-06-02', merchant: '배달의민족', amount: 23_900, direction: 'expense', category: '기타', raw: {} },
      { uploadId: '', occurredOn: '2026-06-25', merchant: '급여', amount: 3_200_000, direction: 'income', category: '수입', raw: {} },
    ])
  })

  it('returns an empty array when no header row is found', () => {
    expect(extractRowsToTransactions([expenseRow, incomeRow])).toEqual([])
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test -- src/lib/pdf/extract.test.ts`
Expected: FAIL — `Cannot find module './extract'`

- [ ] **Step 5: Write minimal implementation**

Create `src/lib/pdf/extract.ts`:

```ts
import { getDocumentProxy } from 'unpdf'

import { matchColumnRole } from '@/lib/csv/aliases'
import { normalizeAmount, normalizeDate } from '@/lib/csv'
import { normalizeExtractedTransactions } from '@/lib/pdf'
import type { ColumnRole, Direction, NewTransaction, PdfExtractionInput } from '@/types'

export type TextItem = { str: string; x: number; y: number }
export type ColumnAnchor = { role: ColumnRole; lo: number; hi: number }

const Y_TOLERANCE = 3
const REQUIRED_ROLES: readonly ColumnRole[] = ['date', 'merchant', 'amount']

export function groupIntoRows(items: TextItem[], yTolerance = Y_TOLERANCE): TextItem[][] {
  const rows: TextItem[][] = []
  for (const item of [...items].sort((left, right) => right.y - left.y)) {
    const row = rows.at(-1)
    if (row && Math.abs(row[0].y - item.y) <= yTolerance) {
      row.push(item)
    } else {
      rows.push([item])
    }
  }
  return rows.map((row) => [...row].sort((left, right) => left.x - right.x))
}

export function detectColumns(row: TextItem[]): ColumnAnchor[] | null {
  const matched: Array<{ role: ColumnRole; x: number }> = []
  const seen = new Set<ColumnRole>()
  for (const item of [...row].sort((left, right) => left.x - right.x)) {
    const role = matchColumnRole(item.str)
    if (role && !seen.has(role)) {
      seen.add(role)
      matched.push({ role, x: item.x })
    }
  }
  if (!REQUIRED_ROLES.every((role) => seen.has(role))) {
    return null
  }

  const sorted = matched.sort((left, right) => left.x - right.x)
  return sorted.map((column, index) => {
    const previous = sorted[index - 1]
    const next = sorted[index + 1]
    return {
      role: column.role,
      lo: previous ? (previous.x + column.x) / 2 : Number.NEGATIVE_INFINITY,
      hi: next ? (column.x + next.x) / 2 : Number.POSITIVE_INFINITY,
    }
  })
}

export function rowToCells(row: TextItem[], columns: ColumnAnchor[]): Partial<Record<ColumnRole, string>> {
  const cells: Partial<Record<ColumnRole, string>> = {}
  for (const item of [...row].sort((left, right) => left.x - right.x)) {
    const column = columns.find(({ lo, hi }) => item.x >= lo && item.x < hi)
    if (column) {
      cells[column.role] = (cells[column.role] ?? '') + item.str
    }
  }
  return cells
}

export function extractRowsToTransactions(rows: TextItem[][]): NewTransaction[] {
  let columns: ColumnAnchor[] | null = null
  const extracted: Array<{ occurredOn: string; merchant: string; amount: number; direction: Direction }> = []

  for (const row of rows) {
    if (!columns) {
      columns = detectColumns(row)
      continue
    }

    const cells = rowToCells(row, columns)
    const occurredOn = normalizeDate(cells.date ?? '')
    const amount = normalizeAmount(cells.amount ?? '')
    const merchant = (cells.merchant ?? '').trim()
    if (!occurredOn || !amount || merchant.length === 0) {
      continue
    }

    extracted.push({
      occurredOn,
      merchant,
      amount: amount.amount,
      direction: amount.isCredit ? 'income' : 'expense',
    })
  }

  if (!columns) {
    return []
  }
  return normalizeExtractedTransactions({ transactions: extracted })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isTextItem(item: any): item is { str: string; transform: number[] } {
  return typeof item?.str === 'string' && Array.isArray(item?.transform)
}

export async function extractTransactions(input: PdfExtractionInput): Promise<NewTransaction[]> {
  const bytes = new Uint8Array(Buffer.from(input.dataBase64, 'base64'))
  const pdf = await getDocumentProxy(bytes)

  const rows: TextItem[][] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const items: TextItem[] = []
    for (const item of content.items) {
      if (isTextItem(item) && item.str.trim() !== '') {
        items.push({ str: item.str, x: item.transform[4], y: item.transform[5] })
      }
    }
    rows.push(...groupIntoRows(items))
  }

  return extractRowsToTransactions(rows)
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- src/lib/pdf/extract.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/pdf/extract.ts src/lib/pdf/extract.test.ts src/lib/csv/index.ts package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat(pdf): 좌표 기반 텍스트 PDF 표 파서 추가 (unpdf)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Cutover — LlmService 축소 + 라우트 재배선

내부 엔진(Task 1~4)을 실제 경로에 연결하고 `LlmService`를 Opus 2개로 줄인다. 인터페이스 변경은 원자적이라 서비스·라우트·관련 테스트를 한 태스크에서 함께 바꾼다. **완료 시 전체 스위트가 green이어야 한다.**

**Files:**
- Modify: `src/services/types.ts`, `src/services/live/llm.ts`, `src/services/mock/llm.ts`
- Modify: `src/app/api/uploads/mapping/route.ts`, `src/app/api/uploads/extract/route.ts`, `src/app/api/insights/route.ts`, `src/app/api/pro-report/route.ts`
- Modify: `src/services/live/llm.test.ts`, `src/app/api/uploads/extract/route.test.ts`, `src/app/api/routes.test.ts`

**Interfaces:**
- Produces (new `LlmService`):
  - `generateProInsights(agg: AggregateSnapshot): Promise<Insight[]>`
  - `detectSubscriptions(txns: Transaction[]): Promise<SubscriptionCandidate[]>`
- Consumes: `mapColumns` (Task 2), `extractTransactions` (Task 4), `buildFreeInsights` (Task 3)

- [ ] **Step 1: Slim the `LlmService` interface**

Replace the `LlmService` interface in `src/services/types.ts` (keep `TransactionsRepository` unchanged). New file content:

```ts
import type {
  AggregateSnapshot,
  Category,
  DateRange,
  Insight,
  NewTransaction,
  SubscriptionCandidate,
  Transaction,
} from '@/types'

export interface TransactionsRepository {
  listByUser(userId: string, range?: DateRange): Promise<Transaction[]>
  insertMany(userId: string, txns: NewTransaction[]): Promise<{ inserted: number }>
  reclassify(userId: string, txnId: string, category: Category): Promise<Transaction>
}

export interface LlmService {
  /** Pro-only deep insights via Opus. Free insights are built in lib/analysis/insights. */
  generateProInsights(agg: AggregateSnapshot): Promise<Insight[]>
  detectSubscriptions(txns: Transaction[]): Promise<SubscriptionCandidate[]>
}
```

- [ ] **Step 2: Reduce `src/services/live/llm.ts` to the two Opus methods**

Apply these edits:

1. Replace the import block (lines 1–21) with:

```ts
import 'server-only'

import { detectSubscriptions as detectRuleSubscriptions } from '@/lib/analysis'
import { completeJson, OPUS } from '@/lib/llm/client'
import type {
  AggregateSnapshot,
  Cadence,
  Insight,
  InsightKind,
  SubscriptionCandidate,
  Transaction,
} from '@/types'

import type { LlmService } from '../types'
```

2. Delete these now-unused declarations entirely: `COLUMN_ROLES`, `REQUIRED_ROLES`, `COLUMN_MAPPING_SCHEMA`, `PDF_EXTRACTION_SCHEMA`, `PDF_EXTRACTION_SYSTEM_PROMPT`, `SYSTEM_PROMPT` (the CSV mapping prompt), `normalizeIndex`, `normalizeResult`, `mapColumns`, `extractTransactions`. Keep `INSIGHT_KINDS`, `INSIGHTS_SCHEMA`, `CADENCES`, `SUBSCRIPTIONS_SCHEMA`, `INSIGHTS_SYSTEM_PROMPT`, `SUBSCRIPTIONS_SYSTEM_PROMPT`, `plainText`, `normalizeInsights`, and all `detectSubscriptions` helpers.

3. Replace `generateInsights` with a Pro-only version:

```ts
async function generateProInsights(agg: AggregateSnapshot): Promise<Insight[]> {
  if (agg.totalExpense === 0 && agg.totalIncome === 0 && agg.byCategory.length === 0 && agg.topMerchants.length === 0) {
    return [{
      title: '소비 분석',
      kind: 'summary',
      segments: [{ text: '분석할 거래 내역이 없습니다.', emphasis: false }],
    }]
  }

  const result = await completeJson<unknown>({
    model: OPUS,
    system: INSIGHTS_SYSTEM_PROMPT,
    user: `<aggregate_snapshot>\n${JSON.stringify(agg)}\n</aggregate_snapshot>\n플랜: pro`,
    schema: INSIGHTS_SCHEMA,
    maxTokens: 4096,
  })

  return normalizeInsights(result, 'pro')
}
```

4. Replace the export at the bottom:

```ts
export const liveLlmService: LlmService = {
  generateProInsights,
  detectSubscriptions,
}
```

- [ ] **Step 3: Reduce `src/services/mock/llm.ts` to the two Opus methods**

Replace the entire file with:

```ts
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
```

- [ ] **Step 4: Rewire the mapping route**

Replace `src/app/api/uploads/mapping/route.ts` with:

```ts
import { NextResponse } from 'next/server'

import { mapColumns } from '@/lib/csv/mapping'

import {
  ApiRouteError,
  isRecord,
  readJson,
  withErrorBoundary,
} from '../../_lib/server'

const MAX_SAMPLE_ROWS = 20

export async function POST(request: Request): Promise<Response> {
  return withErrorBoundary(async () => {
    const body = await readJson(request)
    if (!isRecord(body)
      || !Array.isArray(body.headers)
      || !body.headers.every((header) => typeof header === 'string')
      || body.headers.length === 0
      || !Array.isArray(body.sampleRows)
      || !body.sampleRows.every((row) =>
        Array.isArray(row) && row.every((cell) => typeof cell === 'string'),
      )) {
      throw new ApiRouteError(400, '매핑 요청 데이터가 유효하지 않습니다')
    }

    const result = mapColumns({
      headers: body.headers,
      sampleRows: body.sampleRows.slice(0, MAX_SAMPLE_ROWS),
      locale: 'ko-KR',
    })
    return NextResponse.json(result)
  })
}
```

- [ ] **Step 5: Rewire the extract route**

In `src/app/api/uploads/extract/route.ts`:

1. Replace the `getLlmService` import (line 5) with:

```ts
import { extractTransactions } from '@/lib/pdf/extract'
```

2. Replace the extraction call (lines 47–50) with:

```ts
    const transactions = await extractTransactions({
      fileName: body.fileName,
      dataBase64: body.dataBase64,
    })
```

- [ ] **Step 6: Rewire the insights route (free=template, pro=Opus)**

Replace `src/app/api/insights/route.ts` with:

```ts
import { NextResponse } from 'next/server'

import { aggregate } from '@/lib/analysis'
import { buildFreeInsights } from '@/lib/analysis/insights'
import {
  getLlmService,
  getProfileService,
  getTransactionsRepository,
} from '@/services'

import {
  resolveCurrentUserId,
  periodRange,
  requirePeriod,
  withErrorBoundary,
} from '../_lib/server'

export async function GET(request: Request): Promise<Response> {
  return withErrorBoundary(async () => {
    const period = requirePeriod(request.url)
    const userId = await resolveCurrentUserId()
    const [transactions, profile] = await Promise.all([
      getTransactionsRepository().listByUser(userId, periodRange(period)),
      getProfileService()(userId),
    ])
    const snapshot = aggregate(transactions, period)
    const insights = profile.plan === 'pro'
      ? await getLlmService().generateProInsights(snapshot)
      : buildFreeInsights(snapshot)

    return NextResponse.json({ period, insights })
  })
}
```

- [ ] **Step 7: Rewire the pro-report route**

In `src/app/api/pro-report/route.ts`, replace the `Promise.all` block (lines 33–36) with:

```ts
    const [insights, subscriptions] = await Promise.all([
      llmService.generateProInsights(snapshot),
      llmService.detectSubscriptions(transactions),
    ])
```

- [ ] **Step 8: Update `src/services/live/llm.test.ts`**

1. Delete the two describe blocks `liveLlmService.mapColumns` (lines 52–168) and `liveLlmService.extractTransactions` (lines 170–214).
2. Change the import on line 15–17 to drop the now-unused `requiresManualMapping` and `SONNET`:

```ts
import { OPUS } from '@/lib/llm/client'
import { liveLlmService } from '@/services/live/llm'
import type { AggregateSnapshot, Transaction } from '@/types'
```

3. Replace the entire `describe('liveLlmService.generateInsights', ...)` block with a Pro-only version:

```ts
describe('liveLlmService.generateProInsights', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
  })

  it('uses Opus and returns the pro diagnosis/suggestion distribution', async () => {
    mockJson({ insights: [
      { title: '지출 진단', kind: 'diagnosis', segments: [{ text: '변동비를 점검하세요.', emphasis: false }] },
      { title: '절감 제안', kind: 'suggestion', segments: [{ text: '배달 횟수를 줄여보세요.', emphasis: false }], savingKrw: 20000 },
    ] })

    const result = await liveLlmService.generateProInsights(snapshot)

    expect(messagesCreate.mock.calls[0][0].model).toBe(OPUS)
    expect(result.map(({ kind }) => kind)).toEqual(['diagnosis', 'suggestion'])
  })

  it('normalizes malformed insights and keeps only valid plain-text segments', async () => {
    mockJson({ insights: [
      { title: '잘못된 종류', kind: 'other', segments: [{ text: '제거', emphasis: false }] },
      { title: '빈 본문', kind: 'summary', segments: [] },
      { title: '진단', kind: 'diagnosis', segments: [{ text: '<strong>안전</strong> **본문**', emphasis: 'yes' }], savingKrw: 3000 },
      { title: '절감', kind: 'suggestion', segments: [{ text: '절감 가능', emphasis: true }], savingKrw: -1234.6 },
      { title: '반올림', kind: 'suggestion', segments: [{ text: '추가 절감', emphasis: false }], savingKrw: 1234.6 },
    ] })

    await expect(liveLlmService.generateProInsights(snapshot)).resolves.toEqual([
      { title: '진단', kind: 'diagnosis', segments: [{ text: '안전 본문', emphasis: false }] },
      { title: '절감', kind: 'suggestion', segments: [{ text: '절감 가능', emphasis: true }], savingKrw: 0 },
      { title: '반올림', kind: 'suggestion', segments: [{ text: '추가 절감', emphasis: false }], savingKrw: 1235 },
    ])
  })

  it('returns a deterministic safe insight without calling Claude for an empty aggregate', async () => {
    const empty = { ...snapshot, totalExpense: 0, totalIncome: 0, netExpense: 0, byCategory: [], topMerchants: [] }

    await expect(liveLlmService.generateProInsights(empty)).resolves.toEqual([
      { title: '소비 분석', kind: 'summary', segments: [{ text: '분석할 거래 내역이 없습니다.', emphasis: false }] },
    ])
    expect(messagesCreate).not.toHaveBeenCalled()
  })

  it('provides only precomputed aggregate values and forbids model-side calculations', async () => {
    mockJson({ insights: [{ title: '진단', kind: 'diagnosis', segments: [{ text: '진단입니다.', emphasis: false }] }] })

    await liveLlmService.generateProInsights(snapshot)

    const request = messagesCreate.mock.calls[0][0]
    expect(request.messages[0].content).toContain(JSON.stringify(snapshot))
    expect(request.system).toContain('계산하지 마세요')
    expect(request.output_config.format.type).toBe('json_schema')
  })
})
```

- [ ] **Step 9: Update `src/app/api/uploads/extract/route.test.ts`**

1. In the `vi.hoisted` mocks object, keep `extractTransactions`. Replace the `@/services` mock (lines 15–18) so the route's new import is stubbed:

```ts
vi.mock('@/services', () => ({
  getProfileService: () => mocks.getProfile,
}))
vi.mock('@/lib/pdf/extract', () => ({ extractTransactions: mocks.extractTransactions }))
```

(Leave the `@/lib/env`, `@/lib/auth/session`, `@/services/live/uploads` mocks unchanged. All existing assertions on `mocks.extractTransactions` remain valid.)

- [ ] **Step 10: Update `src/app/api/routes.test.ts`**

Replace the whole file with:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type {
  Insight,
  NewTransaction,
  Plan,
  Profile,
  Transaction,
  Upload,
} from '@/types'

const mocks = vi.hoisted(() => {
  let plan: Plan = 'free'

  const transactions: Transaction[] = [{
    id: 'txn-1',
    userId: 'server-owned-user',
    uploadId: 'upload-1',
    occurredOn: '2026-06-01',
    merchant: '테스트 가맹점',
    amount: 10_000,
    direction: 'expense',
    category: '식비',
    raw: {},
  }]
  const insights: Insight[] = [{
    title: '테스트 분석',
    kind: 'summary',
    segments: [{ text: '평문 분석', emphasis: false }],
  }]
  const upload: Upload = {
    id: 'upload-1',
    userId: 'server-owned-user',
    filePath: 'server-owned-user/test.csv',
    originalName: 'test.csv',
    status: 'done',
    errorMessage: null,
  }

  return {
    setPlan(nextPlan: Plan) {
      plan = nextPlan
    },
    listByUser: vi.fn(async () => transactions),
    insertMany: vi.fn(async (_userId: string, txns: NewTransaction[]) => ({
      inserted: txns.length,
    })),
    reclassify: vi.fn(async (_userId: string, _txnId: string, category) => ({
      ...transactions[0],
      category,
    })),
    mapColumns: vi.fn((input) => ({
      mapping: { date: 0, merchant: 1, amount: 2, category: null },
      confidence: input.sampleRows.length === 20 ? 0.9 : 0.8,
      missingRequired: [],
    })),
    buildFreeInsights: vi.fn(() => insights.map((item) => ({ ...item, title: `free:${item.title}` }))),
    generateProInsights: vi.fn(async () => insights.map((item) => ({ ...item, title: `pro:${item.title}` }))),
    detectSubscriptions: vi.fn(async () => [{
      merchant: '넷플릭스',
      amount: 13_500,
      cadence: 'monthly' as const,
      confidence: 0.9,
      lastSeenOn: '2026-06-17',
    }]),
    getProfile: vi.fn(async (userId: string): Promise<Profile> => ({ id: userId, plan })),
    listUploads: vi.fn(async () => [upload]),
  }
})

vi.mock('@/services', () => ({
  getTransactionsRepository: () => ({
    listByUser: mocks.listByUser,
    insertMany: mocks.insertMany,
    reclassify: mocks.reclassify,
  }),
  getLlmService: () => ({
    generateProInsights: mocks.generateProInsights,
    detectSubscriptions: mocks.detectSubscriptions,
  }),
  getProfileService: () => mocks.getProfile,
  getUploadsService: () => mocks.listUploads,
}))
vi.mock('@/lib/csv/mapping', () => ({ mapColumns: mocks.mapColumns }))
vi.mock('@/lib/analysis/insights', () => ({ buildFreeInsights: mocks.buildFreeInsights }))

import { GET as getInsights } from '@/app/api/insights/route'
import { GET as getProReport } from '@/app/api/pro-report/route'
import { PATCH as patchTransaction } from '@/app/api/transactions/[id]/route'
import { POST as mapUploadColumns } from '@/app/api/uploads/mapping/route'

describe('API Route Handlers', () => {
  beforeEach(() => {
    mocks.setPlan('free')
    vi.clearAllMocks()
  })

  it('blocks a Free user from receiving any Pro report data', async () => {
    const response = await getProReport(new Request('http://localhost/api/pro-report?period=2026-06'))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ message: 'Pro 전용 기능입니다' })
    expect(mocks.generateProInsights).not.toHaveBeenCalled()
    expect(mocks.detectSubscriptions).not.toHaveBeenCalled()
  })

  it('returns Pro insights and subscription candidates for a server-profile Pro user', async () => {
    mocks.setPlan('pro')

    const response = await getProReport(new Request('http://localhost/api/pro-report?period=2026-06'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.insights[0].title).toBe('pro:테스트 분석')
    expect(body.subscriptions).toEqual([expect.objectContaining({ merchant: '넷플릭스' })])
  })

  it('rejects a transaction category outside the fixed enum', async () => {
    const request = new Request('http://localhost/api/transactions/txn-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: '애완동물' }),
    })

    const response = await patchTransaction(request, {
      params: Promise.resolve({ id: 'txn-1' }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ message: '카테고리가 유효하지 않습니다' })
    expect(mocks.reclassify).not.toHaveBeenCalled()
  })

  it('builds Free insights deterministically without the LLM', async () => {
    mocks.setPlan('free')

    const response = await getInsights(new Request('http://localhost/api/insights?period=2026-06'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.insights[0].title).toBe('free:테스트 분석')
    expect(mocks.buildFreeInsights).toHaveBeenCalledTimes(1)
    expect(mocks.generateProInsights).not.toHaveBeenCalled()
  })

  it('uses Opus Pro insights for a Pro user on the insights route', async () => {
    mocks.setPlan('pro')

    const response = await getInsights(new Request('http://localhost/api/insights?period=2026-06'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.insights[0].title).toBe('pro:테스트 분석')
    expect(mocks.generateProInsights).toHaveBeenCalledTimes(1)
    expect(mocks.buildFreeInsights).not.toHaveBeenCalled()
  })

  it('truncates mapping samples to 20 rows on the server', async () => {
    const sampleRows = Array.from({ length: 25 }, (_, index) => [`row-${index}`])
    const request = new Request('http://localhost/api/uploads/mapping', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ headers: ['일자'], sampleRows, locale: 'ko-KR' }),
    })

    const response = await mapUploadColumns(request)

    expect(response.status).toBe(200)
    expect(mocks.mapColumns).toHaveBeenCalledWith(expect.objectContaining({
      sampleRows: sampleRows.slice(0, 20),
    }))
  })
})
```

- [ ] **Step 11: Run the full test suite + typecheck + lint**

Run: `npm run test && npx tsc --noEmit && npm run lint`
Expected: all PASS. If `tsc` reports unused symbols in `live/llm.ts`, remove the specific leftover declaration it names.

- [ ] **Step 12: Commit**

```bash
git add src/services src/app/api docs/superpowers/plans
git commit -m "$(cat <<'EOF'
refactor(analysis): LLM은 Pro Opus만, CSV·PDF·Free는 내부 엔진으로 전환

- LlmService를 generateProInsights + detectSubscriptions로 축소
- mapping/extract/insights(free) 라우트가 lib 순수 함수 직접 호출
- 응답 계약 불변(UI 무변경)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 전체 검증

- [ ] **Step 1: Run the full suite**

Run: `npm run test`
Expected: PASS (green).

- [ ] **Step 2: Production build smoke check**

Run: `npm run build`
Expected: 빌드 성공. `unpdf`가 서버 번들에 포함되고 클라이언트로 새지 않는지 확인(라우트에서만 import).

- [ ] **Step 3: Manual PDF sanity (optional, live)**

`docs/BROWSER_TESTING.md`의 업로드 UC로 실제 텍스트 기반 카드 명세서 PDF 1건 업로드 → 거래 표가 추출되는지, 인식 실패 시 "거래 내역을 찾지 못했습니다"로 CSV 유도되는지 확인.

---

## Self-Review

**Spec coverage**
- CSV 컬럼 매핑 내부 규칙 → Task 1(별칭)+Task 2(엔진)+Task 5 Step 4(라우트). ✅
- PDF 내부 파서(A안, unpdf, 별칭·정규화 재사용, 폴백) → Task 4 + Task 5 Step 5. ✅
- Free 인사이트 템플릿 → Task 3 + Task 5 Step 6(free 분기). ✅
- LlmService Opus 2개 축소 → Task 5 Step 1~3. ✅
- Pro 진단 인사이트 Opus 유지 → Task 5 Step 2(generateProInsights)+Step 6/7. ✅
- Pro 구독 감지(규칙+Opus) 유지 → live/mock `detectSubscriptions` 그대로. ✅
- 반환 계약 불변(UI 무변경) → 라우트 응답 shape 유지. ✅
- TDD 선행 → 모든 lib Task가 실패 테스트 먼저. ✅
- 스캔/이미지 PDF 폴백 → 텍스트 아이템 0 → 헤더 미탐지 → `[]` → 라우트 400(기존 로직). ✅

**Placeholder scan:** 모든 step에 실제 코드/명령/기대출력 포함. TODO/TBD 없음. ✅

**Type consistency:** `mapColumns`(동기, Task 2 = 라우트/테스트 호출부와 일치), `extractTransactions`(async, Task 4 = 라우트/테스트 mock과 일치), `generateProInsights`/`detectSubscriptions`(Task 5 인터페이스 = live/mock/라우트/테스트 일치), `buildFreeInsights`(Task 3 = 라우트/테스트 일치), `TextItem`/`ColumnAnchor`(Task 4 내부 일관). ✅
