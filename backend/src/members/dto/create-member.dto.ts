import { IsString, IsOptional, IsEmail, IsPhoneNumber, IsDateString, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

class NomineeDto {
  @IsString() name: string;
  @IsString() relationship: string;
  @IsString() id: string;
  @IsPhoneNumber('KE') phone: string;
  @Min(1) @Max(100) share: number;
}

export class CreateMemberDto {
  @IsString() name: string;

  @IsString()
  phone: string;

  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() idNumber?: string;
  @IsOptional() @IsDateString() dob?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() physicalAddress?: string;
  @IsOptional() @IsString() town?: string;
  @IsOptional() @IsString() employmentStatus?: string;
  @IsOptional() @IsString() employerName?: string;
  @IsOptional() @IsString() regNo?: string;
  @IsOptional() @IsString() employerAddress?: string;

  @IsString() role: string;

  @IsString() introducerName: string;
  @IsString() introducerMemberNo: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => NomineeDto)
  nextOfKin?: NomineeDto[];
}
