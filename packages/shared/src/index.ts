export const UserRole = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  INSPECTOR: 'inspector',
  VIEWER: 'viewer',
} as const

export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export const UserStatus = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
} as const

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus]

export const SampleOrderStatus = {
  DRAFT: 'draft',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const

export type SampleOrderStatus = (typeof SampleOrderStatus)[keyof typeof SampleOrderStatus]

export const SampleStepStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const

export type SampleStepStatus = (typeof SampleStepStatus)[keyof typeof SampleStepStatus]

export const StepLogAction = {
  CREATED: 'created',
  UPDATED: 'updated',
  STARTED: 'started',
  COMPLETED: 'completed',
} as const

export type StepLogAction = (typeof StepLogAction)[keyof typeof StepLogAction]

export interface AuthUser {
  id: number
  username: string
  name: string
  role: UserRole
}

export interface SampleAttachmentDto {
  id: number
  sampleStepId?: number | null
  fileName: string
  filePath: string
  fileType: string
  uploadedBy: number
  uploaderName?: string
  createdAt: string
}

export interface SampleStepDto {
  id: number
  stepName: string
  stepOrder: number
  operatorUserId?: number | null
  operatorName?: string
  latestInspectorUserId?: number | null
  latestInspectorName?: string
  status: SampleStepStatus
  startedAt?: string | null
  completedAt?: string | null
  latestInspectionAt?: string | null
  remark?: string | null
  attachments?: SampleAttachmentDto[]
}

export interface SampleOrderDto {
  id: number
  sampleNo: string
  projectName: string
  operatorUserId?: number | null
  operatorName?: string
  inspectorUserId?: number | null
  inspectorName?: string
  customerName?: string | null
  material?: string | null
  pressTonnage?: string | null
  startDate?: string | null
  reportStoragePath: string
  remark?: string | null
  status: SampleOrderStatus
  attachments?: SampleAttachmentDto[]
  steps?: SampleStepDto[]
}

export interface SampleProgressSummaryDto {
  id: number
  sampleNo: string
  projectName: string
  status: SampleOrderStatus
  progress: number
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
