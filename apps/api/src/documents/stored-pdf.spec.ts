import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { pathsInsideDirectory } from './stored-pdf'

test('only pdf paths inside the storage directory are removed', () => {
  const directory = path.resolve('/data/pdfs')
  const inside = path.join(directory, 'version.pdf')
  const nested = path.join(directory, 'nested', 'version.pdf')
  const outside = path.resolve('/tmp/other.pdf')
  const escaped = path.join(directory, '..', 'secret.pdf')
  const sibling = path.resolve('/data/pdfs-evil/version.pdf')
  assert.deepEqual(pathsInsideDirectory(directory, [inside, nested, outside, escaped, sibling, directory]), [
    inside,
    nested,
  ])
})
