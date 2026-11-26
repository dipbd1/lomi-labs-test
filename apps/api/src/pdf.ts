import { readFile } from 'node:fs/promises'

const runtime = globalThis as { Iterator?: new () => unknown }
if (typeof runtime.Iterator !== 'function') runtime.Iterator = class Iterator {}

type UnpdfModule = {
  extractText: (data: Uint8Array, options: { mergePages: true }) => Promise<{ text: string }>
}

const loadUnpdf = new Function('return import("unpdf")') as () => Promise<UnpdfModule>

export async function readPdf(filePath: string): Promise<string> {
  const { extractText } = await loadUnpdf()
  const bytes = new Uint8Array(await readFile(filePath))
  const extracted = await extractText(bytes, { mergePages: true })
  return extracted.text
}
