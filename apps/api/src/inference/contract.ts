import type { DocumentType } from '@lomi/contracts'
import { fieldsFor } from '@lomi/contracts'

type ResponseJsonSchema = {
  type?: 'object' | 'string' | 'null'
  description?: string
  properties?: Record<string, ResponseJsonSchema>
  required?: string[]
  additionalProperties?: false
  anyOf?: ResponseJsonSchema[]
}

const locatedFieldSchema: ResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  description:
    'Field present in the document. value is a string and evidence is a contiguous substring of the document text. evidence is not null.',
  required: ['value', 'evidence', 'gapReason'],
  properties: {
    value: {
      type: 'string',
      description: 'Field value as a string. Non-null only together with evidence.',
    },
    evidence: {
      type: 'string',
      description:
        'Contiguous substring of the document text that contains the value. Required and non-null whenever value is a string. Copy it verbatim. Do not paraphrase.',
    },
    gapReason: { type: 'null' },
  },
}

const gapFieldSchema: ResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  description: 'Field missing from the document. value and evidence are null.',
  required: ['value', 'evidence', 'gapReason'],
  properties: {
    value: { type: 'null' },
    evidence: {
      type: 'null',
      description: 'Null only because value is null.',
    },
    gapReason: {
      type: 'string',
      description: 'Short reason the field is missing. Do not guess a value.',
    },
  },
}

export function buildPrompt(type: DocumentType, parsedText: string): string {
  const fields = fieldsFor(type)
    .map((field) => `- ${field.field} (${field.type})`)
    .join('\n')
  return [
    `Extract the following fields from this ${type} document.`,
    'Field types are hints only. Store every value as a string.',
    'Return one JSON object with every expected field key listed below, once, and no other keys.',
    'Every non-null value MUST include evidence copied as a contiguous substring of the document text.',
    'A missing field is a gap with value: null, evidence: null, and a short gapReason.',
    'Do not guess. Do not paraphrase the evidence. Do not return a value without that substring.',
    '',
    'Fields:',
    fields,
    '',
    'Document text:',
    parsedText,
  ].join('\n')
}

export function extractionResponseSchema(type: DocumentType): ResponseJsonSchema {
  const fields = fieldsFor(type)
  const properties: Record<string, ResponseJsonSchema> = {}
  for (const field of fields) {
    properties[field.field] = {
      description: `${field.field} (${field.type}). Return this key once.`,
      anyOf: [locatedFieldSchema, gapFieldSchema],
    }
  }
  const keys = fields.map((field) => field.field)
  return {
    type: 'object',
    additionalProperties: false,
    description:
      'Every expected field key, once. A non-null value includes evidence copied as a contiguous substring of the document text. A missing field has value null, evidence null, and a short gapReason.',
    required: keys,
    properties,
  }
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

function modelFieldFromRecord(field: string, item: unknown): ModelField {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    throw new Error('Model returned invalid JSON')
  }
  const record = item as { value?: unknown; evidence?: unknown; gapReason?: unknown }
  return {
    field,
    value: asString(record.value),
    evidence: asString(record.evidence),
    gapReason: asString(record.gapReason),
  }
}

export function parseModelFields(raw: string): ModelField[] {
  const unwrapped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed: unknown = JSON.parse(unwrapped)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Model returned invalid JSON')
  }
  return Object.entries(parsed).map(([field, item]) => modelFieldFromRecord(field, item))
}
