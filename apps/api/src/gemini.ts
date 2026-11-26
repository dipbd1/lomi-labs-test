import { GoogleGenAI, Type } from '@google/genai'
import type { DocumentType } from '@lomi/contracts'
import { fieldsFor } from '@lomi/contracts'

export function buildPrompt(type: DocumentType, parsedText: string): string {
  const fields = fieldsFor(type)
    .map((field) => `- ${field.field} (${field.type})`)
    .join('\n')
  return [
    `Extract the following fields from this ${type} document.`,
    'Field types are hints only. Store every value as a string.',
    'Copy evidence as a contiguous substring of the document text.',
    'If a field is not present, set value to null, explain why in gapReason, and do not guess.',
    'Return every field listed below.',
    '',
    'Fields:',
    fields,
    '',
    'Document text:',
    parsedText,
  ].join('\n')
}

export async function generateExtraction(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          fields: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                field: { type: Type.STRING },
                value: { type: Type.STRING, nullable: true },
                evidence: { type: Type.STRING, nullable: true },
                gapReason: { type: Type.STRING, nullable: true },
              },
              required: ['field', 'value', 'evidence', 'gapReason'],
            },
          },
        },
        required: ['fields'],
      },
    },
  })
  if (!response.text) throw new Error('Empty model response')
  return response.text
}

export type ModelField = {
  field: string
  value: string | null
  evidence: string | null
  gapReason: string | null
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

export function parseModelFields(raw: string): ModelField[] {
  const unwrapped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed: unknown = JSON.parse(unwrapped)
  if (typeof parsed !== 'object' || parsed === null || !('fields' in parsed)) {
    throw new Error('Model returned invalid JSON')
  }
  const fields = parsed.fields
  if (!Array.isArray(fields)) throw new Error('Model returned invalid JSON')
  return fields.map((item: unknown) => {
    if (typeof item !== 'object' || item === null || !('field' in item) || typeof item.field !== 'string') {
      throw new Error('Model returned invalid JSON')
    }
    const record = item as { value?: unknown; evidence?: unknown; gapReason?: unknown }
    return {
      field: item.field,
      value: asString(record.value),
      evidence: asString(record.evidence),
      gapReason: asString(record.gapReason),
    }
  })
}
