export async function holdForApi(healthUrl, options = {}) {
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const fetchImpl = options.fetch ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? 10_000
  const intervalMs = options.intervalMs ?? 200
  const deadline = now() + timeoutMs
  while (now() < deadline) {
    const ready = await readHealth(fetchImpl, healthUrl, options.fetch == null)
    if (ready) return
    const remaining = deadline - now()
    if (remaining <= 0) return
    await sleep(Math.min(intervalMs, remaining))
  }
}

async function readHealth(fetchImpl, healthUrl, limit) {
  try {
    const response = await fetchImpl(healthUrl, limit ? { signal: AbortSignal.timeout(1_000) } : undefined)
    return response.ok
  } catch {
    return false
  }
}

export function holdApiPlugin(origin) {
  const healthUrl = new URL('/health', origin).href
  return {
    name: 'hold-api-until-ready',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? ''
        if (path !== '/api' && !path.startsWith('/api/')) {
          next()
          return
        }
        void holdForApi(healthUrl).then(
          () => next(),
          () => next(),
        )
      })
    },
  }
}
