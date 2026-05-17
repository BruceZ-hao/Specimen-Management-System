import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { SampleOrderStatus, SampleStepStatus, StepLogAction, UserRole } from '@sample/shared'
import { access } from 'fs/promises'
import { mkdir, rm, unlink, writeFile } from 'fs/promises'
import { extname, isAbsolute, join, resolve } from 'path'
import { PrismaService } from '../common/prisma.service'
import { CreateSampleDto } from './dto/create-sample.dto'
import { QuerySamplesDto } from './dto/query-samples.dto'
import { ResetSampleOwnershipDto } from './dto/reset-sample-ownership.dto'
import { UpdateSampleDto } from './dto/update-sample.dto'

@Injectable()
export class SampleService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QuerySamplesDto) {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { sampleNo: { contains: query.keyword } },
              { projectName: { contains: query.keyword } },
              { customerName: { contains: query.keyword } },
            ],
          }
        : {}),
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.sampleOrder.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          operatorUser: {
            select: { id: true, name: true, role: true },
          },
          inspectorUser: {
            select: { id: true, name: true, role: true },
          },
        },
      }),
      this.prisma.sampleOrder.count({ where }),
    ])

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
    }
  }

  async detail(id: number) {
    const sample = await this.prisma.sampleOrder.findUnique({
      where: { id },
      include: {
        operatorUser: {
          select: { id: true, name: true, role: true },
        },
        inspectorUser: {
          select: { id: true, name: true, role: true },
        },
        attachments: {
          orderBy: { id: 'desc' },
          include: {
            uploader: {
              select: { id: true, name: true, role: true },
            },
          },
        },
        steps: {
          orderBy: { stepOrder: 'asc' },
          include: {
            operatorUser: { select: { id: true, name: true, role: true } },
            latestInspectorUser: { select: { id: true, name: true, role: true } },
            attachments: {
              orderBy: { id: 'desc' },
              include: {
                uploader: {
                  select: { id: true, name: true, role: true },
                },
              },
            },
          },
        },
      },
    })

    if (!sample) {
      throw new NotFoundException('Sample not found.')
    }

    return sample
  }

  async progressSummary() {
    const samples = await this.prisma.sampleOrder.findMany({
      orderBy: { id: 'desc' },
      select: {
        id: true,
        sampleNo: true,
        projectName: true,
        status: true,
        steps: {
          select: {
            status: true,
          },
        },
      },
    })

    return samples.map((sample) => {
      const totalSteps = sample.steps.length
      const completedSteps = sample.steps.filter(
        (step) => step.status === SampleStepStatus.COMPLETED,
      ).length

      return {
        id: sample.id,
        sampleNo: sample.sampleNo,
        projectName: sample.projectName,
        status: sample.status,
        progress: totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0,
      }
    })
  }

  async create(dto: CreateSampleDto, userId: number) {
    const exists = await this.prisma.sampleOrder.findUnique({ where: { sampleNo: dto.sampleNo } })
    if (exists) {
      throw new ConflictException('Sample number already exists.')
    }

    this.validateStepSequence(dto.steps)

    return this.prisma.sampleOrder.create({
      data: {
        sampleNo: dto.sampleNo,
        projectName: dto.projectName,
        reportStoragePath: this.normalizeStoragePath(dto.reportStoragePath),
        customerName: dto.customerName,
        material: dto.material,
        pressTonnage: dto.pressTonnage,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        remark: dto.remark,
        createdBy: userId,
        status: SampleOrderStatus.DRAFT,
        steps: {
          create: dto.steps.map((step) => ({
            stepName: step.stepName,
            stepOrder: step.stepOrder,
            remark: step.remark,
            status: SampleStepStatus.PENDING,
            operationLogs: {
              create: {
                action: StepLogAction.CREATED,
                operatorUserId: userId,
                note: `Created step ${step.stepName}`,
              },
            },
          })),
        },
      },
      include: {
        steps: { orderBy: { stepOrder: 'asc' } },
      },
    })
  }

  async update(id: number, dto: UpdateSampleDto, user: { id: number; role: UserRole }) {
    const current = await this.prisma.sampleOrder.findUnique({
      where: { id },
      include: { steps: true, attachments: true },
    })
    if (!current) {
      throw new NotFoundException('Sample not found.')
    }

    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can edit samples.')
    }

    if (dto.steps?.length) {
      this.validateStepSequence(dto.steps)
    }

      await this.prisma.sampleOrder.update({
      where: { id },
      data: {
        sampleNo: dto.sampleNo,
        projectName: dto.projectName,
        reportStoragePath: this.resolveUpdatedStoragePath(dto.reportStoragePath),
        customerName: dto.customerName,
        material: dto.material,
        pressTonnage: dto.pressTonnage,
        startDate: dto.startDate ? new Date(dto.startDate) : dto.startDate === null ? null : undefined,
        remark: dto.remark,
        status: dto.status,
      },
    })

    if (dto.steps) {
      const existingById = new Map(current.steps.map((step) => [step.id, step]))

      for (const step of dto.steps) {
        if (typeof step.id === 'number' && !existingById.has(step.id)) {
          throw new BadRequestException('Invalid step id.')
        }
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.sampleStep.updateMany({
          where: { sampleOrderId: id },
          data: {
            stepOrder: {
              increment: 1000,
            },
          },
        })

        const keepIds: number[] = []

        for (const step of dto.steps || []) {
          const existing = typeof step.id === 'number' ? existingById.get(step.id) : undefined

          if (existing) {
            await tx.sampleStep.update({
              where: { id: existing.id },
              data: {
                stepName: step.stepName,
                stepOrder: step.stepOrder,
                remark: step.remark,
              },
            })
            keepIds.push(existing.id)
            continue
          }

          const created = await tx.sampleStep.create({
            data: {
              sampleOrderId: id,
              stepName: step.stepName,
              stepOrder: step.stepOrder,
              remark: step.remark,
              status: SampleStepStatus.PENDING,
            },
          })

          await tx.stepOperationLog.create({
            data: {
              sampleStepId: created.id,
              action: StepLogAction.CREATED,
              operatorUserId: user.id,
              note: `Created step ${step.stepName}`,
            },
          })

          keepIds.push(created.id)
        }

        await tx.sampleStep.deleteMany({
          where: {
            sampleOrderId: id,
            ...(keepIds.length ? { id: { notIn: keepIds } } : {}),
          },
        })
      })
    }

    if (dto.removeAttachmentIds?.length) {
      const removable = current.attachments.filter((attachment) =>
        dto.removeAttachmentIds?.includes(attachment.id),
      )

      if (removable.length !== dto.removeAttachmentIds.length) {
        throw new BadRequestException('Invalid attachment id.')
      }

      await this.prisma.sampleAttachment.deleteMany({
        where: {
          sampleOrderId: id,
          id: { in: dto.removeAttachmentIds },
        },
      })

      await Promise.all(
        removable.map((attachment) =>
          unlink(this.resolveAttachmentPath(attachment.filePath)).catch(() => undefined),
        ),
      )
    }

    if (dto.status === undefined) {
      await this.refreshSampleStatus(id)
    }
    return this.detail(id)
  }

  async createSteps(sampleId: number, steps: CreateSampleDto['steps'], operatorId: number) {
    const sample = await this.prisma.sampleOrder.findUnique({ where: { id: sampleId } })
    if (!sample) {
      throw new NotFoundException('Sample not found.')
    }

    this.validateStepSequence(steps)

    await this.prisma.sampleStep.deleteMany({ where: { sampleOrderId: sampleId } })
    await this.prisma.sampleStep.createMany({
      data: steps.map((step) => ({
        sampleOrderId: sampleId,
        stepName: step.stepName,
        stepOrder: step.stepOrder,
        remark: step.remark,
        status: SampleStepStatus.PENDING,
      })),
    })

    const createdSteps = await this.prisma.sampleStep.findMany({
      where: { sampleOrderId: sampleId },
    })

    await this.prisma.stepOperationLog.createMany({
      data: createdSteps.map((step) => ({
        sampleStepId: step.id,
        action: StepLogAction.CREATED,
        operatorUserId: operatorId,
        note: `Rebuilt step ${step.stepName}`,
      })),
    })

    await this.refreshSampleStatus(sampleId)
    return this.detail(sampleId)
  }

  async resetOwnership(sampleId: number, dto: ResetSampleOwnershipDto, operatorId: number) {
    const sample = await this.prisma.sampleOrder.findUnique({
      where: { id: sampleId },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
        },
      },
    })
    if (!sample) {
      throw new NotFoundException('Sample not found.')
    }

    const resetOperator = !!dto.resetOperator
    const resetInspector = !!dto.resetInspector
    if (!resetOperator && !resetInspector) {
      throw new BadRequestException('Please choose at least one ownership reset action.')
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.sampleOrder.update({
        where: { id: sampleId },
        data: {
          ...(resetOperator ? { operatorUserId: null } : {}),
          ...(resetInspector ? { inspectorUserId: null } : {}),
        },
      })

      if (resetOperator) {
        await tx.sampleStep.updateMany({
          where: {
            sampleOrderId: sampleId,
            status: SampleStepStatus.PENDING,
          },
          data: {
            operatorUserId: null,
          },
        })

        await tx.sampleStep.updateMany({
          where: {
            sampleOrderId: sampleId,
            status: SampleStepStatus.IN_PROGRESS,
          },
          data: {
            operatorUserId: null,
            status: SampleStepStatus.PENDING,
            startedAt: null,
            completedAt: null,
          },
        })
      }

      if (resetInspector) {
        await tx.sampleStep.updateMany({
          where: {
            sampleOrderId: sampleId,
          },
          data: {
            latestInspectorUserId: null,
            latestInspectionAt: null,
          },
        })
      }

      const affectedSteps = sample.steps.filter((step) => {
        if (resetOperator && step.status !== SampleStepStatus.COMPLETED) {
          return true
        }

        if (resetInspector && step.latestInspectorUserId) {
          return true
        }

        return false
      })

      if (affectedSteps.length) {
        await tx.stepOperationLog.createMany({
          data: affectedSteps.map((step) => ({
            sampleStepId: step.id,
            action: StepLogAction.UPDATED,
            operatorUserId: operatorId,
            note: this.buildOwnershipResetNote(step, { resetOperator, resetInspector }),
          })),
        })
      }
    })

    await this.refreshSampleStatus(sampleId)
    return this.detail(sampleId)
  }

  async uploadAttachment(
    sampleId: number,
    file: Express.Multer.File,
    operatorId: number,
    uploadDir: string,
    options: UploadAttachmentOptions = {},
  ) {
    const sample = await this.prisma.sampleOrder.findUnique({ where: { id: sampleId } })
    if (!sample) {
      throw new NotFoundException('Sample not found.')
    }

    if (!file) {
      throw new BadRequestException('No file uploaded.')
    }

    const isReportAttachment = typeof options.sampleStepId === 'number'
    const baseDir = this.resolveStorageBaseDir(
      isReportAttachment ? options.customStoragePath || sample.reportStoragePath : uploadDir,
    )
    const targetDir = isReportAttachment ? baseDir : join(baseDir, 'samples', String(sampleId))
    await mkdir(targetDir, { recursive: true })

    const fileName = isReportAttachment
      ? this.buildReportFileName(options.stepName || 'report', file.originalname)
      : `${Date.now()}${extname(file.originalname)}`
    const filePath = resolve(targetDir, fileName)
    await writeFile(filePath, file.buffer)

    return this.prisma.sampleAttachment.create({
      data: {
        sampleOrderId: sampleId,
        sampleStepId: options.sampleStepId,
        fileName,
        filePath: filePath.replaceAll('\\', '/'),
        fileType: file.mimetype,
        uploadedBy: operatorId,
      },
      include: {
        uploader: {
          select: { id: true, name: true, role: true },
        },
      },
    })
  }

  async remove(id: number, uploadDir: string) {
    const sample = await this.prisma.sampleOrder.findUnique({
      where: { id },
      include: { attachments: true },
    })
    if (!sample) {
      throw new NotFoundException('Sample not found.')
    }

    await Promise.all(
      sample.attachments.map((attachment) =>
        unlink(this.resolveAttachmentPath(attachment.filePath)).catch(() => undefined),
      ),
    )

    await this.prisma.sampleOrder.delete({ where: { id } })
    const sampleDir = join(uploadDir, 'samples', String(id))
    await rm(sampleDir, { recursive: true, force: true }).catch(() => undefined)
    return { success: true }
  }

  async getAttachmentFile(attachmentId: number) {
    const attachment = await this.prisma.sampleAttachment.findUnique({
      where: { id: attachmentId },
    })

    if (!attachment) {
      throw new NotFoundException('Attachment not found.')
    }

    const absolutePath = this.resolveAttachmentPath(attachment.filePath)
    await access(absolutePath).catch(() => {
      throw new NotFoundException('Attachment file not found.')
    })

    return {
      absolutePath,
      fileType: attachment.fileType,
    }
  }

  async removeAttachmentFile(filePath: string) {
    await unlink(this.resolveAttachmentPath(filePath))
  }

  async refreshSampleStatus(sampleId: number) {
    const steps = await this.prisma.sampleStep.findMany({
      where: { sampleOrderId: sampleId },
      orderBy: { stepOrder: 'asc' },
    })

    let status: SampleOrderStatus = SampleOrderStatus.DRAFT
    if (steps.length && steps.every((step) => step.status === SampleStepStatus.COMPLETED)) {
      status = SampleOrderStatus.COMPLETED
    } else if (steps.some((step) => step.status !== SampleStepStatus.PENDING)) {
      status = SampleOrderStatus.IN_PROGRESS
    }

    await this.prisma.sampleOrder.update({
      where: { id: sampleId },
      data: { status },
    })
  }

  private validateStepSequence(steps: Array<{ stepOrder: number }>) {
    const sorted = [...steps].sort((first, second) => first.stepOrder - second.stepOrder)
    sorted.forEach((step, index) => {
      if (step.stepOrder !== index + 1) {
        throw new BadRequestException('Step order must start from 1 and stay continuous.')
      }
    })
  }

  private normalizeStoragePath(value?: string | null) {
    const normalized = String(value || '').trim()
    if (!normalized) {
      throw new BadRequestException('Report storage path is required.')
    }

    return normalized
  }

  private resolveUpdatedStoragePath(value?: string | null) {
    if (value === undefined || value === null) {
      return undefined
    }

    const normalized = String(value).trim()
    if (!normalized) {
      return undefined
    }

    return normalized
  }

  private resolveStorageBaseDir(storagePath: string) {
    if (isAbsolute(storagePath)) {
      return storagePath
    }

    return resolve(process.cwd(), storagePath)
  }

  private buildStepDirectoryName(stepOrder?: number, stepName?: string) {
    const order = typeof stepOrder === 'number' && stepOrder > 0 ? `step-${stepOrder}` : 'step'
    const safeName = this.sanitizeFileName(stepName || 'report')
    return `${order}-${safeName}`
  }

  private buildReportFileName(stepName: string, originalName: string) {
    const safeStepName = this.sanitizeWindowsFileName(stepName || 'report') || 'report'
    return `${safeStepName}${extname(originalName)}`
  }

  private buildOwnershipResetNote(
    step: { status: string; latestInspectorUserId: number | null },
    options: { resetOperator: boolean; resetInspector: boolean },
  ) {
    const changes: string[] = []

    if (options.resetOperator && step.status !== SampleStepStatus.COMPLETED) {
      if (step.status === SampleStepStatus.IN_PROGRESS) {
        changes.push('reset operator claim and reverted step to pending')
      } else {
        changes.push('reset operator claim')
      }
    }

    if (options.resetInspector && step.latestInspectorUserId) {
      changes.push('reset inspector claim')
    }

    return changes.length ? `Admin ${changes.join('; ')}` : 'Admin reset sample ownership'
  }

  private sanitizeFileName(value: string) {
    return String(value || '')
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'item'
  }

  private sanitizeWindowsFileName(value: string) {
    return String(value || '')
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
      .replace(/[. ]+$/g, '')
  }

  private resolveAttachmentPath(filePath: string) {
    if (isAbsolute(filePath)) {
      return filePath
    }

    return resolve(process.cwd(), filePath.replace(/^\/+/, ''))
  }
}

type UploadAttachmentOptions = {
  sampleStepId?: number
  customStoragePath?: string
  stepName?: string
  stepOrder?: number
}
