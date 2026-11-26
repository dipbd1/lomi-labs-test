import { documentTypeSchema } from '@lomi/contracts'
import { PrismaClient } from '@prisma/client'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const prisma = new PrismaClient()

type ManifestDoc = {
  id: string
  type: string
  title: string
  versions: { version: number; file: string }[]
}

function isManifestDoc(value: unknown): value is ManifestDoc {
  if (typeof value !== 'object' || value === null) return false
  const record = value as { id?: unknown; type?: unknown; title?: unknown; versions?: unknown }
  return (
    typeof record.id === 'string' &&
    typeof record.type === 'string' &&
    typeof record.title === 'string' &&
    Array.isArray(record.versions)
  )
}

async function main() {
  const fixturesDir = process.env.FIXTURES_DIR ?? path.resolve(__dirname, '../../../fixtures')
  const pdfDir = process.env.PDF_DIR ?? path.resolve(process.cwd(), 'data/pdfs')
  const raw: unknown = JSON.parse(await readFile(path.join(fixturesDir, 'documents.json'), 'utf8'))
  if (!Array.isArray(raw)) throw new Error('Invalid documents manifest')
  await mkdir(pdfDir, { recursive: true })
  let created = 0
  for (const entry of raw) {
    if (!isManifestDoc(entry)) throw new Error('Invalid documents manifest')
    const existing = await prisma.document.findUnique({ where: { id: entry.id } })
    if (existing) continue
    const version = entry.versions.find((item) => item.version === 1 && typeof item.file === 'string')
    if (!version?.file) continue
    const type = documentTypeSchema.parse(entry.type)
    const versionId = `${entry.id}-v1`
    const dest = path.join(pdfDir, `${versionId}.pdf`)
    await copyFile(path.join(fixturesDir, version.file), dest)
    await prisma.document.create({
      data: {
        id: entry.id,
        type,
        title: entry.title,
        versions: {
          create: {
            id: versionId,
            number: 1,
            pdfPath: dest,
            status: 'queued',
          },
        },
      },
    })
    created += 1
  }
  console.log(`seeded ${created} documents`)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
