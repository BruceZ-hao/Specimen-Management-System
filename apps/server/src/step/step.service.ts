import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { SampleStepStatus, StepLogAction, UserRole } from '@sample/shared'
import { PrismaService } from '../common/prisma.service'
import { SampleService } from '../sample/sample.service'
import { UpdateStepDto } from './dto/update-step.dto'

@Injectable()
export class StepService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sampleService: SampleService,
  ) {}

  async update(id: number, dto: UpdateStepDto, operatorId: number) {
    const step = await this.ensureStep(id)
    if (dto.stepOrder && dto.stepOrder < 1) {
      throw new BadRequestException('Step order must be greater than 0.')
    }

    const status = this.toSampleStepStatus(dto.status) || this.toSampleStepStatus(step.status) || SampleStepStatus.PENDING
    const note = this.buildUpdateNote(step, dto, status)
    const updated = await this.prisma.sampleStep.update({
      where: { id },
      data: {
        stepName: dto.stepName,
        stepOrder: dto.stepOrder,
        remark: dto.remark,
        status,
        ...this.resolveStepTimestamps(status, step),
      },
    })

    await this.prisma.stepOperationLog.create({
      data: {
        sampleStepId: id,
        action: StepLogAction.UPDATED,
        operatorUserId: operatorId,
        note,
      },
    })

    await this.sampleService.refreshSampleStatus(step.sampleOrderId)
    return updated
  }

  async detail(id: number, user: { id: number; role: UserRole }) {
    const step = await this.prisma.sampleStep.findUnique({
      where: { id },
      include: this.buildStepInclude(),
    })

    if (!step) {
      throw new NotFoundException('Step not found.')
    }

    if (user.role === UserRole.ADMIN) {
      return step
    }

    if (user.role === UserRole.VIEWER) {
      return step
    }

    if (user.role === UserRole.OPERATOR) {
      const projectOperatorId = step.sampleOrder?.operatorUserId ?? null
      if (projectOperatorId && projectOperatorId !== user.id) {
        throw new ForbiddenException('You do not have access to this step.')
      }
      if (!projectOperatorId && step.status !== SampleStepStatus.PENDING) {
        throw new ForbiddenException('You do not have access to this step.')
      }
      return step
    }

    if (step.status !== SampleStepStatus.COMPLETED) {
      throw new ForbiddenException('Inspectors can only view completed steps.')
    }

    const projectInspectorId = step.sampleOrder?.inspectorUserId ?? null
    if (projectInspectorId && projectInspectorId !== user.id) {
      throw new ForbiddenException('You do not have access to this step.')
    }

    return step
  }

  async start(id: number, user: { id: number; role: UserRole }) {
    if (user.role !== UserRole.OPERATOR) {
      throw new ForbiddenException('Only operators can start steps.')
    }

    const step = await this.ensureStep(id)
    if (step.status !== SampleStepStatus.PENDING) {
      throw new BadRequestException('This step cannot be started.')
    }

    const projectOperatorId = step.sampleOrder.operatorUserId
    if (projectOperatorId && projectOperatorId !== user.id) {
      throw new ForbiddenException('This project is already claimed by another operator.')
    }

    const previous = await this.prisma.sampleStep.findFirst({
      where: {
        sampleOrderId: step.sampleOrderId,
        stepOrder: step.stepOrder - 1,
      },
    })

    if (previous && previous.status !== SampleStepStatus.COMPLETED) {
      throw new BadRequestException('The previous step is not completed yet.')
    }

    if (!projectOperatorId) {
      await this.prisma.sampleOrder.update({
        where: { id: step.sampleOrderId },
        data: { operatorUserId: user.id },
      })
    }

    const updated = await this.prisma.sampleStep.update({
      where: { id },
      data: {
        operatorUserId: user.id,
        status: SampleStepStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    })

    await this.prisma.stepOperationLog.create({
      data: {
        sampleStepId: id,
        action: StepLogAction.STARTED,
        operatorUserId: user.id,
        note: 'Started step',
      },
    })

    await this.sampleService.refreshSampleStatus(step.sampleOrderId)
    return updated
  }

  async complete(id: number, user: { id: number; role: UserRole }) {
    if (user.role !== UserRole.OPERATOR) {
      throw new ForbiddenException('Only operators can complete steps.')
    }

    const step = await this.ensureStep(id)
    this.ensureProjectOperator(step.sampleOrder.operatorUserId, user)
    this.ensureOperator(step.operatorUserId, user)
    if (step.status !== SampleStepStatus.IN_PROGRESS) {
      throw new BadRequestException('This step cannot be completed.')
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const completedStep = await tx.sampleStep.update({
        where: { id },
        data: {
          status: SampleStepStatus.COMPLETED,
          completedAt: new Date(),
        },
      })

      await tx.stepOperationLog.create({
        data: {
          sampleStepId: id,
          action: StepLogAction.COMPLETED,
          operatorUserId: user.id,
          note: 'Completed step',
        },
      })

      const nextStep = await tx.sampleStep.findFirst({
        where: {
          sampleOrderId: step.sampleOrderId,
          stepOrder: step.stepOrder + 1,
          status: SampleStepStatus.PENDING,
        },
      })

      if (nextStep) {
        await tx.sampleStep.update({
          where: { id: nextStep.id },
          data: {
            operatorUserId: user.id,
            status: SampleStepStatus.IN_PROGRESS,
            startedAt: new Date(),
          },
        })

        await tx.stepOperationLog.create({
          data: {
            sampleStepId: nextStep.id,
            action: StepLogAction.STARTED,
            operatorUserId: user.id,
            note: 'Auto-started next step',
          },
        })
      }

      return completedStep
    })

    await this.sampleService.refreshSampleStatus(step.sampleOrderId)
    return updated
  }

  async uploadReportPhoto(
    id: number,
    file: Express.Multer.File,
    user: { id: number; role: UserRole },
    uploadDir: string,
  ) {
    const step = await this.prisma.sampleStep.findUnique({
      where: { id },
      include: {
        sampleOrder: {
          select: {
            reportStoragePath: true,
            sampleNo: true,
            inspectorUserId: true,
          },
        },
      },
    })
    if (!step) {
      throw new NotFoundException('Step not found.')
    }

    if (user.role !== UserRole.INSPECTOR && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only inspectors and admins can upload report images.')
    }

    if (step.status !== SampleStepStatus.COMPLETED) {
      throw new BadRequestException('Report images can only be uploaded after the step is completed.')
    }

    const projectInspectorId = step.sampleOrder.inspectorUserId
    if (user.role !== UserRole.ADMIN && projectInspectorId && projectInspectorId !== user.id) {
      throw new ForbiddenException('This project is already claimed by another inspector.')
    }

    if (!file) {
      throw new BadRequestException('No file uploaded.')
    }

    if (!String(file.mimetype || '').toLowerCase().startsWith('image/')) {
      throw new BadRequestException('Only image files can be uploaded as report images.')
    }

    const attachment = await this.sampleService.uploadAttachment(step.sampleOrderId, file, user.id, uploadDir, {
      sampleStepId: step.id,
      customStoragePath: step.sampleOrder.reportStoragePath,
      stepName: step.stepName,
      stepOrder: step.stepOrder,
    })

    if (user.role === UserRole.INSPECTOR && !projectInspectorId) {
      await this.prisma.sampleOrder.update({
        where: { id: step.sampleOrderId },
        data: { inspectorUserId: user.id },
      })
    }

    await this.prisma.sampleStep.update({
      where: { id },
      data: {
        latestInspectorUserId: user.id,
        latestInspectionAt: new Date(),
      },
    })

    await this.prisma.stepOperationLog.create({
      data: {
        sampleStepId: id,
        action: StepLogAction.UPDATED,
        operatorUserId: user.id,
        note: `Uploaded inspection file ${attachment.fileName}`,
      },
    })

    return attachment
  }

  async removeReportAttachment(
    id: number,
    attachmentId: number,
    user: { id: number; role: UserRole },
  ) {
    const step = await this.prisma.sampleStep.findUnique({
      where: { id },
      include: {
        sampleOrder: {
          select: {
            inspectorUserId: true,
          },
        },
        attachments: true,
      },
    })

    if (!step) {
      throw new NotFoundException('Step not found.')
    }

    if (user.role !== UserRole.INSPECTOR && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only inspectors and admins can delete report images.')
    }

    if (user.role !== UserRole.ADMIN) {
      const projectInspectorId = step.sampleOrder.inspectorUserId
      if (projectInspectorId && projectInspectorId !== user.id) {
        throw new ForbiddenException('This project is already claimed by another inspector.')
      }
    }

    const attachment = step.attachments.find((item) => item.id === attachmentId)
    if (!attachment) {
      throw new NotFoundException('Report attachment not found.')
    }

    await this.prisma.sampleAttachment.delete({
      where: { id: attachmentId },
    })

    await this.prisma.stepOperationLog.create({
      data: {
        sampleStepId: id,
        action: StepLogAction.UPDATED,
        operatorUserId: user.id,
        note: `Deleted inspection file ${attachment.fileName}`,
      },
    })

    await this.sampleService
      .removeAttachmentFile(attachment.filePath)
      .catch(() => undefined)

    return { success: true }
  }

  async mySteps(user: { id: number; role: UserRole }, status?: SampleStepStatus) {
    const include = this.buildStepInclude()

    if (user.role === UserRole.ADMIN) {
      return this.prisma.sampleStep.findMany({
        where: status ? { status } : undefined,
        include,
        orderBy: [{ sampleOrderId: 'desc' }, { stepOrder: 'asc' }],
      })
    }

    if (user.role === UserRole.INSPECTOR) {
      return this.prisma.sampleStep.findMany({
        where: {
          status: status || SampleStepStatus.COMPLETED,
          OR: [{ sampleOrder: { is: { inspectorUserId: user.id } } }, { sampleOrder: { is: { inspectorUserId: null } } }],
        },
        include,
        orderBy: [{ completedAt: 'desc' }, { sampleOrderId: 'desc' }, { stepOrder: 'asc' }],
      })
    }

    if (user.role === UserRole.VIEWER) {
      return this.prisma.sampleStep.findMany({
        where: status ? { status } : undefined,
        include,
        orderBy: [{ sampleOrderId: 'desc' }, { stepOrder: 'asc' }],
      })
    }

    return this.prisma.sampleStep.findMany({
        where: {
          ...(status ? { status } : {}),
          OR: [
            { sampleOrder: { is: { operatorUserId: user.id } } },
            { sampleOrder: { is: { operatorUserId: null } }, status: SampleStepStatus.PENDING },
          ],
      },
      include,
      orderBy: [{ sampleOrderId: 'desc' }, { stepOrder: 'asc' }],
    })
  }

  private async ensureStep(id: number) {
    const step = await this.prisma.sampleStep.findUnique({
      where: { id },
      include: {
        sampleOrder: {
          select: {
            id: true,
            operatorUserId: true,
            inspectorUserId: true,
          },
        },
      },
    })
    if (!step) {
      throw new NotFoundException('Step not found.')
    }
    return step
  }

  private ensureOperator(operatorUserId: number | null, user: { id: number; role: UserRole }) {
    if (!operatorUserId || user.id !== operatorUserId) {
      throw new ForbiddenException('You can only complete steps claimed by you.')
    }
  }

  private ensureProjectOperator(operatorUserId: number | null, user: { id: number; role: UserRole }) {
    if (!operatorUserId || user.id !== operatorUserId) {
      throw new ForbiddenException('You can only operate steps in projects claimed by you.')
    }
  }

  private resolveStepTimestamps(
    status: SampleStepStatus,
    current: { startedAt: Date | null; completedAt: Date | null },
  ) {
    if (status === SampleStepStatus.PENDING) {
      return {
        startedAt: null,
        completedAt: null,
      }
    }

    if (status === SampleStepStatus.IN_PROGRESS) {
      return {
        startedAt: current.startedAt || new Date(),
        completedAt: null,
      }
    }

    return {
      startedAt: current.startedAt || new Date(),
      completedAt: current.completedAt || new Date(),
    }
  }

  private buildUpdateNote(
    current: {
      stepName: string
      stepOrder: number
      remark: string | null
      status: string
    },
    dto: UpdateStepDto,
    nextStatus: SampleStepStatus,
  ) {
    const changes: string[] = []

    if (typeof dto.stepName === 'string' && dto.stepName !== current.stepName) {
      changes.push(`name ${current.stepName} -> ${dto.stepName}`)
    }

    if (typeof dto.stepOrder === 'number' && dto.stepOrder !== current.stepOrder) {
      changes.push(`order ${current.stepOrder} -> ${dto.stepOrder}`)
    }

    if (dto.remark !== undefined && dto.remark !== (current.remark || '')) {
      changes.push(`remark ${current.remark || '-'} -> ${dto.remark || '-'}`)
    }

    if (nextStatus !== current.status) {
      changes.push(`status ${current.status} -> ${nextStatus}`)
    }

    return changes.length ? `Updated step: ${changes.join('; ')}` : 'Updated step settings'
  }

  private toSampleStepStatus(value?: string | null): SampleStepStatus | undefined {
    if (
      value === SampleStepStatus.PENDING ||
      value === SampleStepStatus.IN_PROGRESS ||
      value === SampleStepStatus.COMPLETED
    ) {
      return value
    }
    return undefined
  }

  private buildStepInclude() {
    return {
      operatorUser: { select: { id: true, name: true, role: true } },
      latestInspectorUser: { select: { id: true, name: true, role: true } },
      attachments: {
        orderBy: { id: 'desc' as const },
        include: {
          uploader: { select: { id: true, name: true, role: true } },
        },
      },
      sampleOrder: {
        include: {
          operatorUser: { select: { id: true, name: true, role: true } },
          inspectorUser: { select: { id: true, name: true, role: true } },
          steps: {
            orderBy: { stepOrder: 'asc' as const },
            include: {
              operatorUser: { select: { id: true, name: true, role: true } },
              latestInspectorUser: { select: { id: true, name: true, role: true } },
              attachments: {
                orderBy: { id: 'desc' as const },
                include: {
                  uploader: { select: { id: true, name: true, role: true } },
                },
              },
            },
          },
          attachments: {
            orderBy: { id: 'desc' as const },
            include: {
              uploader: { select: { id: true, name: true, role: true } },
            },
          },
        },
      },
    }
  }
}
