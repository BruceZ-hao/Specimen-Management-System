import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator'
import { SampleStepStatus } from '@sample/shared'

export class UpdateStepDto {
  @IsOptional()
  @IsString()
  stepName?: string

  @IsOptional()
  @IsInt()
  stepOrder?: number

  @IsOptional()
  @IsString()
  remark?: string

  @IsOptional()
  @IsEnum(SampleStepStatus)
  status?: SampleStepStatus
}
