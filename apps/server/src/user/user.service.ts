import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { hash } from 'bcryptjs'
import { UserStatus } from '@sample/shared'
import { PrismaService } from '../common/prisma.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.user.findMany({
      orderBy: { id: 'desc' },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        phone: true,
        status: true,
      },
    })
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } })
    if (exists) {
      throw new ConflictException('用户名已存在')
    }

    return this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash: await hash(dto.password, 10),
        name: dto.name,
        role: dto.role,
        phone: dto.phone,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        phone: true,
        status: true,
      },
    })
  }

  async update(id: number, dto: UpdateUserDto) {
    const current = await this.prisma.user.findUnique({ where: { id } })
    if (!current) {
      throw new NotFoundException('用户不存在')
    }

    const nextUsername = String(dto.username ?? current.username).trim()
    if (!nextUsername) {
      throw new ConflictException('用户名不能为空')
    }

    if (nextUsername !== current.username) {
      const exists = await this.prisma.user.findUnique({ where: { username: nextUsername } })
      if (exists) {
        throw new ConflictException('用户名已存在')
      }
    }

    const data: Record<string, unknown> = {
      username: nextUsername,
      name: dto.name ?? current.name,
      role: dto.role ?? current.role,
      phone: dto.phone !== undefined ? String(dto.phone || '').trim() || null : current.phone,
      status: dto.status ?? current.status,
    }

    if (dto.password && dto.password.trim()) {
      data.passwordHash = await hash(dto.password, 10)
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        phone: true,
        status: true,
      },
    })
  }

  async remove(id: number) {
    const current = await this.prisma.user.findUnique({ where: { id } })
    if (!current) {
      throw new NotFoundException('用户不存在')
    }

    const relatedOrderCount = await this.prisma.sampleOrder.count({
      where: {
        OR: [{ createdBy: id }, { operatorUserId: id }, { inspectorUserId: id }],
      },
    })
    const relatedStepCount = await this.prisma.sampleStep.count({
      where: {
        OR: [{ operatorUserId: id }, { latestInspectorUserId: id }],
      },
    })
    const relatedAttachmentCount = await this.prisma.sampleAttachment.count({
      where: { uploadedBy: id },
    })

    if (relatedOrderCount > 0 || relatedStepCount > 0 || relatedAttachmentCount > 0) {
      throw new ConflictException('该账号已关联项目、工序或检测报告，暂时不能删除')
    }

    await this.prisma.user.delete({ where: { id } })
    return { success: true }
  }
}
