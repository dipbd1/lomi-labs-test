CREATE TYPE "DocumentType" AS ENUM ('invoice', 'lease', 'market_report');

CREATE TYPE "VersionStatus" AS ENUM ('queued', 'extracting', 'extracted', 'failed');

CREATE TYPE "ReviewState" AS ENUM ('pending', 'approved', 'corrected', 'carried_over');

CREATE TYPE "ReviewAction" AS ENUM ('approve', 'correct');

CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "pdfPath" TEXT NOT NULL,
    "parsedText" TEXT,
    "status" "VersionStatus" NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExtractionRun" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "rawResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractionRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExtractedValue" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "value" TEXT,
    "gapReason" TEXT,
    "evidence" TEXT,
    "reviewState" "ReviewState" NOT NULL DEFAULT 'pending',
    "carriedFromId" TEXT,
    "previousValueId" TEXT,

    CONSTRAINT "ExtractedValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "valueId" TEXT NOT NULL,
    "action" "ReviewAction" NOT NULL,
    "correctedValue" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentVersion_documentId_number_key" ON "DocumentVersion"("documentId", "number");

CREATE INDEX "DocumentVersion_status_idx" ON "DocumentVersion"("status");

CREATE UNIQUE INDEX "ExtractedValue_versionId_fieldKey_key" ON "ExtractedValue"("versionId", "fieldKey");

CREATE INDEX "Review_valueId_idx" ON "Review"("valueId");

ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExtractionRun" ADD CONSTRAINT "ExtractionRun_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExtractedValue" ADD CONSTRAINT "ExtractedValue_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExtractedValue" ADD CONSTRAINT "ExtractedValue_carriedFromId_fkey" FOREIGN KEY ("carriedFromId") REFERENCES "ExtractedValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExtractedValue" ADD CONSTRAINT "ExtractedValue_previousValueId_fkey" FOREIGN KEY ("previousValueId") REFERENCES "ExtractedValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Review" ADD CONSTRAINT "Review_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "ExtractedValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
