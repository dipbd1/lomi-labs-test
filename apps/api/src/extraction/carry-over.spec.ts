import assert from 'node:assert/strict'
import test from 'node:test'
import { decideCarryOver, type PriorField } from './carry-over'

const approval: PriorField = {
  id: 'old',
  evidence: 'Total due $120.00',
  latestReview: { action: 'approve', correctedValue: null, note: null },
}

test('same evidence copies the review and marks carried_over', () => {
  const decision = decideCarryOver(
    { value: '$120.00', evidence: 'Total due\n$120.00' },
    approval,
  )
  assert.equal(decision.reviewState, 'carried_over')
  assert.equal(decision.carriedFromId, 'old')
  assert.equal(decision.previousValueId, null)
  assert.deepEqual(decision.copiedReview, approval.latestReview)
})

test('unreviewed unchanged evidence stays pending', () => {
  const decision = decideCarryOver(
    { value: '$120.00', evidence: 'Total due $120.00' },
    { id: 'old', evidence: 'Total due $120.00', latestReview: null },
  )
  assert.deepEqual(decision, {
    reviewState: 'pending',
    carriedFromId: null,
    previousValueId: null,
    copiedReview: null,
  })
})

test('changed evidence is pending and links the previous row', () => {
  const decision = decideCarryOver({ value: '$140.00', evidence: 'Total due $140.00' }, approval)
  assert.equal(decision.reviewState, 'pending')
  assert.equal(decision.previousValueId, 'old')
  assert.equal(decision.carriedFromId, null)
  assert.equal(decision.copiedReview, null)
})

test('gaps do not carry', () => {
  const decision = decideCarryOver({ value: null, evidence: 'Total due $120.00' }, approval)
  assert.equal(decision.reviewState, 'pending')
  assert.equal(decision.carriedFromId, null)
  assert.equal(decision.copiedReview, null)
})
