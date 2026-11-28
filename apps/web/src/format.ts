import type { DocumentType, ReviewAction, ReviewState, VersionStatus } from '@lomi/contracts'

export function statusColor(status: VersionStatus): string {
  switch (status) {
    case 'queued':
      return 'gray'
    case 'extracting':
      return 'yellow'
    case 'extracted':
      return 'green'
    case 'failed':
      return 'red'
    default: {
      const unreachable: never = status
      return unreachable
    }
  }
}

export function reviewColor(state: ReviewState): string {
  switch (state) {
    case 'pending':
      return 'yellow'
    case 'approved':
      return 'green'
    case 'corrected':
      return 'blue'
    case 'carried_over':
      return 'gray'
    default: {
      const unreachable: never = state
      return unreachable
    }
  }
}

export function typeLabel(type: DocumentType): string {
  switch (type) {
    case 'invoice':
      return 'Invoice'
    case 'lease':
      return 'Lease'
    case 'market_report':
      return 'Market report'
    default: {
      const unreachable: never = type
      return unreachable
    }
  }
}

export function fieldLabel(fieldKey: string): string {
  return fieldKey
    .split('_')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ')
}

export function attentionRank(value: { reviewState: ReviewState; value: string | null }): number {
  if (value.reviewState === 'pending' || value.value === null) return 0
  return 1
}

export function canApprove(value: {
  value: string | null
  reviewState: ReviewState
  latestReview: { action: ReviewAction } | null
}): boolean {
  if (value.value === null) return false
  switch (value.reviewState) {
    case 'pending':
    case 'corrected':
      return true
    case 'approved':
      return false
    case 'carried_over':
      return value.latestReview?.action === 'correct'
    default: {
      const unreachable: never = value.reviewState
      return unreachable
    }
  }
}
