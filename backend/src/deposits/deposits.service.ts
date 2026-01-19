import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class DepositsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    return this.prisma.deposit.create({ data });
  }

  async findAll(take = 100, skip = 0) {
    return this.prisma.deposit.findMany({
      take,
      skip,
      orderBy: { date: 'desc' },
      include: { member: true },
    });
  }

  async findOne(id: number) {
    return this.prisma.deposit.findUnique({
      where: { id },
      include: { member: true },
    });
  }

  async update(id: number, data: any) {
    return this.prisma.deposit.update({
      where: { id },
      data,
      include: { member: true },
    });
  }

  async remove(id: number) {
    return this.prisma.deposit.delete({ where: { id } });
  }

  async findByMember(memberId: number) {
    return this.prisma.deposit.findMany({
      where: { memberId },
      orderBy: { date: 'desc' },
    });
  }
}
