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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FileInterceptor } from '@nestjs/platform-express'
import { SampleStepStatus, UserRole } from '@sample/shared'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { Roles } from '../common/roles.decorator'
import { RolesGuard } from '../common/roles.guard'
import { UpdateStepDto } from './dto/update-step.dto'
import { StepService } from './step.service'

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class StepController {
  constructor(
    private readonly stepService: StepService,
    private readonly configService: ConfigService,
  ) {}

  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.INSPECTOR, UserRole.VIEWER)
  @Get('steps/:id')
  detail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number; role: UserRole },
  ) {
    return this.stepService.detail(id, user)
  }

  @Roles(UserRole.ADMIN)
  @Patch('steps/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateStepDto,
    @CurrentUser() user: { id: number },
  ) {
    return this.stepService.update(id, body, user.id)
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.INSPECTOR)
  @Post('steps/:id/start')
  start(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number; role: UserRole },
  ) {
    return this.stepService.start(id, user)
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.INSPECTOR)
  @Post('steps/:id/complete')
  complete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: { id: number; role: UserRole },
  ) {
    return this.stepService.complete(id, user)
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.INSPECTOR)
  @Post('steps/:id/report-photo')
  @UseInterceptors(FileInterceptor('file'))
  uploadReportPhoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: { id: number; role: UserRole },
  ) {
    return this.stepService.uploadReportPhoto(
      id,
      file,
      user,
      this.configService.get('UPLOAD_DIR', 'uploads'),
    )
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.INSPECTOR)
  @Delete('steps/:id/report-attachments/:attachmentId')
  removeReportAttachment(
    @Param('id', ParseIntPipe) id: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @CurrentUser() user: { id: number; role: UserRole },
  ) {
    return this.stepService.removeReportAttachment(
      id,
      attachmentId,
      user,
    )
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR, UserRole.INSPECTOR, UserRole.VIEWER)
  @Get('my/steps')
  mySteps(
    @CurrentUser() user: { id: number; role: UserRole },
    @Query('status') status?: SampleStepStatus,
  ) {
    return this.stepService.mySteps(user, status)
  }
}
