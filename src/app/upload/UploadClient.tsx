'use client'

import { useRouter } from 'next/navigation'
import { type ChangeEvent, type DragEvent, useRef, useState } from 'react'

import { Badge, Button, Card } from '@/components/ui'
import { buildMappingInput, decodeCsv, detectEncoding, parseCsv } from '@/lib/csv'
import { MAX_PDF_BYTES } from '@/lib/pdf'
import { useExtractPdf, useMappingPreview } from '@/queries/uploads'
import type { CsvEncoding } from '@/lib/csv'
import type { ColumnMappingResult } from '@/types'

import { UPLOAD_SESSION_KEY, type UploadDraft } from './upload-session'

type ParsedCsv = {
  source: 'csv'
  fileName: string
  encoding: CsvEncoding
  headers: string[]
  rows: string[][]
}
type ParsedPdf = {
  source: 'pdf'
  fileName: string
  dataBase64: string
  sizeBytes: number
}
type Parsed = ParsedCsv | ParsedPdf

async function readPdfBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('PDF 파일을 읽을 수 없습니다'))
    reader.readAsDataURL(file)
  })
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

export function UploadClient() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const mappingPreview = useMappingPreview()
  const extractPdf = useExtractPdf()
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const readFile = async (file?: File) => {
    if (!file) return
    const name = file.name.toLowerCase()
    const isCsv = name.endsWith('.csv')
    const isPdf = name.endsWith('.pdf')
    if (!isCsv && !isPdf) {
      setError('CSV 또는 PDF 파일만 업로드할 수 있습니다')
      return
    }

    setError(null)
    setParsing(true)
    try {
      if (isPdf) {
        if (file.size > MAX_PDF_BYTES) {
          throw new Error('PDF 파일이 너무 큽니다 (최대 10MB)')
        }
        const dataBase64 = await readPdfBase64(file)
        setParsed({ source: 'pdf', fileName: file.name, dataBase64, sizeBytes: file.size })
      } else {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const encoding = detectEncoding(bytes)
        const { headers, rows } = parseCsv(decodeCsv(bytes, encoding))
        if (headers.length === 0 || rows.length === 0) {
          throw new Error('거래 내역이 있는 CSV 파일을 선택해 주세요')
        }
        setParsed({ source: 'csv', fileName: file.name, encoding, headers, rows })
      }
    } catch (caught) {
      setParsed(null)
      setError(caught instanceof Error ? caught.message : '파일을 읽을 수 없습니다')
    } finally {
      setParsing(false)
    }
  }

  const store = (draft: UploadDraft) => {
    sessionStorage.setItem(UPLOAD_SESSION_KEY, JSON.stringify(draft))
    router.push('/upload/mapping')
  }

  const continueToMapping = () => {
    if (!parsed) return

    if (parsed.source === 'pdf') {
      extractPdf.mutate(
        { fileName: parsed.fileName, dataBase64: parsed.dataBase64 },
        { onSuccess: (transactions) => store({ source: 'pdf', fileName: parsed.fileName, transactions }) },
      )
      return
    }

    const openMapping = (mappingResult: ColumnMappingResult) =>
      store({ source: 'csv', fileName: parsed.fileName, encoding: parsed.encoding, headers: parsed.headers, rows: parsed.rows, mappingResult })
    mappingPreview.mutate(buildMappingInput(parsed.headers, parsed.rows), {
      onSuccess: openMapping,
      onError: () => openMapping({
        mapping: { date: null, merchant: null, amount: null, category: null },
        confidence: 0,
        missingRequired: ['date', 'merchant', 'amount'],
      }),
    })
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    void readFile(event.dataTransfer.files[0])
  }

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    void readFile(event.target.files?.[0])
    event.target.value = ''
  }

  const visibleError = error ?? mappingPreview.error?.message ?? extractPdf.error?.message
  const busy = parsing || mappingPreview.isPending || extractPdf.isPending
  const busyLabel = extractPdf.isPending
    ? 'PDF에서 거래내역을 추출하고 있습니다'
    : mappingPreview.isPending
      ? '컬럼을 분석하고 있습니다'
      : '파일을 읽고 있습니다'

  return (
    <main className="fs-fade mx-auto max-w-container px-lg py-xxl text-left">
      <p className="font-mono text-caption-strong text-primary tabular-nums">1/2 단계</p>
      <h1 className="mt-xs text-title-lg font-title-lg">거래내역 파일을 올려주세요</h1>
      <p className="mt-sm max-w-2xl text-body text-body">카드사나 은행에서 내려받은 CSV 또는 PDF 명세서 한 개를 분석합니다. 원본 형식은 다음 단계에서 확인할 수 있어요.</p>

      <Card className="mt-xl max-w-4xl">
        <input ref={inputRef} type="file" accept=".csv,text/csv,.pdf,application/pdf" className="sr-only" onChange={onChange} />
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click() }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
          className="flex min-h-64 cursor-pointer flex-col items-start justify-center rounded-lg border border-dashed border-hairline px-xl py-xl focus-visible:outline-none focus-visible:shadow-focus"
        >
          {busy ? (
            <>
              <span className="fs-spin h-lg w-lg rounded-full border-2 border-hairline border-t-primary" aria-hidden="true" />
              <strong className="mt-base text-title-sm font-title-sm">{busyLabel}</strong>
              <span className="mt-xs text-body-sm text-muted">잠시만 기다려 주세요.</span>
            </>
          ) : parsed ? (
            <>
              <div className="flex flex-wrap items-center gap-sm"><strong className="text-title-sm font-title-sm">{parsed.fileName}</strong><Badge className="text-semantic-up">{parsed.source === 'pdf' ? '업로드 완료' : '파싱 완료'}</Badge></div>
              {parsed.source === 'csv' ? (
                <dl className="mt-lg grid grid-cols-3 gap-xl text-body-sm">
                  <div><dt className="text-muted">인코딩</dt><dd className="mt-xxs font-mono uppercase tabular-nums">{encodingLabel(parsed.encoding)}</dd></div>
                  <div><dt className="text-muted">거래</dt><dd className="mt-xxs font-mono tabular-nums">{parsed.rows.length}행</dd></div>
                  <div><dt className="text-muted">컬럼</dt><dd className="mt-xxs font-mono tabular-nums">{parsed.headers.length}개</dd></div>
                </dl>
              ) : (
                <dl className="mt-lg grid grid-cols-3 gap-xl text-body-sm">
                  <div><dt className="text-muted">형식</dt><dd className="mt-xxs font-mono uppercase tabular-nums">PDF</dd></div>
                  <div><dt className="text-muted">크기</dt><dd className="mt-xxs font-mono tabular-nums">{fileSizeLabel(parsed.sizeBytes)}</dd></div>
                  <div><dt className="text-muted">분석</dt><dd className="mt-xxs font-mono tabular-nums">다음 단계</dd></div>
                </dl>
              )}
              <span className="mt-lg text-caption text-primary">다른 파일을 선택하려면 여기를 누르세요.</span>
            </>
          ) : (
            <>
              <strong className="text-title-sm font-title-sm">CSV 또는 PDF 파일을 끌어놓거나 선택하세요</strong>
              <span className="mt-xs text-body-sm text-muted">한 번에 파일 한 개만 분석할 수 있습니다.</span>
            </>
          )}
        </div>
        {visibleError ? <p role="alert" className="mt-sm text-body-sm text-semantic-down">{visibleError}</p> : null}
        <div className="mt-lg"><Button onClick={continueToMapping} disabled={!parsed || busy}>{parsed?.source === 'pdf' ? '거래내역 추출하기 →' : '컬럼 확인하기 →'}</Button></div>
      </Card>
    </main>
  )
}

function encodingLabel(encoding: CsvEncoding): string {
  return encoding === 'euc-kr' ? 'EUC-KR' : 'UTF-8'
}

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
