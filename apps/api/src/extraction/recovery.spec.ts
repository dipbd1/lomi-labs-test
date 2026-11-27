import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fieldCatalog } from '@lomi/contracts'
import { countProgress } from '../documents/progress'
import { extractionJobId, planFieldWrites, versionsToRequeue, waitForPrevious } from './recovery'

test('a version left in extracting or queued is enqueued again', () => {
  const ids = versionsToRequeue([
    { id: 'a', status: 'extracting' },
    { id: 'b', status: 'extracted' },
    { id: 'c', status: 'queued' },
    { id: 'd', status: 'failed' },
  ])
  assert.deepEqual(ids, ['a', 'c'])
  assert.equal(extractionJobId('a'), 'extract-a')
  assert.equal(waitForPrevious('extracting'), true)
  assert.equal(waitForPrevious('queued'), true)
  assert.equal(waitForPrevious('failed'), false)
  assert.equal(waitForPrevious('extracted'), false)
  assert.equal(waitForPrevious(null), false)
})

test('a second run does not insert a second row per field', () => {
  const incoming = [
    { fieldKey: 'invoice_number', value: '1' },
    { fieldKey: 'total_amount', value: '2' },
    { fieldKey: 'invoice_number', value: 'duplicate' },
  ]
  const first = planFieldWrites([], incoming)
  assert.deepEqual(
    first.map((row) => row.fieldKey),
    ['invoice_number', 'total_amount'],
  )
  assert.deepEqual(
    first.map((row) => row.operation),
    ['insert', 'insert'],
  )
  const second = planFieldWrites(
    first.map((row) => row.fieldKey),
    incoming,
  )
  assert.deepEqual(
    second.map((row) => row.operation),
    ['update', 'update'],
  )
  assert.equal(new Set(second.map((row) => row.fieldKey)).size, second.length)
})

test('gaps count as pending and a carried-over value counts only as carried over', () => {
  assert.deepEqual(countProgress(['pending', 'approved', 'corrected', 'carried_over']), {
    pending: 1,
    approved: 1,
    corrected: 1,
    carriedOver: 1,
  })
})

test('field catalog matches the fixture', () => {
  const fixture = JSON.parse(
    readFileSync(path.resolve(__dirname, '../../../../fixtures/expected-fields.json'), 'utf8'),
  ) as unknown
  assert.deepEqual(fixture, fieldCatalog)
})
