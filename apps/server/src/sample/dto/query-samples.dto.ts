import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator'
import { Transform, Type } from 'class-transformer'
import { SampleOrderStatus } from '@sample/shared'

export class QuerySamplesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize = 10

  @IsOptional()
  @Type(() => String)
  @IsString()
  keyword?: string

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsEnum(SampleOrderStatus)
  status?: SampleOrderStatus
}
