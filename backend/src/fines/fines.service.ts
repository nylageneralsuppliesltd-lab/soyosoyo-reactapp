import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class FinesService {
  constructor(private prisma: PrismaService) {}

  async getFines(status?: string) {
    const where: any = {};
    if (status) {
      where.status = status;
    }

    return this.prisma.fine.findMany({
      where,
      include: {
        member: true,
        loan: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFinsByMember(memberId: number) {
    return this.prisma.fine.findMany({
      where: { memberId },
      include: {
        loan: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createFine(data: any) {
    return this.prisma.fine.create({
      data: {
        ...data,
        memberId: +data.memberId,
      },
      include: {
        member: true,
      },
    });
  }

  async updateFine(id: number, data: any) {
    return this.prisma.fine.update({
      where: { id },
      data,
      include: {
        member: true,
      },
    });
  }

  async recordFinePayment(id: number, amountPaid: number) {
    const fine = await this.prisma.fine.findUnique({ where: { id } });
    if (!fine) throw new Error('Fine not found');

    const newPaidAmount = Number(fine.paidAmount) + amountPaid;
    const totalAmount = Number(fine.amount);
    const newStatus = newPaidAmount >= totalAmount ? 'paid' : 'partial';

    return this.prisma.fine.update({
      where: { id },
      data: {
        paidAmount: newPaidAmount,
        status: newStatus,
        paidDate: newStatus === 'paid' ? new Date() : fine.paidDate,
      },
    });
  }

  async deleteFine(id: number) {
    return this.prisma.fine.delete({ where: { id } });
  }

  async getFineStatistics() {
    const unpaid = await this.prisma.fine.aggregate({
      where: { status: 'unpaid' },
      _sum: { amount: true },
    });

    const partial = await this.prisma.fine.aggregate({
      where: { status: 'partial' },
      _sum: { amount: true },
    });

    const paid = await this.prisma.fine.aggregate({
      where: { status: 'paid' },
      _sum: { amount: true },
    });

    return {
      unpaid: {
        count: (await this.prisma.fine.count({ where: { status: 'unpaid' } })),
        total: unpaid._sum.amount || 0,
      },
      partial: {
        count: (await this.prisma.fine.count({ where: { status: 'partial' } })),
        total: partial._sum.amount || 0,
      },
      paid: {
        count: (await this.prisma.fine.count({ where: { status: 'paid' } })),
        total: paid._sum.amount || 0,
      },
    };
  }
}
