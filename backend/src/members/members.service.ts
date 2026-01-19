import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { instanceToPlain } from 'class-transformer';

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateMemberDto) {
    try {
      console.log('[MembersService.create] Starting with dto:', JSON.stringify(dto));
      
      // Check if member exists
      console.log('[MembersService.create] Checking if member with phone exists:', dto.phone);
      const existing = await this.prisma.member.findUnique({ where: { phone: dto.phone } });
      if (existing) {
        console.warn('[MembersService.create] Member already exists with phone:', dto.phone);
        throw new BadRequestException('Member with this phone already exists.');
      }
      
      // Prepare data and convert empty strings to null for optional fields
      const { nextOfKin, ...rest } = dto;
      
      // Convert empty strings to null for DateTime fields
      const dataToCreate = {
        ...rest,
        dob: rest.dob && rest.dob.trim() ? rest.dob : null,
        email: rest.email && rest.email.trim() ? rest.email : null,
        idNumber: rest.idNumber && rest.idNumber.trim() ? rest.idNumber : null,
        gender: rest.gender && rest.gender.trim() ? rest.gender : null,
        employmentStatus: rest.employmentStatus && rest.employmentStatus.trim() ? rest.employmentStatus : null,
        employerName: rest.employerName && rest.employerName.trim() ? rest.employerName : null,
        regNo: rest.regNo && rest.regNo.trim() ? rest.regNo : null,
        employerAddress: rest.employerAddress && rest.employerAddress.trim() ? rest.employerAddress : null,
        nextOfKin: nextOfKin && nextOfKin.length > 0 ? JSON.parse(JSON.stringify(nextOfKin)) : null,
      } as any; // Cast to any to allow extra fields that Prisma will ignore
      console.log('[MembersService.create] Prepared data for creation:', JSON.stringify(dataToCreate));
      
      // Create member
      const result = await this.prisma.member.create({ data: dataToCreate });
      console.log('[MembersService.create] Member created with id:', result.id);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorName = err instanceof Error ? err.name : 'Unknown';
      console.error('[MembersService.create] FAILED:', errorName, errorMsg);
      console.error('[MembersService.create] Error details:', err);
      throw err;
    }
  }

  async findAll() {
    return this.prisma.member.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: number) {
    const member = await this.prisma.member.findUnique({ where: { id } });
    if (!member) throw new NotFoundException('Member not found.');
    return member;
  }

  async update(id: number, dto: UpdateMemberDto) {
    await this.findOne(id); // Ensure exists
    const { nextOfKin, ...rest } = dto;
    return this.prisma.member.update({
      where: { id },
      data: {
        ...rest,
        nextOfKin: nextOfKin ? JSON.parse(JSON.stringify(nextOfKin)) : [],
      },
    });
  }

  async suspend(id: number) {
    await this.findOne(id);
    return this.prisma.member.update({ where: { id }, data: { active: false } });
  }

  async reactivate(id: number) {
    await this.findOne(id);
    return this.prisma.member.update({ where: { id }, data: { active: true } });
  }

  async ledger(id: number) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: { ledger: true },
    });
    if (!member) throw new NotFoundException('Member not found.');
    return member;
  }
}
