import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator'
import { UserRole, UserStatus } from '@sample/shared'

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  username?: string

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string

  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus
}
