import { useCallback, useEffect, useRef, useState } from 'react'

export function usePoll<T>(
  load: () => Promise<T>,
  isPending: (value: T) => boolean,
  deps: readonly unknown[],
  enabled = true,
  failure = 'Failed to load',
): { data: T | null; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const loadRef = useRef(load)
  const pendingRef = useRef(isPending)
  loadRef.current = load
  pendingRef.current = isPending

  const refresh = useCallback(() => {
    setNonce((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!enabled) return
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      try {
        const next = await loadRef.current()
        if (stop) return
        setData(next)
        setError(null)
        if (pendingRef.current(next)) {
          timer = setTimeout(() => void tick(), 2000)
        }
      } catch (err) {
        if (stop) return
        setError(err instanceof Error ? err.message : failure)
      }
    }
    void tick()
    return () => {
      stop = true
      if (timer) clearTimeout(timer)
    }
  }, [enabled, failure, nonce, ...deps])

  return { data, error, refresh }
}
