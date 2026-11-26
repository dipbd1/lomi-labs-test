import { z } from 'zod'

export const documentTypes = ['invoice', 'lease', 'market_report'] as const
export const versionStatuses = ['queued', 'extracting', 'extracted', 'failed'] as const
export const reviewStates = ['pending', 'approved', 'corrected', 'carried_over'] as const
export const reviewActions = ['approve', 'correct'] as const
export const fieldTypes = ['string', 'date', 'money', 'percent', 'number'] as const

export type DocumentType = (typeof documentTypes)[number]
export type VersionStatus = (typeof versionStatuses)[number]
export type ReviewState = (typeof reviewStates)[number]
export type ReviewAction = (typeof reviewActions)[number]
export type FieldType = (typeof fieldTypes)[number]

export const documentTypeSchema = z.enum(documentTypes)

export const reviewRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({
    action: z.literal('correct'),
    value: z.string().trim().min(1),
    note: z.string().trim().optional(),
  }),
])

export type ReviewRequest = z.infer<typeof reviewRequestSchema>

export const fieldCatalog = {
  invoice: [
    { field: 'invoice_number', type: 'string' },
    { field: 'issue_date', type: 'date' },
    { field: 'due_date', type: 'date' },
    { field: 'vendor_name', type: 'string' },
    { field: 'total_amount', type: 'money' },
  ],
  lease: [
    { field: 'tenant_name', type: 'string' },
    { field: 'monthly_rent', type: 'money' },
    { field: 'security_deposit', type: 'money' },
    { field: 'lease_start', type: 'date' },
    { field: 'term_months', type: 'number' },
  ],
  market_report: [
    { field: 'report_quarter', type: 'string' },
    { field: 'market_area', type: 'string' },
    { field: 'vacancy_rate', type: 'percent' },
    { field: 'average_rent_1br', type: 'money' },
    { field: 'year_over_year_rent_growth', type: 'percent' },
    { field: 'median_household_income', type: 'money' },
  ],
} as const satisfies Record<DocumentType, readonly { field: string; type: FieldType }[]>

export function fieldsFor(type: DocumentType): readonly { field: string; type: FieldType }[] {
  switch (type) {
    case 'invoice':
      return fieldCatalog.invoice
    case 'lease':
      return fieldCatalog.lease
    case 'market_report':
      return fieldCatalog.market_report
    default: {
      const unreachable: never = type
      throw new Error(unreachable)
    }
  }
}

export type ReviewView = {
  action: ReviewAction
  value: string | null
  note: string | null
  createdAt: string
}

export type PreviousValueView = {
  id: string
  value: string | null
  gapReason: string | null
  evidence: string | null
  reviewState: ReviewState
  latestReview: ReviewView | null
}

export type ExtractedValueView = {
  id: string
  fieldKey: string
  value: string | null
  gapReason: string | null
  evidence: string | null
  reviewState: ReviewState
  latestReview: ReviewView | null
  previous: PreviousValueView | null
}

export type VersionView = {
  id: string
  number: number
  status: VersionStatus
  error: string | null
  parsedText: string | null
  values: ExtractedValueView[]
}

export type DocumentDetail = {
  id: string
  title: string
  type: DocumentType
  currentVersionNumber: number
  versionNumbers: number[]
  version: VersionView
}

export type ProgressCounts = {
  pending: number
  approved: number
  corrected: number
  carriedOver: number
}

export type DocumentListItem = {
  id: string
  title: string
  type: DocumentType
  currentVersionNumber: number
  status: VersionStatus
  progress: ProgressCounts
}

export type CreatedDocument = {
  id: string
  title: string
  type: DocumentType
  versionNumber: number
  status: VersionStatus
}
