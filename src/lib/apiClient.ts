type ErrorResponse = {
  message?: unknown
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<T> {
  if (!path.startsWith('/api/')) {
    throw new Error('apiClient는 /api/* 상대경로만 호출할 수 있습니다')
  }

  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const payload: unknown = await response.json()
  if (!response.ok) {
    const errorPayload = payload as ErrorResponse
    const message = typeof errorPayload.message === 'string'
      ? errorPayload.message
      : response.statusText
    throw new ApiError(response.status, message)
  }

  return payload as T
}

export const apiClient = {
  get<T>(path: string): Promise<T> {
    return request<T>('GET', path)
  },
  post<T>(path: string, body: unknown): Promise<T> {
    return request<T>('POST', path, body)
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>('PATCH', path, body)
  },
}
