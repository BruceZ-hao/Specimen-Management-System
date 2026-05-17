import { PartialType } from '@nestjs/mapped-types'
import { Type } from 'class-transformer'
import { IsArray, IsEnum, IsInt, IsOptional } from 'class-validator'
import { SampleOrderStatus } from '@sample/shared'
import { CreateSampleDto } from './create-sample.dto'

export class UpdateSampleDto extends PartialType(CreateSampleDto) {
  @IsOptional()
  @IsEnum(SampleOrderStatus)
  status?: SampleOrderStatus

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  removeAttachmentIds?: number[]
}
