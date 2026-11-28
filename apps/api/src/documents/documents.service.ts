import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  documentTypeSchema,
  fieldsFor,
  reviewRequestSchema,
  type ClearedDocuments,
  type CreatedDocument,
  type DocumentDetail,
  type DocumentListItem,
  type ExtractedValueView,
  type PreviousValueView,
  type ProgressCounts,
  type ReviewView,
} from '@lomi/contracts'
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Prisma, type Document } from '@prisma/client'
import { ExtractionQueue } from '../extraction/extraction.queue'
import { countProgress } from './progress'
import { PrismaService } from './prisma.service'
import { pathsInsideDirectory } from './stored-pdf'

type UploadedPdf = {
  originalname: string
  mimetype: string
  buffer: Buffer
}

type ValueRow = Prisma.ExtractedValueGetPayload<{
  include: {
    reviews: true
    previousValue: { include: { reviews: true } }
  }
}>

function pdfDirectory(): string {
  return process.env.PDF_DIR ?? path.resolve(process.cwd(), 'data/pdfs')
}

function documentTitle(fileName: string, title?: string): string {
  const trimmed = title?.trim()
  if (trimmed) return trimmed
  return fileName.replace(/\.pdf$/i, '') || fileName
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function assertPdf(file: UploadedPdf) {
  if (!file.buffer.subarray(0, 4).toString('utf8').startsWith('%PDF')) {
    throw new BadRequestException('File must be a PDF')
  }
}

type PurgeScope = 'all' | { documentId: string; versionIds: string[] }

async function purgeDocuments(tx: Prisma.TransactionClient, scope: PurgeScope): Promise<number> {
  if (scope === 'all') {
    const count = await tx.document.count()
    await tx.review.deleteMany()
    await tx.extractedValue.updateMany({ data: { carriedFromId: null, previousValueId: null } })
    await tx.extractedValue.deleteMany()
    await tx.extractionRun.deleteMany()
    await tx.documentVersion.deleteMany()
    await tx.document.deleteMany()
    return count
  }
  await tx.review.deleteMany({ where: { value: { versionId: { in: scope.versionIds } } } })
  await tx.extractedValue.updateMany({
    where: { versionId: { in: scope.versionIds } },
    data: { carriedFromId: null, previousValueId: null },
  })
  await tx.extractedValue.deleteMany({ where: { versionId: { in: scope.versionIds } } })
  await tx.extractionRun.deleteMany({ where: { versionId: { in: scope.versionIds } } })
  await tx.documentVersion.deleteMany({ where: { documentId: scope.documentId } })
  await tx.document.delete({ where: { id: scope.documentId } })
  return 1
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ExtractionQueue,
  ) {}

  async list(): Promise<DocumentListItem[]> {
    const documents = await this.prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        versions: {
          orderBy: { number: 'desc' },
          take: 1,
          include: { values: { select: { reviewState: true } } },
        },
      },
    })
    return documents.flatMap((document) => {
      const version = document.versions[0]
      if (!version) return []
      return [
        {
          id: document.id,
          title: document.title,
          type: document.type,
          currentVersionNumber: version.number,
          status: version.status,
          progress: countProgress(version.values.map((value) => value.reviewState)),
        },
      ]
    })
  }

  async get(id: string): Promise<DocumentDetail> {
    const document = await this.requireDocument(id)
    const versions = await this.versionNumbers(id)
    const current = versions[versions.length - 1]
    if (current === undefined) throw new NotFoundException('Version not found')
    return this.detail(document, current, versions)
  }

  async getVersion(id: string, number: number): Promise<DocumentDetail> {
    const document = await this.requireDocument(id)
    return this.detail(document, number, await this.versionNumbers(id))
  }

  async progress(id: string): Promise<ProgressCounts> {
    await this.requireDocument(id)
    const current = await this.latestVersion(id)
    const values = await this.prisma.extractedValue.findMany({
      where: { versionId: current.id },
      select: { reviewState: true },
    })
    return countProgress(values.map((value) => value.reviewState))
  }

  async create(file: UploadedPdf, type: string, title?: string): Promise<CreatedDocument> {
    assertPdf(file)
    const parsed = documentTypeSchema.safeParse(type)
    if (!parsed.success) throw new BadRequestException('Type must be invoice, lease, or market_report')
    const id = randomUUID()
    const versionId = randomUUID()
    const pdfPath = await this.storePdf(versionId, file.buffer)
    const document = await this.prisma.document.create({
      data: {
        id,
        type: parsed.data,
        title: documentTitle(file.originalname, title),
        versions: {
          create: { id: versionId, number: 1, pdfPath, status: 'queued' },
        },
      },
    })
    await this.enqueue(versionId)
    return {
      id: document.id,
      title: document.title,
      type: document.type,
      versionNumber: 1,
      status: 'queued',
    }
  }

  async addVersion(id: string, file: UploadedPdf): Promise<CreatedDocument> {
    assertPdf(file)
    const document = await this.requireDocument(id)
    const latest = await this.latestVersion(id)
    const versionId = randomUUID()
    const pdfPath = await this.storePdf(versionId, file.buffer)
    const number = latest.number + 1
    await this.prisma.documentVersion.create({
      data: { id: versionId, documentId: id, number, pdfPath, status: 'queued' },
    })
    await this.enqueue(versionId)
    return {
      id: document.id,
      title: document.title,
      type: document.type,
      versionNumber: number,
      status: 'queued',
    }
  }

  async clear(): Promise<ClearedDocuments> {
    await this.queue.pauseAndDrain()
    try {
      const versions = await this.prisma.documentVersion.findMany({ select: { pdfPath: true } })
      const deleted = await this.prisma.$transaction((tx) => purgeDocuments(tx, 'all'))
      await this.removePdfs(versions.map((version) => version.pdfPath))
      return { deleted }
    } finally {
      await this.queue.resume()
    }
  }

  async remove(id: string): Promise<ClearedDocuments> {
    await this.requireDocument(id)
    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId: id },
      select: { id: true, pdfPath: true },
    })
    const versionIds = versions.map((version) => version.id)
    await this.removeJobs(versionIds)
    await this.prisma.$transaction((tx) => purgeDocuments(tx, { documentId: id, versionIds }))
    await this.removePdfs(versions.map((version) => version.pdfPath))
    await this.removeJobs(versionIds)
    return { deleted: 1 }
  }

  async retry(id: string): Promise<CreatedDocument> {
    const document = await this.requireDocument(id)
    const current = await this.latestVersion(id)
    if (current.status !== 'failed') throw new ConflictException('Only a failed version can be retried')
    await this.prisma.documentVersion.update({
      where: { id: current.id },
      data: { status: 'queued', error: null },
    })
    await this.enqueue(current.id)
    return {
      id: document.id,
      title: document.title,
      type: document.type,
      versionNumber: current.number,
      status: 'queued',
    }
  }

  async review(valueId: string, body: unknown) {
    const parsed = reviewRequestSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException('Invalid review')
    const row = await this.prisma.extractedValue.findUnique({ where: { id: valueId } })
    if (!row) throw new NotFoundException('Value not found')
    switch (parsed.data.action) {
      case 'approve':
        if (row.value === null) throw new BadRequestException('Cannot approve a gap')
        await this.prisma.$transaction([
          this.prisma.review.create({ data: { valueId, action: 'approve' } }),
          this.prisma.extractedValue.update({ where: { id: valueId }, data: { reviewState: 'approved' } }),
        ])
        return { id: valueId, reviewState: 'approved' as const }
      case 'correct':
        await this.prisma.$transaction([
          this.prisma.review.create({
            data: {
              valueId,
              action: 'correct',
              correctedValue: parsed.data.value,
              note: parsed.data.note ? parsed.data.note : null,
            },
          }),
          this.prisma.extractedValue.update({ where: { id: valueId }, data: { reviewState: 'corrected' } }),
        ])
        return { id: valueId, reviewState: 'corrected' as const }
      default: {
        const unreachable: never = parsed.data
        throw new BadRequestException(String(unreachable))
      }
    }
  }

  private async detail(document: Document, number: number, versionNumbers: number[]): Promise<DocumentDetail> {
    const version = await this.prisma.documentVersion.findUnique({
      where: { documentId_number: { documentId: document.id, number } },
      include: {
        values: {
          include: {
            reviews: { orderBy: { createdAt: 'desc' }, take: 1 },
            previousValue: { include: { reviews: { orderBy: { createdAt: 'desc' }, take: 1 } } },
          },
        },
      },
    })
    if (!version) throw new NotFoundException('Version not found')
    const current = versionNumbers[versionNumbers.length - 1]
    if (current === undefined) throw new NotFoundException('Version not found')
    const order = new Map(fieldsFor(document.type).map((field, index) => [field.field, index]))
    const values = version.values
      .map((value) => this.toValue(value))
      .sort((a, b) => (order.get(a.fieldKey) ?? 0) - (order.get(b.fieldKey) ?? 0))
    return {
      id: document.id,
      title: document.title,
      type: document.type,
      currentVersionNumber: current,
      versionNumbers,
      version: {
        id: version.id,
        number: version.number,
        status: version.status,
        error: version.error,
        parsedText: version.parsedText,
        values,
      },
    }
  }

  private toValue(value: ValueRow): ExtractedValueView {
    return {
      id: value.id,
      fieldKey: value.fieldKey,
      value: value.value,
      gapReason: value.gapReason,
      evidence: value.evidence,
      reviewState: value.reviewState,
      latestReview: this.toReview(value.reviews[0]),
      previous: value.previousValue ? this.toPrevious(value.previousValue) : null,
    }
  }

  private toPrevious(value: NonNullable<ValueRow['previousValue']>): PreviousValueView {
    return {
      id: value.id,
      value: value.value,
      gapReason: value.gapReason,
      evidence: value.evidence,
      reviewState: value.reviewState,
      latestReview: this.toReview(value.reviews[0]),
    }
  }

  private toReview(review: ValueRow['reviews'][number] | undefined): ReviewView | null {
    if (!review) return null
    return {
      action: review.action,
      value: review.correctedValue,
      note: review.note,
      createdAt: review.createdAt.toISOString(),
    }
  }

  private async requireDocument(id: string) {
    const document = await this.prisma.document.findUnique({ where: { id } })
    if (!document) throw new NotFoundException('Document not found')
    return document
  }

  private async latestVersion(documentId: string) {
    const version = await this.prisma.documentVersion.findFirst({
      where: { documentId },
      orderBy: { number: 'desc' },
    })
    if (!version) throw new NotFoundException('Version not found')
    return version
  }

  private async versionNumbers(documentId: string) {
    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId },
      orderBy: { number: 'asc' },
      select: { number: true },
    })
    return versions.map((version) => version.number)
  }

  private async storePdf(versionId: string, bytes: Buffer) {
    const directory = pdfDirectory()
    await mkdir(directory, { recursive: true })
    const pdfPath = path.join(directory, `${versionId}.pdf`)
    await writeFile(pdfPath, bytes)
    return pdfPath
  }

  private async removePdfs(pdfPaths: string[]) {
    for (const pdfPath of pathsInsideDirectory(pdfDirectory(), pdfPaths)) {
      try {
        await unlink(pdfPath)
      } catch (error) {
        if (isMissingFile(error)) continue
        throw error
      }
    }
  }

  private async enqueue(versionId: string) {
    try {
      await this.queue.enqueue(versionId)
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : `Enqueue failed for ${versionId}`)
    }
  }

  private async removeJobs(versionIds: string[]) {
    for (const versionId of versionIds) {
      await this.queue.remove(versionId)
    }
  }
}
