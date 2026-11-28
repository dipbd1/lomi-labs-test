import assert from 'node:assert/strict'
import test from 'node:test'
import { canApprove, formatBytes, isPdfFile } from './src/format'

const review = (action: 'approve' | 'correct') => ({ action })

test('a pending or corrected value can be approved', () => {
  assert.equal(canApprove({ value: 'INV-1', reviewState: 'pending', latestReview: null }), true)
  assert.equal(canApprove({ value: 'INV-1', reviewState: 'corrected', latestReview: review('correct') }), true)
})

test('an approved value cannot be approved again', () => {
  assert.equal(canApprove({ value: 'INV-1', reviewState: 'approved', latestReview: review('approve') }), false)
})

test('carry-over follows the copied review', () => {
  assert.equal(canApprove({ value: 'INV-1', reviewState: 'carried_over', latestReview: review('approve') }), false)
  assert.equal(canApprove({ value: 'INV-1', reviewState: 'carried_over', latestReview: review('correct') }), true)
  assert.equal(canApprove({ value: 'INV-1', reviewState: 'carried_over', latestReview: null }), false)
})

test('a gap cannot be approved', () => {
  assert.equal(canApprove({ value: null, reviewState: 'pending', latestReview: null }), false)
})

test('a pdf is recognized by type or extension', () => {
  assert.equal(isPdfFile({ name: 'invoice.txt', type: 'application/pdf' }), true)
  assert.equal(isPdfFile({ name: 'Invoice.PDF', type: '' }), true)
  assert.equal(isPdfFile({ name: 'notes.txt', type: 'text/plain' }), false)
  assert.equal(isPdfFile({ name: 'file.pdf.exe', type: 'application/octet-stream' }), false)
})

test('file sizes use bytes until the next unit', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(1024), '1 KB')
  assert.equal(formatBytes(1536), '1.5 KB')
  assert.equal(formatBytes(10 * 1024), '10 KB')
  assert.equal(formatBytes(1024 * 1024), '1 MB')
  assert.equal(formatBytes(Number.NaN), '0 B')
})
