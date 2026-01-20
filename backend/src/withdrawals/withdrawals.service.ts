import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class WithdrawalsService {
  constructor(private prisma: PrismaService) {}

  private async ensureAccount(name: string, type: string, description?: string) {
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

  async create(data: any) {
    try {
      // Transform and validate incoming data
      const withdrawalData = {
        memberName: data.memberName?.trim() || 'Unspecified',
        memberId: data.memberId ? parseInt(data.memberId) : null,
        amount: data.amount ? parseFloat(data.amount) : 0,
        method: data.method || 'cash',
        purpose: data.purpose?.trim() || null,
        date: data.date ? new Date(data.date) : new Date(),
        notes: data.notes?.trim() || null,
        type: data.type || 'refund',
        category: data.category?.trim() || null,
        description: data.description?.trim() || null,
        narration: data.narration?.trim() || null,
        reference: data.reference?.trim() || null,
        accountId: data.accountId ? parseInt(data.accountId) : null,
      };

      // Validate required fields
      if (!withdrawalData.memberName || !withdrawalData.amount || withdrawalData.amount <= 0) {
        throw new BadRequestException('Member name and valid amount are required');
      }

      const amountDecimal = new Prisma.Decimal(withdrawalData.amount || 0);

      // Create the withdrawal record
      const withdrawal = await this.prisma.withdrawal.create({ data: withdrawalData });

      // Ensure accounts exist (fallback defaults if none provided)
      const cashAccount = withdrawalData.accountId
        ? await this.prisma.account.findUnique({ where: { id: withdrawalData.accountId } })
        : await this.ensureAccount('Cashbox', 'cash', 'Default cash account');

      const memberDepositAccount = await this.ensureAccount(
        'Member Withdrawals',
        'cash',
        'Member withdrawals holding account',
      );

      // Update account balances (cash out and reduce member deposit balance)
      await this.prisma.account.update({
        where: { id: cashAccount.id },
        data: { balance: { decrement: amountDecimal } },
      });

      await this.prisma.account.update({
        where: { id: memberDepositAccount.id },
        data: { balance: { decrement: amountDecimal } },
      });

      // Record journal entry for the ledger
      await this.prisma.journalEntry.create({
        data: {
          date: withdrawalData.date,
          reference: withdrawalData.reference ?? null,
          description: `Member withdrawal - ${withdrawalData.memberName}`,
          narration: withdrawalData.notes ?? null,
          debitAccountId: memberDepositAccount.id,
          debitAmount: amountDecimal,
          creditAccountId: cashAccount.id,
          creditAmount: amountDecimal,
          category: 'withdrawal',
        },
      });

      // Update member balance and personal ledger for statement view
      if (withdrawalData.memberId) {
        const updatedMember = await this.prisma.member.update({
          where: { id: withdrawalData.memberId },
          data: { balance: { decrement: withdrawalData.amount } },
        });

        await this.prisma.ledger.create({
          data: {
            memberId: withdrawalData.memberId,
            type: withdrawalData.type || 'Withdrawal',
            amount: -withdrawalData.amount,
            description: withdrawalData.description || withdrawalData.purpose || withdrawalData.narration || 'Withdrawal',
            reference: withdrawalData.reference,
            balanceAfter: updatedMember.balance,
            date: withdrawalData.date,
          },
        });
      }

      return withdrawal;
    } catch (error) {
      console.error('Withdrawal creation error:', error);
      throw error;
    }
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
