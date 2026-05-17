import { IsBoolean, IsOptional } from 'class-validator'

export class ResetSampleOwnershipDto {
  @IsOptional()
  @IsBoolean()
  resetOperator?: boolean

  @IsOptional()
  @IsBoolean()
  resetInspector?: boolean
}
