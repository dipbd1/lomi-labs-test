export type VersionStatus = 'queued' | 'extracting' | 'extracted' | 'failed'

export function extractionJobId(versionId: string): string {
  return `extract-${versionId}`
}

export function versionsToRequeue(versions: { id: string; status: VersionStatus }[]): string[] {
  return versions
    .filter((version) => {
      switch (version.status) {
        case 'queued':
        case 'extracting':
          return true
        case 'extracted':
        case 'failed':
          return false
        default: {
          const unreachable: never = version.status
          throw new Error(unreachable)
        }
      }
    })
    .map((version) => version.id)
}

export function waitForPrevious(status: VersionStatus | null): boolean {
  if (status === null) return false
  switch (status) {
    case 'queued':
    case 'extracting':
      return true
    case 'extracted':
    case 'failed':
      return false
    default: {
      const unreachable: never = status
      return unreachable
    }
  }
}

export function planFieldWrites<T extends { fieldKey: string }>(
  existingFieldKeys: string[],
  incoming: T[],
): Array<T & { operation: 'insert' | 'update' }> {
  const existing = new Set(existingFieldKeys)
  const seen = new Set<string>()
  const planned: Array<T & { operation: 'insert' | 'update' }> = []
  for (const row of incoming) {
    if (seen.has(row.fieldKey)) continue
    seen.add(row.fieldKey)
    planned.push({ ...row, operation: existing.has(row.fieldKey) ? 'update' : 'insert' })
  }
  return planned
}
