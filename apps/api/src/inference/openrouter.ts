import type { DocumentType } from '@lomi/contracts'
import { extractionResponseSchema } from './gemini'

export function openRouterRequest(prompt: string, model: string, type: DocumentType) {
  return {
    model,
    messages: [{ role: 'user' as const, content: prompt }],
    response_format: {
      type: 'json_schema' as const,
      json_schema: {
        name: 'extraction',
        strict: true,
        schema: extractionResponseSchema(type),
      },
    },
    provider: { require_parameters: true },
  }
}

function readContent(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return null
  const parts: string[] = []
  for (const part of content) {
    if (typeof part === 'string') {
      parts.push(part)
      continue
    }
    if (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string') {
      parts.push(part.text)
    }
  }
  if (parts.length === 0) return null
  return parts.join('')
}

export function openRouterContent(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null || !('choices' in payload)) {
    throw new Error('OpenRouter returned an invalid response')
  }
  const choices = payload.choices
  if (!Array.isArray(choices) || choices.length === 0) throw new Error('Empty model response')
  const first: unknown = choices[0]
  if (typeof first !== 'object' || first === null || !('message' in first)) {
    throw new Error('OpenRouter returned an invalid response')
  }
  const message = first.message
  if (typeof message !== 'object' || message === null || !('content' in message)) {
    throw new Error('OpenRouter returned an invalid response')
  }
  const text = readContent(message.content)
  if (!text || !text.trim()) throw new Error('Empty model response')
  return text
}

export async function generateOpenRouter(
  prompt: string,
  apiKey: string,
  model: string,
  type: DocumentType,
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(openRouterRequest(prompt, model, type)),
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) {
    const detail = (await response.text()).trim().slice(0, 500)
    throw new Error(
      detail ? `OpenRouter request failed (${response.status}): ${detail}` : `OpenRouter request failed (${response.status})`,
    )
  }
  return openRouterContent(await response.json())
}
