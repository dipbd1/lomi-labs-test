import assert from 'node:assert/strict'
import test from 'node:test'
import { documentTypes, fieldsFor } from '@lomi/contracts'
import { buildPrompt, extractionResponseSchema, parseModelFields } from './gemini'

type Schema = {
  type?: string
  description?: string
  properties?: Record<string, Schema>
  required?: string[]
  additionalProperties?: false
  anyOf?: Schema[]
  nullable?: boolean
}

function asSchema(value: unknown): Schema {
  assert.equal(typeof value, 'object')
  assert.notEqual(value, null)
  return value as Schema
}

test('prompt requires verbatim evidence, a null gap, and each field key once', () => {
  for (const type of documentTypes) {
    const prompt = buildPrompt(type, 'Lease starts 2024-01-01 for Ada')
    assert.match(
      prompt,
      /Every non-null value MUST include evidence copied as a contiguous substring of the document text/,
    )
    assert.match(prompt, /value: null, evidence: null, and a short gapReason/)
    assert.match(prompt, /every expected field key listed below, once/)
    assert.match(prompt, /Lease starts 2024-01-01 for Ada/)
    for (const field of fieldsFor(type)) {
      assert.match(prompt, new RegExp(`- ${field.field} \\(${field.type}\\)`))
    }
  }
})

test('schema allows null evidence only when value is null', () => {
  for (const type of documentTypes) {
    const schema = asSchema(extractionResponseSchema(type))
    const keys = fieldsFor(type).map((field) => field.field)
    assert.deepEqual(schema.required, keys)
    assert.equal(schema.additionalProperties, false)
    assert.deepEqual(Object.keys(schema.properties ?? {}), keys)
    for (const key of keys) {
      const fieldSchema = asSchema(schema.properties?.[key])
      const branches = fieldSchema.anyOf ?? []
      assert.equal(branches.length, 2)
      const located = branches.find((branch) => branch.properties?.value?.type === 'string')
      const gap = branches.find((branch) => branch.properties?.value?.type === 'null')
      assert.ok(located)
      assert.ok(gap)
      assert.equal(located.additionalProperties, false)
      assert.equal(gap.additionalProperties, false)
      assert.deepEqual(located.required, ['value', 'evidence', 'gapReason'])
      assert.deepEqual(gap.required, ['value', 'evidence', 'gapReason'])
      const evidence = asSchema(located.properties?.evidence)
      assert.equal(evidence.type, 'string')
      assert.equal(evidence.anyOf, undefined)
      assert.equal(evidence.nullable, undefined)
      assert.equal(asSchema(located.properties?.gapReason).type, 'null')
      assert.equal(asSchema(gap.properties?.evidence).type, 'null')
      assert.equal(asSchema(gap.properties?.value).type, 'null')
      assert.equal(asSchema(gap.properties?.gapReason).type, 'string')
      for (const branch of branches) {
        const valueType = branch.properties?.value?.type
        const evidenceType = branch.properties?.evidence?.type
        if (valueType === 'string') assert.equal(evidenceType, 'string')
      }
    }
  }
})

test('parser reads an object of fields and still reads a fields array', () => {
  assert.deepEqual(
    parseModelFields(
      JSON.stringify({
        tenant_name: { value: 'Ada', evidence: 'Tenant Ada', gapReason: null },
        monthly_rent: { value: null, evidence: null, gapReason: 'Not stated' },
      }),
    ),
    [
      { field: 'tenant_name', value: 'Ada', evidence: 'Tenant Ada', gapReason: null },
      { field: 'monthly_rent', value: null, evidence: null, gapReason: 'Not stated' },
    ],
  )
  assert.deepEqual(
    parseModelFields(
      JSON.stringify({
        fields: [{ field: 'invoice_number', value: '100', evidence: null, gapReason: null }],
      }),
    ),
    [{ field: 'invoice_number', value: '100', evidence: null, gapReason: null }],
  )
})

test('parser does not invent evidence when the model omits it', () => {
  assert.deepEqual(parseModelFields(JSON.stringify({ vendor_name: { value: 'Meridian' } })), [
    { field: 'vendor_name', value: 'Meridian', evidence: null, gapReason: null },
  ])
  assert.throws(() => parseModelFields('not json'), /Model returned invalid JSON|JSON/)
})
