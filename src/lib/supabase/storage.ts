import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server-client'

export const UPLOADS_BUCKET = 'uploads'
const DEFAULT_DOWNLOAD_EXPIRY_SECONDS = 60

function isValidObjectPath(path: string): boolean {
  const segments = path.split('/')
  return segments.length >= 2
    && segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
    && !path.includes('\\')
}

function assertUserObjectPath(userId: string, path: string): void {
  if (!isValidObjectPath(path) || path.split('/')[0] !== userId) {
    throw new Error('Invalid upload object path')
  }
}

function assertObjectPath(path: string): void {
  if (!isValidObjectPath(path)) {
    throw new Error('Invalid upload object path')
  }
}

function sanitizeFilename(originalName: string): string {
  const sanitized = originalName
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[.-]+/u, '')

  return sanitized || 'upload.csv'
}

export function uploadObjectPath(
  userId: string,
  uploadId: string,
  originalName: string,
): string {
  if (!userId || userId.includes('/') || !uploadId || uploadId.includes('/')) {
    throw new Error('Invalid upload object path')
  }

  return `${userId}/${uploadId}-${sanitizeFilename(originalName)}`
}

export async function createSignedUploadUrl(
  userId: string,
  path: string,
): Promise<{ signedUrl: string; token: string; path: string }> {
  assertUserObjectPath(userId, path)
  const client = await createSupabaseServerClient()
  const { data, error } = await client.storage
    .from(UPLOADS_BUCKET)
    .createSignedUploadUrl(path)

  if (error) {
    throw error
  }

  return { signedUrl: data.signedUrl, token: data.token, path: data.path }
}

export async function createSignedDownloadUrl(
  path: string,
  expiresInSeconds = DEFAULT_DOWNLOAD_EXPIRY_SECONDS,
): Promise<{ signedUrl: string }> {
  assertObjectPath(path)
  const client = await createSupabaseServerClient()
  const { data, error } = await client.storage
    .from(UPLOADS_BUCKET)
    .createSignedUrl(path, expiresInSeconds)

  if (error) {
    throw error
  }

  return { signedUrl: data.signedUrl }
}

export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return
  }
  paths.forEach(assertObjectPath)

  const client = await createSupabaseServerClient()
  const { error } = await client.storage.from(UPLOADS_BUCKET).remove(paths)
  if (error) {
    throw error
  }
}
