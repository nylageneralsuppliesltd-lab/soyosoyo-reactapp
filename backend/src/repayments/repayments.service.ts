import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class RepaymentsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    return this.prisma.repayment.create({ data });
  }

  async findAll(take = 100, skip = 0) {
    return this.prisma.repayment.findMany({
      take,
      skip,
      orderBy: { date: 'desc' },
      include: { loan: true },
    });
  }

  async findOne(id: number) {
    return this.prisma.repayment.findUnique({
      where: { id },
      include: { loan: true },
    });
  }

  async update(id: number, data: any) {
    return this.prisma.repayment.update({
      where: { id },
      data,
      include: { loan: true },
    });
  }

  async remove(id: number) {
    return this.prisma.repayment.delete({ where: { id } });
  }

  async findByLoan(loanId: number) {
    return this.prisma.repayment.findMany({
      where: { loanId },
      orderBy: { date: 'desc' },
    });
  }
}
