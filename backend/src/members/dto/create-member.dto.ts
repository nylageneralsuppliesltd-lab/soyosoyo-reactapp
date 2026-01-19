import {
  IsString,
  IsOptional,
  IsEmail,
  IsDateString,
  IsArray,
  ValidateNested,
  Min,
  Max,
  MinLength,
  MaxLength,
  Matches,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

class NomineeDto {
  @IsString({ message: 'Nominee name must be a string' })
  @MinLength(2, { message: 'Nominee name must be at least 2 characters' })
  @MaxLength(100, { message: 'Nominee name must not exceed 100 characters' })
  name: string;

  @IsString({ message: 'Relationship must be a string' })
  @IsIn(['Spouse', 'Child', 'Parent', 'Sibling', 'Other'], {
    message: 'Relationship must be one of: Spouse, Child, Parent, Sibling, Other',
  })
  relationship: string;

  @IsString({ message: 'ID must be a string' })
  @MinLength(5, { message: 'ID must be at least 5 characters' })
  @MaxLength(20, { message: 'ID must not exceed 20 characters' })
  id: string;

  @IsString({ message: 'Phone must be a string' })
  @Matches(/^(\+254|254|0)[7-9]\d{8}$/, {
    message: 'Phone number must be a valid Kenyan number (07..., +254..., or 254...)',
  })
  phone: string;

  @Min(0.01, { message: 'Share must be greater than 0' })
  @Max(100, { message: 'Share must not exceed 100' })
  share: number;
}

export class CreateMemberDto {
  @IsString({ message: 'Name must be a string' })
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  name: string;

  @IsString({ message: 'Phone must be a string' })
  @Matches(/^(\+254|254|0)[7-9]\d{8}$/, {
    message: 'Phone must be a valid Kenyan number (07..., +254..., or 254...)',
  })
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email?: string;

  @IsOptional()
  @IsString({ message: 'ID Number must be a string' })
  @Matches(/^\d{5,10}$/, { message: 'ID Number must be 5-10 digits' })
  idNumber?: string;

  @IsOptional()
  @IsDateString(
    { strict: true, strictSeparator: true },
    { message: 'Date of birth must be a valid ISO date (YYYY-MM-DD)' },
  )
  dob?: string;

  @IsOptional()
  @IsIn(['Male', 'Female', 'Other'], {
    message: 'Gender must be one of: Male, Female, Other',
  })
  gender?: string;

  @IsOptional()
  @IsString({ message: 'Physical address must be a string' })
  @MaxLength(255, { message: 'Physical address must not exceed 255 characters' })
  physicalAddress?: string;

  @IsOptional()
  @IsString({ message: 'Town must be a string' })
  @MaxLength(100, { message: 'Town must not exceed 100 characters' })
  town?: string;

  @IsOptional()
  @IsIn(['Employed', 'Self-Employed', 'Unemployed', 'Retired', 'Student'], {
    message: 'Employment status must be one of: Employed, Self-Employed, Unemployed, Retired, Student',
  })
  employmentStatus?: string;

  @IsOptional()
  @IsString({ message: 'Employer name must be a string' })
  @MaxLength(150, { message: 'Employer name must not exceed 150 characters' })
  employerName?: string;

  @IsOptional()
  @IsString({ message: 'Registration number must be a string' })
  @MaxLength(50, { message: 'Registration number must not exceed 50 characters' })
  regNo?: string;

  @IsOptional()
  @IsString({ message: 'Employer address must be a string' })
  @MaxLength(255, { message: 'Employer address must not exceed 255 characters' })
  employerAddress?: string;

  @IsString({ message: 'Role must be a string' })
  @IsIn(['Member', 'Chairman', 'Vice Chairman', 'Secretary', 'Treasurer', 'Admin'], {
    message: 'Role must be one of: Member, Chairman, Vice Chairman, Secretary, Treasurer, Admin',
  })
  role: string;

  @IsString({ message: 'Introducer name must be a string' })
  @MinLength(2, { message: 'Introducer name must be at least 2 characters' })
  @MaxLength(100, { message: 'Introducer name must not exceed 100 characters' })
  introducerName: string;

  @IsString({ message: 'Introducer member number must be a string' })
  @MinLength(1, { message: 'Introducer member number must be provided' })
  @MaxLength(20, { message: 'Introducer member number must not exceed 20 characters' })
  introducerMemberNo: string;

  @IsOptional()
  @IsArray({ message: 'Next of kin must be an array' })
  @ValidateNested({ each: true })
  @Type(() => NomineeDto)
  nextOfKin?: NomineeDto[];
}
