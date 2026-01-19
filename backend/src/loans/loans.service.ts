import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class LoansService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    return this.prisma.loan.create({ data });
  }

  async findAll(take = 100, skip = 0) {
    return this.prisma.loan.findMany({
      take,
      skip,
      orderBy: { startDate: 'desc' },
      include: { borrower: true, repayments: true },
    });
  }

  async findOne(id: number) {
    return this.prisma.loan.findUnique({
      where: { id },
      include: { borrower: true, repayments: { orderBy: { date: 'desc' } } },
    });
  }

  async update(id: number, data: any) {
    return this.prisma.loan.update({
      where: { id },
      data,
      include: { borrower: true, repayments: true },
    });
  }

  async remove(id: number) {
    return this.prisma.loan.delete({ where: { id } });
  }

  async findByBorrower(borrowerId: number) {
    return this.prisma.loan.findMany({
      where: { borrowerId },
      orderBy: { startDate: 'desc' },
      include: { repayments: true },
    });
  }

  async findByStatus(status: string) {
    return this.prisma.loan.findMany({
      where: { status: status as any },
      orderBy: { startDate: 'desc' },
      include: { borrower: true, repayments: true },
    });
  }
}
