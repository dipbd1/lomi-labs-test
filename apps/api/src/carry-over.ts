export type StoredReview = {
  action: 'approve' | 'correct'
  correctedValue: string | null
  note: string | null
}

export type PriorField = {
  id: string
  evidence: string | null
  latestReview: StoredReview | null
}

export type CarryDecision = {
  reviewState: 'pending' | 'carried_over'
  carriedFromId: string | null
  previousValueId: string | null
  copiedReview: StoredReview | null
}

export function normalizeEvidence(value: string | null | undefined): string | null {
  if (value == null) return null
  const collapsed = value.replace(/\s+/g, ' ').trim()
  return collapsed.length === 0 ? null : collapsed
}

export function decideCarryOver(
  next: { value: string | null; evidence: string | null },
  prior: PriorField | null,
): CarryDecision {
  if (!prior) {
    return { reviewState: 'pending', carriedFromId: null, previousValueId: null, copiedReview: null }
  }
  const same =
    normalizeEvidence(prior.evidence) !== null &&
    normalizeEvidence(prior.evidence) === normalizeEvidence(next.evidence)
  if (next.value === null || !same) {
    return {
      reviewState: 'pending',
      carriedFromId: null,
      previousValueId: same ? null : prior.id,
      copiedReview: null,
    }
  }
  if (!prior.latestReview) {
    return { reviewState: 'pending', carriedFromId: null, previousValueId: null, copiedReview: null }
  }
  return {
    reviewState: 'carried_over',
    carriedFromId: prior.id,
    previousValueId: null,
    copiedReview: prior.latestReview,
  }
}
