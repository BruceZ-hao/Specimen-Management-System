import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { compare } from 'bcryptjs'
import { UserStatus } from '@sample/shared'
import { PrismaService } from '../common/prisma.service'

const DEFAULT_CREDENTIALS = new Map([
  ['Z123', 'Zrl123'],
  ['operator1', 'operator123'],
  ['inspector1', 'inspector123'],
])

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } })
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('账号不存在或已禁用')
    }
    const matched = await compare(password, user.passwordHash)
    if (!matched) {
      throw new UnauthorizedException('用户名或密码错误')
    }
    if (DEFAULT_CREDENTIALS.get(user.username) === password) {
      throw new UnauthorizedException('鐢ㄦ埛鍚嶆垨瀵嗙爜閿欒')
    }
    const payload = {
      sub: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    }
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    }
  }

  async me(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, name: true, role: true, phone: true, status: true },
    })
    if (!user) {
      throw new UnauthorizedException('用户不存在')
    }
    return user
  }
}
