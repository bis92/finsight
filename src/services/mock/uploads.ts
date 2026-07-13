// Server-only data implementation. Import through src/services/index.ts from Route Handlers.
import 'server-only'

import type { Upload } from '@/types'

import { MOCK_UPLOADS } from './fixtures/uploads'

export async function listMockUploadsByUser(userId: string): Promise<Upload[]> {
  return MOCK_UPLOADS.map((upload) => ({
    ...upload,
    userId,
    filePath: `${userId}/${upload.originalName}`,
  }))
}
