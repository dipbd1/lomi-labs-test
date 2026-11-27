import assert from 'node:assert/strict'
import test from 'node:test'
import { extractionResponseSchema } from './gemini'
import { resolveInference } from './inference'
import { openRouterContent, openRouterRequest } from './openrouter'

test('an unset flag uses Gemini even when an OpenRouter key is present', () => {
  const target = resolveInference({
    GEMINI_API_KEY: 'gemini-key',
    GEMINI_MODEL: 'gemini-3.1-flash-lite',
    OPENROUTER_API_KEY: 'or-key',
  })
  assert.deepEqual(target, {
    provider: 'gemini',
    apiKey: 'gemini-key',
    model: 'gemini-3.1-flash-lite',
    missingKeyMessage: 'GEMINI_API_KEY is not set',
  })
})

test('a false flag uses Gemini', () => {
  const target = resolveInference({
    USE_OPENROUTER: 'false',
    GEMINI_API_KEY: 'gemini-key',
    OPENROUTER_API_KEY: 'or-key',
  })
  assert.equal(target.provider, 'gemini')
  assert.equal(target.model, 'gemini-3.5-flash')
})

test('the flag and key together select OpenRouter', () => {
  for (const flag of ['true', 'TRUE', '1', 'yes', 'on']) {
    const target = resolveInference({
      USE_OPENROUTER: flag,
      OPENROUTER_API_KEY: ' or-key ',
      OPENROUTER_MODEL: 'google/gemini-3.8-flash',
      GEMINI_API_KEY: 'gemini-key',
    })
    assert.equal(target.provider, 'openrouter')
    assert.equal(target.apiKey, 'or-key')
    assert.equal(target.model, 'google/gemini-3.8-flash')
  }
})

test('the flag without a key still selects OpenRouter and reports the missing key', () => {
  const target = resolveInference({ USE_OPENROUTER: 'true', OPENROUTER_API_KEY: '  ' })
  assert.deepEqual(target, {
    provider: 'openrouter',
    apiKey: null,
    model: 'google/gemini-3.5-flash',
    missingKeyMessage: 'OPENROUTER_API_KEY is not set',
  })
})

test('OpenRouter content is read from a string or text parts', () => {
  assert.equal(openRouterContent({ choices: [{ message: { content: '{"fields":[]}' } }] }), '{"fields":[]}')
  assert.equal(
    openRouterContent({
      choices: [{ message: { content: [{ type: 'text', text: '{"fields":' }, { text: '[]}' }] } }],
    }),
    '{"fields":[]}',
  )
  assert.throws(() => openRouterContent({ choices: [{ message: { content: '  ' } }] }), /Empty model response/)
  assert.throws(() => openRouterContent({}), /invalid response/)
})

test('the OpenRouter request asks for the extraction schema', () => {
  const body = openRouterRequest('Extract the fields', 'google/gemini-3.5-flash', 'invoice')
  assert.equal(body.model, 'google/gemini-3.5-flash')
  assert.deepEqual(body.messages, [{ role: 'user', content: 'Extract the fields' }])
  assert.equal(body.response_format.type, 'json_schema')
  assert.equal(body.response_format.json_schema.strict, true)
  assert.deepEqual(body.response_format.json_schema.schema, extractionResponseSchema('invoice'))
  assert.equal(body.provider.require_parameters, true)
})
