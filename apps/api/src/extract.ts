import type { DocumentType } from '@lomi/contracts'
import { fieldsFor } from '@lomi/contracts'
import type { PrismaClient } from '@prisma/client'
import { decideCarryOver } from './carry-over'
import { applyEvidence } from './evidence'
import { buildPrompt, parseModelFields, type ModelField } from './gemini'
import { generateExtraction, resolveInference } from './inference'
import { readPdf } from './pdf'
import { planFieldWrites } from './recovery'

async function markFailed(prisma: PrismaClient, versionId: string, error: string) {
  await prisma.documentVersion.updateMany({
    where: { id: versionId, status: { not: 'extracted' } },
    data: { status: 'failed', error },
  })
}

export async function runExtraction(prisma: PrismaClient, versionId: string): Promise<void> {
  const version = await prisma.documentVersion.findUnique({
    where: { id: versionId },
    include: { document: true },
  })
  if (!version || version.status === 'extracted') return

  const claimed = await prisma.documentVersion.updateMany({
    where: { id: versionId, status: { not: 'extracted' } },
    data: { status: 'extracting', error: null },
  })
  if (claimed.count === 0) return

  const text = version.parsedText !== null ? version.parsedText : await readPdf(version.pdfPath)
  if (!text.trim()) {
    await markFailed(prisma, versionId, 'Parsed text is empty')
    return
  }
  await prisma.documentVersion.update({ where: { id: versionId }, data: { parsedText: text } })

  const target = resolveInference()
  if (!target.apiKey) {
    await markFailed(prisma, versionId, target.missingKeyMessage)
    return
  }

  const prompt = buildPrompt(version.document.type, text)
  let raw: string
  try {
    raw = await generateExtraction(version.document.type, prompt)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Model request failed'
    await prisma.extractionRun.create({ data: { versionId, prompt, rawResponse: message } })
    throw new Error(message, { cause: error })
  }
  await prisma.extractionRun.create({ data: { versionId, prompt, rawResponse: raw } })
  await persistFields(prisma, version, text, parseModelFields(raw))
}

async function persistFields(
  prisma: PrismaClient,
  version: { id: string; documentId: string; number: number; document: { type: DocumentType } },
  text: string,
  modelFields: ModelField[],
) {
  const byKey = new Map(modelFields.map((field) => [field.field, field]))
  const checked = fieldsFor(version.document.type).map((field) => {
    const item = byKey.get(field.field)
    if (!item) {
      return { fieldKey: field.field, value: null, evidence: null, gapReason: 'Field not returned' }
    }
    return {
      fieldKey: field.field,
      ...applyEvidence({
        parsedText: text,
        value: item.value,
        evidence: item.evidence,
        gapReason: item.gapReason,
      }),
    }
  })

  const previous =
    version.number > 1
      ? await prisma.documentVersion.findUnique({
          where: { documentId_number: { documentId: version.documentId, number: version.number - 1 } },
        })
      : null
  const priorRows =
    previous && previous.status === 'extracted'
      ? await prisma.extractedValue.findMany({
          where: { versionId: previous.id },
          include: { reviews: { orderBy: { createdAt: 'desc' }, take: 1 } },
        })
      : []
  const priorByKey = new Map(
    priorRows.map((row) => {
      const review = row.reviews[0]
      return [
        row.fieldKey,
        {
          id: row.id,
          evidence: row.evidence,
          latestReview: review
            ? { action: review.action, correctedValue: review.correctedValue, note: review.note }
            : null,
        },
      ] as const
    }),
  )

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${version.id})::bigint)`
    const current = await tx.documentVersion.findUnique({ where: { id: version.id } })
    if (!current || current.status === 'extracted') return
    const existing = await tx.extractedValue.findMany({
      where: { versionId: version.id },
      select: { fieldKey: true },
    })
    const planned = planFieldWrites(
      existing.map((row) => row.fieldKey),
      checked,
    )
    for (const field of planned) {
      const decision = decideCarryOver(
        { value: field.value, evidence: field.evidence },
        priorByKey.get(field.fieldKey) ?? null,
      )
      const saved = await tx.extractedValue.upsert({
        where: { versionId_fieldKey: { versionId: version.id, fieldKey: field.fieldKey } },
        create: {
          versionId: version.id,
          fieldKey: field.fieldKey,
          value: field.value,
          gapReason: field.gapReason,
          evidence: field.evidence,
          reviewState: decision.reviewState,
          carriedFromId: decision.carriedFromId,
          previousValueId: decision.previousValueId,
        },
        update: {
          value: field.value,
          gapReason: field.gapReason,
          evidence: field.evidence,
          reviewState: decision.reviewState,
          carriedFromId: decision.carriedFromId,
          previousValueId: decision.previousValueId,
        },
      })
      if (!decision.copiedReview) continue
      const reviewCount = await tx.review.count({ where: { valueId: saved.id } })
      if (reviewCount > 0) continue
      await tx.review.create({
        data: {
          valueId: saved.id,
          action: decision.copiedReview.action,
          correctedValue: decision.copiedReview.correctedValue,
          note: decision.copiedReview.note,
        },
      })
    }
    await tx.documentVersion.update({
      where: { id: version.id },
      data: { status: 'extracted', error: null },
    })
  })
}
