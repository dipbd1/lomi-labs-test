import type { DocumentType } from '@lomi/contracts'
import { generateGemini } from './gemini'
import { generateOpenRouter } from './openrouter'

const enabledFlags = new Set(['1', 'true', 'yes', 'on'])

export function openRouterEnabled(value: string | undefined): boolean {
  if (!value) return false
  return enabledFlags.has(value.trim().toLowerCase())
}

export type InferenceTarget = {
  provider: 'gemini' | 'openrouter'
  apiKey: string | null
  model: string
  missingKeyMessage: string
}

export function resolveInference(env: Record<string, string | undefined> = process.env): InferenceTarget {
  if (openRouterEnabled(env.USE_OPENROUTER)) {
    const apiKey = env.OPENROUTER_API_KEY?.trim() || null
    return {
      provider: 'openrouter',
      apiKey,
      model: env.OPENROUTER_MODEL?.trim() || 'google/gemini-3.5-flash',
      missingKeyMessage: 'OPENROUTER_API_KEY is not set',
    }
  }
  const apiKey = env.GEMINI_API_KEY?.trim() || null
  return {
    provider: 'gemini',
    apiKey,
    model: env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash',
    missingKeyMessage: 'GEMINI_API_KEY is not set',
  }
}

type ReadyInference = Pick<InferenceTarget, 'provider' | 'model'> & { apiKey: string }

export async function generateExtraction(target: ReadyInference, type: DocumentType, prompt: string): Promise<string> {
  switch (target.provider) {
    case 'gemini':
      return generateGemini(prompt, target.apiKey, target.model, type)
    case 'openrouter':
      return generateOpenRouter(prompt, target.apiKey, target.model, type)
    default: {
      const unreachable: never = target.provider
      throw new Error(unreachable)
    }
  }
}
