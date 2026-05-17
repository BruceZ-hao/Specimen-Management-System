import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { PrismaService } from './common/prisma.service'
import { SampleModule } from './sample/sample.module'
import { StepModule } from './step/step.module'
import { SystemModule } from './system/system.module'
import { UserModule } from './user/user.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    UserModule,
    SampleModule,
    StepModule,
    SystemModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}
