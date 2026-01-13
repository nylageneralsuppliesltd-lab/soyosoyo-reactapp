import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { instanceToPlain } from 'class-transformer';

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateMemberDto) {
    const existing = await this.prisma.member.findUnique({ where: { phone: dto.phone } });
    if (existing) throw new BadRequestException('Member with this phone already exists.');
    // Manually spread fields to match Prisma type
    const { nextOfKin, ...rest } = dto;
    return this.prisma.member.create({
      data: {
        ...rest,
        nextOfKin: nextOfKin ? JSON.parse(JSON.stringify(nextOfKin)) : [],
      },
    });
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
