import { IsString, IsOptional, IsInt, MinLength, MaxLength } from 'class-validator';

export class RegisterProfileDto {
  @IsOptional()
  @IsInt({ message: 'memberId must be an integer' })
  memberId?: number;

  @IsOptional()
  @IsString({ message: 'identifier must be a string' })
  identifier?: string;

  @IsString({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  password: string;

  @IsOptional()
  @IsString({ message: 'developerAccessKey must be a string' })
  developerAccessKey?: string;
}
