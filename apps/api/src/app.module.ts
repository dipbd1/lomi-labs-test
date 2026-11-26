import { Module } from '@nestjs/common'
import { ApiController } from './api.controller'
import { DocumentsService } from './documents.service'
import { ExtractionQueue } from './extraction.queue'
import { PrismaService } from './prisma.service'

@Module({
  controllers: [ApiController],
  providers: [PrismaService, ExtractionQueue, DocumentsService],
})
export class AppModule {}
