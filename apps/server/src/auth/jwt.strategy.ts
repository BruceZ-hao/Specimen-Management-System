import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { UserStatus } from '@sample/shared'
import { PrismaService } from '../common/prisma.service'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'sample-secret'),
    })
  }

  async validate(payload: { sub: number; username: string; name: string; role: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, name: true, role: true, status: true },
    })

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User session is no longer valid.')
    }

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    }
  }
}
