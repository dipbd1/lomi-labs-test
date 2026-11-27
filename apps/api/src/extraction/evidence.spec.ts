import assert from 'node:assert/strict'
import test from 'node:test'
import { applyEvidence, locateEvidence } from './evidence'

test('exact span passes and is stored as written', () => {
  const parsedText = 'Invoice total is $120.00 today'
  const span = locateEvidence(parsedText, '$120.00')
  assert.equal(span, '$120.00')
  const result = applyEvidence({
    parsedText,
    value: '$120.00',
    evidence: '$120.00',
    gapReason: null,
  })
  assert.deepEqual(result, { value: '$120.00', evidence: '$120.00', gapReason: null })
})

test('whitespace-flex span passes and stores the document span', () => {
  const parsedText = 'Invoice total is\n$120.00 today'
  const result = applyEvidence({
    parsedText,
    value: '120.00',
    evidence: 'total is $120.00',
    gapReason: null,
  })
  assert.equal(result.value, '120.00')
  assert.equal(result.evidence, 'total is\n$120.00')
  assert.equal(result.gapReason, null)
  assert.equal(parsedText.includes(result.evidence ?? ''), true)
})

test('a quote that is not in the text becomes a gap', () => {
  const result = applyEvidence({
    parsedText: 'hello world',
    value: '42',
    evidence: 'missing quote',
    gapReason: null,
  })
  assert.deepEqual(result, {
    value: null,
    evidence: null,
    gapReason: 'Evidence was not in the document',
  })
})

test('a missing field stays a gap with the model reason', () => {
  const result = applyEvidence({
    parsedText: 'hello world',
    value: null,
    evidence: null,
    gapReason: 'Not on the page',
  })
  assert.deepEqual(result, { value: null, evidence: null, gapReason: 'Not on the page' })
})
