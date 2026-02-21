import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSaccoDto {
  @IsString({ message: 'SACCO name is required' })
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string;
}
