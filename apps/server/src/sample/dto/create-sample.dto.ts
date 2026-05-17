import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

export class CreateSampleStepItemDto {
  @IsOptional()
  id?: number

  @IsString()
  stepName!: string

  @IsInt()
  @Type(() => Number)
  stepOrder!: number

  @IsOptional()
  @IsString()
  remark?: string
}

export class CreateSampleDto {
  @IsString()
  sampleNo!: string

  @IsString()
  projectName!: string

  @IsString()
  reportStoragePath!: string

  @IsOptional()
  @IsString()
  customerName?: string

  @IsOptional()
  @IsString()
  material?: string

  @IsOptional()
  @IsString()
  pressTonnage?: string

  @IsOptional()
  @IsDateString()
  startDate?: string

  @IsOptional()
  @IsString()
  remark?: string

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSampleStepItemDto)
  steps!: CreateSampleStepItemDto[]
}
