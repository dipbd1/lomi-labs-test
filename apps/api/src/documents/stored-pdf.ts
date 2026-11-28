import path from 'node:path'

export function pathsInsideDirectory(directory: string, paths: readonly string[]): string[] {
  const root = path.resolve(directory)
  return paths.filter((pdfPath) => isInsideDirectory(root, pdfPath))
}

function isInsideDirectory(root: string, filePath: string): boolean {
  const relative = path.relative(root, path.resolve(filePath))
  if (relative === '' || relative === '..') return false
  if (relative.startsWith(`..${path.sep}`)) return false
  if (path.isAbsolute(relative)) return false
  return true
}
