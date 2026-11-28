import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { DocumentsService } from './documents.service'

type UploadedPdf = {
  originalname: string
  mimetype: string
  buffer: Buffer
}

function asUpload(file: UploadedPdf | undefined): UploadedPdf {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) throw new BadRequestException('PDF file is required')
  return file
}

@Controller()
export class ApiController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('health')
  health() {
    return { ok: true }
  }

  @Get('documents')
  list() {
    return this.documents.list()
  }

  @Delete('documents')
  clear() {
    return this.documents.clear()
  }

  @Delete('documents/:id')
  remove(@Param('id') id: string) {
    return this.documents.remove(id)
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  create(
    @UploadedFile() file: UploadedPdf | undefined,
    @Body('type') type: string,
    @Body('title') title?: string,
  ) {
    return this.documents.create(asUpload(file), type, title)
  }

  @Get('documents/:id')
  get(@Param('id') id: string) {
    return this.documents.get(id)
  }

  @Post('documents/:id/versions')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  addVersion(@Param('id') id: string, @UploadedFile() file: UploadedPdf | undefined) {
    return this.documents.addVersion(id, asUpload(file))
  }

  @Get('documents/:id/versions/:number')
  getVersion(@Param('id') id: string, @Param('number') number: string) {
    return this.documents.getVersion(id, parseVersion(number))
  }

  @Get('documents/:id/progress')
  progress(@Param('id') id: string) {
    return this.documents.progress(id)
  }

  @Post('documents/:id/retry')
  @HttpCode(200)
  retry(@Param('id') id: string) {
    return this.documents.retry(id)
  }

  @Post('values/:id/review')
  @HttpCode(200)
  review(@Param('id') id: string, @Body() body: unknown) {
    return this.documents.review(id, body)
  }
}

function parseVersion(value: string): number {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) throw new BadRequestException('Invalid version')
  return number
}
