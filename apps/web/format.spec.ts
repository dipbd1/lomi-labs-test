import assert from 'node:assert/strict'
import test from 'node:test'
import { canApprove } from './src/format'

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
