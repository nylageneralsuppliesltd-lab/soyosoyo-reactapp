import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class WithdrawalsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    return this.prisma.withdrawal.create({ data });
  }

  async findAll(take = 100, skip = 0) {
    return this.prisma.withdrawal.findMany({
      take,
      skip,
      orderBy: { date: 'desc' },
      include: { member: true },
    });
  }

  async findOne(id: number) {
    return this.prisma.withdrawal.findUnique({
      where: { id },
      include: { member: true },
    });
  }

  async update(id: number, data: any) {
    return this.prisma.withdrawal.update({
      where: { id },
      data,
      include: { member: true },
    });
  }

  async remove(id: number) {
    return this.prisma.withdrawal.delete({ where: { id } });
  }

  async findByMember(memberId: number) {
    return this.prisma.withdrawal.findMany({
      where: { memberId },
      orderBy: { date: 'desc' },
    });
  }
}
