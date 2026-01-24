import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class FinesService {
  constructor(private prisma: PrismaService) {}

  private async ensureAccountByName(
    name: string,
    type: string,
    description?: string,
  ): Promise<{ id: number; name: string }> {
    const existing = await this.prisma.account.findFirst({ where: { name } });
    if (existing) return existing;

    return this.prisma.account.create({
      data: {
        name,
        type: type as any,
        description: description ?? null,
        currency: 'KES',
        balance: new Prisma.Decimal(0),
      },
    });
  }

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
    const amountDecimal = new Prisma.Decimal(data.amount || 0);

    const fine = await this.prisma.fine.create({
      data: {
        ...data,
        memberId: +data.memberId,
        amount: amountDecimal,
      },
      include: {
        member: true,
      },
    });

    // Sync: Create GL account for fines collected
    const finesAccount = await this.ensureAccountByName(
      'Fines Collected',
      'bank',
      'GL account for collected fines'
    );

    // Create journal entry (fines are recorded as liability, not immediate cash in)
    // Debit: Fines Receivable GL, Credit: Fines Collected GL
    await this.prisma.journalEntry.create({
      data: {
        date: data.dueDate ? new Date(data.dueDate) : new Date(),
        reference: `FINE-${fine.id}`,
        description: `Fine imposed - ${fine.member?.name || 'Unknown'}`,
        narration: data.reason || null,
        debitAccountId: finesAccount.id,
        debitAmount: amountDecimal,
        creditAccountId: finesAccount.id,
        creditAmount: amountDecimal,
        category: 'fine',
      },
    });

    return fine;
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
    if (!fine) throw new NotFoundException('Fine not found');

    const oldPaidAmount = Number(fine.paidAmount);
    const paymentDifference = amountPaid - oldPaidAmount;
    const totalAmount = Number(fine.amount);
    const newStatus = amountPaid >= totalAmount ? 'paid' : (amountPaid > 0 ? 'partial' : 'unpaid');

    // Update fine record
    const updatedFine = await this.prisma.fine.update({
      where: { id },
      data: {
        paidAmount: amountPaid,
        status: newStatus,
        paidDate: newStatus === 'paid' ? new Date() : fine.paidDate,
      },
      include: { member: true }
    });

    // Sync: If payment increased, create journal entry
    if (paymentDifference > 0) {
      const paymentDecimal = new Prisma.Decimal(paymentDifference);

      const finesAccount = await this.ensureAccountByName(
        'Fines Collected',
        'bank',
        'GL account for collected fines'
      );

      const cashAccount = await this.ensureAccountByName(
        'Cashbox',
        'cash',
        'Default cash account'
      );

      // Debit: Cash (money in), Credit: Fines Collected GL
      await this.prisma.journalEntry.create({
        data: {
          date: new Date(),
          reference: `FINE-PAY-${id}`,
          description: `Fine payment - ${updatedFine.member?.name || 'Unknown'}`,
          narration: null,
          debitAccountId: cashAccount.id,
          debitAmount: paymentDecimal,
          creditAccountId: finesAccount.id,
          creditAmount: paymentDecimal,
          category: 'fine_payment',
        },
      });

      // Update cash account balance
      await this.prisma.account.update({
        where: { id: cashAccount.id },
        data: { balance: { increment: paymentDecimal } },
      });
    }

    return updatedFine;
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
