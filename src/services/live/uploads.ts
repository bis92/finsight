import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server-client'
import type { Upload, UploadStatus } from '@/types'
import type { UploadRow } from '@/types/database'

function toUpload(row: UploadRow): Upload {
  return {
    id: row.id,
    userId: row.user_id,
    filePath: row.file_path,
    originalName: row.original_name,
    status: row.status,
    errorMessage: row.error_message,
  }
}

function assertUserFilePath(userId: string, filePath: string): void {
  if (!filePath.startsWith(`${userId}/`)) {
    throw new Error('Invalid upload object path')
  }
}

export async function listUploadsByUser(userId: string): Promise<Upload[]> {
  const client = await createSupabaseServerClient()
  const { data, error } = await client
    .from('uploads')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return data.map(toUpload)
}

export async function createUpload(
  userId: string,
  originalName: string,
  filePath: string,
): Promise<Upload> {
  assertUserFilePath(userId, filePath)
  const client = await createSupabaseServerClient()
  const { data, error } = await client
    .from('uploads')
    .insert({
      user_id: userId,
      original_name: originalName,
      file_path: filePath,
      status: 'parsing',
      error_message: null,
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return toUpload(data)
}

export async function setUploadStatus(
  userId: string,
  uploadId: string,
  status: UploadStatus,
  errorMessage: string | null = null,
): Promise<Upload> {
  const client = await createSupabaseServerClient()
  const { data, error } = await client
    .from('uploads')
    .update({ status, error_message: errorMessage })
    .eq('user_id', userId)
    .eq('id', uploadId)
    .select('*')
    .maybeSingle()

  if (error) {
    throw error
  }
  if (!data) {
    throw new Error('Upload not found')
  }

  return toUpload(data)
}
