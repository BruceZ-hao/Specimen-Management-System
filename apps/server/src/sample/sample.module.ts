import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaService } from '../common/prisma.service'
import { SampleController } from './sample.controller'
import { SampleService } from './sample.service'

@Module({
  imports: [ConfigModule],
  controllers: [SampleController],
  providers: [SampleService, PrismaService],
  exports: [SampleService],
})
export class SampleModule {}
