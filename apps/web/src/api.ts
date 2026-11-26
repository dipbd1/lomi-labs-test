export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) throw new Error(await readError(response))
  return response.json() as Promise<T>
}

async function readError(response: Response): Promise<string> {
  const text = await response.text()
  try {
    const body = JSON.parse(text) as { message?: unknown }
    if (typeof body.message === 'string') return body.message
    if (Array.isArray(body.message)) return body.message.join(', ')
  } catch {
    return text || response.statusText
  }
  return text || response.statusText
}
