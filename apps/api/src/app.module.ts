import { Module } from '@nestjs/common'
import { ApiController } from './documents/api.controller'
import { DocumentsService } from './documents/documents.service'
import { PrismaService } from './documents/prisma.service'
import { ExtractionQueue } from './extraction/extraction.queue'

@Module({
  controllers: [ApiController],
  providers: [PrismaService, ExtractionQueue, DocumentsService],
})
export class AppModule {}
