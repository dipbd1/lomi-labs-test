import './load-env'
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ExtractionQueue } from './extraction.queue'
import { PrismaService } from './prisma.service'
import { versionsToRequeue } from './recovery'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const prisma = app.get(PrismaService)
  const queue = app.get(ExtractionQueue)
  const versions = await prisma.documentVersion.findMany({
    where: { status: { in: ['queued', 'extracting'] } },
    select: { id: true, status: true },
  })
  for (const versionId of versionsToRequeue(versions)) {
    await queue.enqueue(versionId)
  }
  await app.listen(process.env.PORT ?? 3000)
}

void bootstrap()
