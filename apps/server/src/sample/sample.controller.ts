import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { UserRole } from '@sample/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { Roles } from '../common/roles.decorator'
import { RolesGuard } from '../common/roles.guard'
import { CreateSampleDto } from './dto/create-sample.dto'
import { QuerySamplesDto } from './dto/query-samples.dto'
import { ResetSampleOwnershipDto } from './dto/reset-sample-ownership.dto'
import { UpdateSampleDto } from './dto/update-sample.dto'
import { SampleService } from './sample.service'

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('samples')
export class SampleController {
  constructor(
    private readonly sampleService: SampleService,
    private readonly configService: ConfigService,
  ) {}

  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.INSPECTOR)
  @Get()
  list(@Query() query: QuerySamplesDto) {
    return this.sampleService.list(query)
  }

  @Roles(UserRole.VIEWER)
  @Get('progress-summary')
  progressSummary() {
    return this.sampleService.progressSummary()
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.INSPECTOR, UserRole.VIEWER)
  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.sampleService.detail(id)
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() body: CreateSampleDto, @CurrentUser() user: { id: number }) {
    return this.sampleService.create(body, user.id)
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateSampleDto,
    @CurrentUser() user: { id: number; role: UserRole },
  ) {
    return this.sampleService.update(id, body, user)
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/steps')
  createSteps(
    @Param('id', ParseIntPipe) id: number,
    @Body('steps') steps: CreateSampleDto['steps'],
    @CurrentUser() user: { id: number },
  ) {
    return this.sampleService.createSteps(id, steps, user.id)
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/reset-ownership')
  resetOwnership(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ResetSampleOwnershipDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.sampleService.resetOwnership(id, body, user.id)
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { id: number },
  ) {
    return this.sampleService.uploadAttachment(
      id,
      file,
      user.id,
      this.configService.get('UPLOAD_DIR', 'uploads'),
    )
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.sampleService.remove(id, this.configService.get('UPLOAD_DIR', 'uploads'))
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.INSPECTOR, UserRole.VIEWER)
  @Get('attachments/:attachmentId/file')
  async getAttachmentFile(
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @Res() response: Response,
  ) {
    const file = await this.sampleService.getAttachmentFile(attachmentId)
    response.type(file.fileType || 'application/octet-stream')
    response.sendFile(file.absolutePath)
  }
}
