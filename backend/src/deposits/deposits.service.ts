import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class DepositsService {
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
      const depositData = {
        memberName: data.memberName?.trim() || null,
        memberId: data.memberId ? parseInt(data.memberId) : null,
        amount: data.amount ? parseFloat(data.amount) : 0,
        method: data.method || 'cash',
        reference: data.reference?.trim() || null,
        date: data.date ? new Date(data.date) : new Date(),
        notes: data.notes?.trim() || null,
        type: data.type || 'contribution',
        category: data.category?.trim() || null,
        description: data.description?.trim() || null,
        narration: data.narration?.trim() || null,
        accountId: data.accountId ? parseInt(data.accountId) : null,
      };

      const amountDecimal = new Prisma.Decimal(depositData.amount || 0);

      // Validate required fields
      if (!depositData.amount || depositData.amount <= 0) {
        throw new BadRequestException('Valid amount is required');
      }

      // Create the deposit record
      const deposit = await this.prisma.deposit.create({ data: depositData });

      // Ensure accounts exist (fallback defaults if none provided)
      const cashAccount = depositData.accountId
        ? await this.prisma.account.findUnique({ where: { id: depositData.accountId } })
        : await this.ensureAccount('Cashbox', 'cash', 'Default cash account');

      const memberDepositAccount = await this.ensureAccount(
        'Member Deposits',
        'cash',
        'Member deposits holding account',
      );

      // Update account balances
      await this.prisma.account.update({
        where: { id: cashAccount.id },
        data: { balance: { increment: amountDecimal } },
      });

      await this.prisma.account.update({
        where: { id: memberDepositAccount.id },
        data: { balance: { increment: amountDecimal } },
      });

      // Record journal entry for the ledger
      await this.prisma.journalEntry.create({
        data: {
          date: depositData.date,
          reference: depositData.reference ?? null,
          description: `Member deposit${depositData.memberName ? ' - ' + depositData.memberName : ''}`,
          narration: depositData.notes ?? null,
          debitAccountId: cashAccount.id,
          debitAmount: amountDecimal,
          creditAccountId: memberDepositAccount.id,
          creditAmount: amountDecimal,
          category: 'deposit',
        },
      });

      return deposit;
    } catch (error) {
      console.error('Deposit creation error:', error);
      throw error;
    }
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
