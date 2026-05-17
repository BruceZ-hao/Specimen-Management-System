import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaService } from '../common/prisma.service'
import { SampleModule } from '../sample/sample.module'
import { StepController } from './step.controller'
import { StepService } from './step.service'

@Module({
  imports: [ConfigModule, SampleModule],
  controllers: [StepController],
  providers: [StepService, PrismaService],
})
export class StepModule {}
