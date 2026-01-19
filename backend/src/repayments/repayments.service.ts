import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class RepaymentsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    try {
      // Transform and validate incoming data
      const repaymentData = {
        loanId: data.loanId ? parseInt(data.loanId) : null,
        amount: data.amount ? parseFloat(data.amount) : 0,
        date: data.date ? new Date(data.date) : new Date(),
        method: data.method || 'cash',
        notes: data.notes?.trim() || null,
      };

      // Validate required fields
      if (!repaymentData.loanId || !repaymentData.amount || repaymentData.amount <= 0) {
        throw new BadRequestException('Loan ID and valid amount are required');
      }

      return this.prisma.repayment.create({ data: repaymentData });
    } catch (error) {
      console.error('Repayment creation error:', error);
      throw error;
    }
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
