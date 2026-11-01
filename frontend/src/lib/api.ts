export class ApiError extends Error {
  status: number
  fieldErrors: { field: string; message: string }[]
  constructor(status: number, message: string, fieldErrors: { field: string; message: string }[] = []) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

type Opts = { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal }

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'cicd' }
  let body: BodyInit | undefined
  if (opts.form) body = opts.form
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      credentials: 'same-origin',
      signal: opts.signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ApiError(0, 'Cannot reach the CICD API. Is the backend running on port 8000?')
  }
  if (res.status === 204) return undefined as T
  const ct = res.headers.get('content-type') ?? ''
  const data = ct.includes('application/json') ? await res.json() : await res.text()
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.()
    const detail = typeof data === 'object' && data ? (data as { detail?: unknown }).detail : data
    const msg = typeof detail === 'string' ? detail : Array.isArray(detail) ? 'Request failed' : `Request failed (${res.status})`
    throw new ApiError(res.status, msg, (data as { errors?: { field: string; message: string }[] })?.errors ?? [])
  }
  return data as T
}

export function download(path: string) {
  const a = document.createElement('a')
  a.href = `/api${path}`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
