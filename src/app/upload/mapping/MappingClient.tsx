'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { Badge, Button, Card, MappingRow } from '@/components/ui'
import { classifyMany } from '@/lib/analysis'
import { applyMapping, requiresManualMapping } from '@/lib/csv'
import { useUpload } from '@/queries/uploads'
import type { ColumnMappingResult, ColumnRole } from '@/types'

import { UPLOAD_SESSION_KEY, type UploadDraft } from '../upload-session'

const ROLE_OPTIONS: Array<{ value: ColumnRole | 'ignore'; label: string }> = [
  { value: 'ignore', label: '무시' },
  { value: 'date', label: '거래일' },
  { value: 'merchant', label: '가맹점' },
  { value: 'amount', label: '금액' },
  { value: 'category', label: '카테고리' },
]
const REQUIRED_ROLES: ColumnRole[] = ['date', 'merchant', 'amount']

function roleAt(mapping: ColumnMappingResult['mapping'], index: number): ColumnRole | null {
  return (Object.entries(mapping) as Array<[ColumnRole, number | null]>).find(([, mapped]) => mapped === index)?.[0] ?? null
}

export function MappingClient() {
  const router = useRouter()
  const upload = useUpload()
  const [draft, setDraft] = useState<UploadDraft | null>(null)
  const [mapping, setMapping] = useState<ColumnMappingResult['mapping'] | null>(null)
  const [manuallyReviewed, setManuallyReviewed] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem(UPLOAD_SESSION_KEY)
    if (!stored) return
    try {
      const value = JSON.parse(stored) as UploadDraft
      setDraft(value)
      setMapping(value.mappingResult.mapping)
    } catch {
      sessionStorage.removeItem(UPLOAD_SESSION_KEY)
    }
  }, [])

  const manualRequired = draft ? requiresManualMapping(draft.mappingResult) : false
  const missingRequired = useMemo(() => mapping
    ? REQUIRED_ROLES.filter((role) => mapping[role] === null)
    : REQUIRED_ROLES,
  [mapping])
  const canConfirm = Boolean(draft && mapping && missingRequired.length === 0 && (!manualRequired || manuallyReviewed))

  const changeRole = (headerIndex: number, selected: string) => {
    if (!mapping) return
    const role = selected === 'ignore' ? null : selected as ColumnRole
    const next = { ...mapping }
    for (const key of Object.keys(next) as ColumnRole[]) {
      if (next[key] === headerIndex || key === role) next[key] = null
    }
    if (role) next[role] = headerIndex
    setMapping(next)
    setManuallyReviewed(true)
  }

  const confirm = () => {
    if (!draft || !mapping || !canConfirm) return
    const transactions = classifyMany(applyMapping(draft.headers, draft.rows, mapping))
    if (transactions.length === 0) return
    upload.mutate({ mapping, transactions }, {
      onSuccess: () => {
        sessionStorage.removeItem(UPLOAD_SESSION_KEY)
        router.push('/dashboard')
      },
    })
  }

  if (!draft || !mapping) {
    return (
      <main className="mx-auto max-w-container px-lg py-xxl text-left">
        <Card className="max-w-2xl"><h1 className="text-title-lg font-title-lg">확인할 파일이 없습니다</h1><p className="mt-sm text-body-sm text-muted">먼저 CSV 파일을 선택해 주세요.</p><Button className="mt-lg" onClick={() => router.push('/upload')}>파일 선택하기</Button></Card>
      </main>
    )
  }

  return (
    <main className="fs-fade mx-auto max-w-container px-lg py-xxl text-left">
      <p className="font-mono text-caption-strong text-primary tabular-nums">2/2 단계</p>
      <h1 className="mt-xs text-title-lg font-title-lg">컬럼 매핑을 확인해 주세요</h1>
      <p className="mt-sm max-w-2xl text-body text-body">각 원본 컬럼이 올바른 표준 필드에 연결되었는지 확인하고 필요하면 바꿔주세요.</p>

      <div className="mt-lg max-w-4xl rounded-lg border border-primary px-lg py-base text-body-sm text-body">
        개인정보와 비용을 보호하기 위해 헤더와 <strong className="font-title-sm text-ink">샘플 20행만 분석</strong>했습니다. 전체 거래는 브라우저에서 변환됩니다.
      </div>

      {manualRequired ? (
        <div role="alert" className="mt-base max-w-4xl rounded-lg border border-semantic-down px-lg py-base text-body-sm text-semantic-down">
          신뢰도가 낮거나 필수 컬럼이 누락되었습니다. 아래 드롭다운에서 매핑을 한 번 확인해야 계속할 수 있습니다.
        </div>
      ) : null}

      <Card className="mt-lg max-w-4xl">
        <div className="grid grid-cols-[1fr_1fr_88px] gap-base pb-sm text-caption-strong font-caption-strong text-muted"><span>원본 컬럼</span><span>표준 필드</span><span className="text-right">신뢰도</span></div>
        {draft.headers.map((header, index) => {
          const role = roleAt(mapping, index)
          return (
            <MappingRow
              key={`${header}-${index}`}
              source={header}
              role={role}
              confidence={draft.mappingResult.confidence}
              control={
                <select aria-label={`${header} 표준 필드`} value={role ?? 'ignore'} onChange={(event) => changeRole(index, event.target.value)} className="min-h-10 w-full max-w-52 rounded-md border border-hairline bg-canvas px-sm text-body-sm focus:border-primary focus:outline-none">
                  {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              }
            />
          )
        })}

        <div className="mt-lg flex flex-wrap items-center gap-sm">
          <Button onClick={confirm} disabled={!canConfirm || upload.isPending}>{upload.isPending ? '업로드 중입니다' : '확인하고 대시보드 보기 →'}</Button>
          {missingRequired.length > 0 ? <Badge className="text-semantic-down">필수 필드 {missingRequired.length}개 누락</Badge> : null}
          {manualRequired && !manuallyReviewed ? <span className="text-caption text-semantic-down">드롭다운에서 매핑을 확인해 주세요.</span> : null}
        </div>
        {upload.error ? <p role="alert" className="mt-sm text-body-sm text-semantic-down">{upload.error.message}</p> : null}
      </Card>
    </main>
  )
}
