import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(!!path)
  const ctrl = useRef<AbortController | null>(null)

  const load = useCallback(
    async (silent = false) => {
      if (!path) return
      ctrl.current?.abort()
      const c = new AbortController()
      ctrl.current = c
      if (!silent) setLoading(true)
      try {
        const d = await api<T>(path, { signal: c.signal })
        setData(d)
        setError(null)
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError(e as ApiError)
      } finally {
        if (!c.signal.aborted) setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, ...deps],
  )

  useEffect(() => {
    load()
    return () => ctrl.current?.abort()
  }, [load])

  return { data, error, loading, reload: load, setData }
}
