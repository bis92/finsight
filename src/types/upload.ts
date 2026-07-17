export type UploadStatus = 'parsing' | 'done' | 'error'

export type Upload = {
  id: string
  userId: string
  filePath: string
  originalName: string
  status: UploadStatus
  errorMessage?: string | null
}
