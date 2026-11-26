const missingEvidence = 'Evidence was not in the document'

export function locateEvidence(parsedText: string, quote: string): string | null {
  const exact = quote.trim()
  const needle = exact.replace(/\s+/g, ' ')
  if (!needle) return null
  const exactAt = parsedText.indexOf(exact)
  if (exactAt !== -1) return parsedText.slice(exactAt, exactAt + exact.length)

  const map: number[] = []
  let collapsed = ''
  let index = 0
  while (index < parsedText.length) {
    const char = parsedText[index]
    if (char !== undefined && /\s/.test(char)) {
      const start = index
      while (index < parsedText.length && /\s/.test(parsedText[index] ?? '')) index += 1
      if (collapsed.length > 0 && index < parsedText.length) {
        collapsed += ' '
        map.push(start)
      }
      continue
    }
    if (char === undefined) break
    collapsed += char
    map.push(index)
    index += 1
  }

  const at = collapsed.indexOf(needle)
  if (at === -1) return null
  const start = map[at]
  const end = map[at + needle.length - 1]
  if (start === undefined || end === undefined) return null
  return parsedText.slice(start, end + 1)
}

export function applyEvidence(input: {
  parsedText: string
  value: string | null
  evidence: string | null
  gapReason: string | null
}): { value: string | null; evidence: string | null; gapReason: string | null } {
  const trimmed = input.value?.trim() ?? ''
  if (!trimmed) {
    return {
      value: null,
      evidence: null,
      gapReason: input.gapReason?.trim() || 'Field not found',
    }
  }
  if (!input.evidence?.trim()) {
    return { value: null, evidence: null, gapReason: missingEvidence }
  }
  const span = locateEvidence(input.parsedText, input.evidence)
  if (!span) return { value: null, evidence: null, gapReason: missingEvidence }
  return { value: trimmed, evidence: span, gapReason: null }
}
