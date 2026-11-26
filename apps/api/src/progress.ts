export type ReviewState = 'pending' | 'approved' | 'corrected' | 'carried_over'

export type ProgressCounts = {
  pending: number
  approved: number
  corrected: number
  carriedOver: number
}

export function countProgress(states: ReviewState[]): ProgressCounts {
  const counts: ProgressCounts = { pending: 0, approved: 0, corrected: 0, carriedOver: 0 }
  for (const state of states) {
    switch (state) {
      case 'pending':
        counts.pending += 1
        break
      case 'approved':
        counts.approved += 1
        break
      case 'corrected':
        counts.corrected += 1
        break
      case 'carried_over':
        counts.carriedOver += 1
        break
      default: {
        const unreachable: never = state
        throw new Error(unreachable)
      }
    }
  }
  return counts
}
