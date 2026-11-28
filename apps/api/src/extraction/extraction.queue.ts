import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common'
import { DelayedError, Queue, Worker, type Job } from 'bullmq'
import type { RedisOptions } from 'ioredis'
import { PrismaService } from '../documents/prisma.service'
import { runExtraction } from './extract'
import { extractionJobId, waitForPrevious } from './recovery'

function redisOptions(): RedisOptions {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379')
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  }
}

@Injectable()
export class ExtractionQueue implements OnModuleDestroy {
  private readonly logger = new Logger(ExtractionQueue.name)
  private readonly queue: Queue<{ versionId: string }>
  private readonly worker: Worker<{ versionId: string }>

  constructor(private readonly prisma: PrismaService) {
    this.queue = new Queue('extraction', { connection: redisOptions() })
    this.worker = new Worker<{ versionId: string }>(
      'extraction',
      (job, token) => this.process(job, token),
      {
        connection: redisOptions(),
        concurrency: 2,
        lockDuration: 120_000,
        stalledInterval: 120_000,
        maxStalledCount: 1,
      },
    )
    this.worker.on('failed', (job, error) => {
      void this.onFailed(job, error)
    })
  }

  async onModuleDestroy() {
    await this.worker.close()
    await this.queue.close()
  }

  async pauseAndDrain(): Promise<void> {
    await this.worker.pause()
    await this.queue.pause()
    await this.queue.obliterate({ force: true })
  }

  async resume(): Promise<void> {
    await this.queue.resume()
    this.worker.resume()
  }

  async remove(versionId: string): Promise<'absent' | 'removed' | 'active'> {
    const existing = await this.queue.getJob(extractionJobId(versionId))
    if (!existing) return 'absent'
    try {
      await existing.remove()
      return 'removed'
    } catch (error) {
      const state = await existing.getState()
      if (state === 'active') return 'active'
      throw error
    }
  }

  async enqueue(versionId: string): Promise<void> {
    const outcome = await this.remove(versionId)
    switch (outcome) {
      case 'active':
        return
      case 'absent':
      case 'removed':
        break
      default: {
        const unreachable: never = outcome
        throw new Error(unreachable)
      }
    }
    const jobId = extractionJobId(versionId)
    await this.queue.add(
      'extract',
      { versionId },
      {
        jobId,
        attempts: 2,
        backoff: { type: 'fixed', delay: 1000 },
        removeOnComplete: true,
      },
    )
  }

  private async process(job: Job<{ versionId: string }>, token?: string): Promise<void> {
    const version = await this.prisma.documentVersion.findUnique({ where: { id: job.data.versionId } })
    if (!version || version.status === 'extracted') return
    const previous =
      version.number > 1
        ? await this.prisma.documentVersion.findUnique({
            where: {
              documentId_number: { documentId: version.documentId, number: version.number - 1 },
            },
          })
        : null
    if (waitForPrevious(previous?.status ?? null)) {
      if (!token) throw new Error('Missing job token')
      await job.moveToDelayed(Date.now() + 2000, token)
      throw new DelayedError()
    }
    await runExtraction(this.prisma, version.id)
  }

  private async onFailed(job: Job<{ versionId: string }> | undefined, error: Error) {
    if (!job) return
    const attempts = job.opts.attempts ?? 1
    if (job.attemptsMade < attempts) return
    try {
      await this.prisma.documentVersion.updateMany({
        where: { id: job.data.versionId, status: { not: 'extracted' } },
        data: { status: 'failed', error: error.message },
      })
    } catch (updateError) {
      this.logger.error(updateError instanceof Error ? updateError.message : 'Failed to record extraction failure')
    }
  }
}
