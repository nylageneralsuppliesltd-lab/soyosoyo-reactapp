import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class RepaymentsService {
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

  async create(data: any) {
    try {
      // Transform and validate incoming data
      const repaymentData = {
        loanId: data.loanId ? parseInt(data.loanId) : null,
        memberId: data.memberId ? parseInt(data.memberId) : null,
        amount: data.amount ? parseFloat(data.amount) : 0,
        date: data.date ? new Date(data.date) : new Date(),
        method: data.method || 'cash',
        notes: data.notes?.trim() || null,
      };

      // Validate required fields
      if (!repaymentData.loanId || !repaymentData.amount || repaymentData.amount <= 0) {
        throw new BadRequestException('Loan ID and valid amount are required');
      }

      const amountDecimal = new Prisma.Decimal(repaymentData.amount);

      // Get the loan to update balance
      const loan = await this.prisma.loan.findUnique({ 
        where: { id: repaymentData.loanId },
        include: { member: true }
      });

      if (!loan) {
        throw new NotFoundException(`Loan #${repaymentData.loanId} not found`);
      }

      // Create the repayment record
      const repayment = await this.prisma.repayment.create({ 
        data: repaymentData 
      });

      // Sync: Update loan balance
      const newLoanBalance = Math.max(0, Number(loan.balance) - repaymentData.amount);
      const updatedLoan = await this.prisma.loan.update({
        where: { id: repaymentData.loanId },
        data: { balance: new Prisma.Decimal(newLoanBalance) },
        include: { loanType: true }
      });

      // After repayment, re-check and impose fines if needed
      // (import LoansService if not already, or move fine logic to a shared util)
      const loansService = (global as any).loansServiceInstance;
      if (loansService && typeof loansService.imposeFinesIfNeeded === 'function') {
        await loansService.imposeFinesIfNeeded({ ...loan, ...updatedLoan });
      }

      // Sync: Create journal entry
      const loanRepaymentAccount = await this.ensureAccountByName(
        'Loan Repayments Received',
        'bank',
        'GL account for loan repayments'
      );

      const cashAccount = await this.ensureAccountByName(
        'Cashbox',
        'cash',
        'Default cash account'
      );

      // Double-entry: Debit Cash (money in), Credit Loan Repayments GL
      await this.prisma.journalEntry.create({
        data: {
          date: repaymentData.date,
          reference: `REPAY-${repayment.id}`,
          description: `Loan repayment - ${loan.memberName}`,
          narration: repaymentData.notes || null,
          debitAccountId: cashAccount.id,
          debitAmount: amountDecimal,
          creditAccountId: loanRepaymentAccount.id,
          creditAmount: amountDecimal,
          category: 'loan_repayment',
        },
      });

      // Update cash account balance (increment)
      await this.prisma.account.update({
        where: { id: cashAccount.id },
        data: { balance: { increment: amountDecimal } },
      });

      // Update member loan balance if applicable
      if (loan.memberId) {
        await this.prisma.member.update({
          where: { id: loan.memberId },
          data: { loanBalance: { decrement: repaymentData.amount } },
        });
      }

      return repayment;
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
    const repayment = await this.prisma.repayment.findUnique({ 
      where: { id },
      include: { loan: true }
    });

    if (!repayment) {
      throw new NotFoundException(`Repayment #${id} not found`);
    }

    const oldAmount = Number(repayment.amount);
    const newAmount = data.amount ? parseFloat(data.amount) : oldAmount;
    const amountDifference = newAmount - oldAmount;

    // Update the repayment
    const updatedRepayment = await this.prisma.repayment.update({
      where: { id },
      data: {
        amount: newAmount,
        method: data.method || repayment.method,
        notes: data.notes || repayment.notes,
        date: data.date ? new Date(data.date) : repayment.date,
      },
      include: { loan: true },
    });

    // If amount changed, sync the difference
    if (amountDifference !== 0) {
      const amountDec = new Prisma.Decimal(Math.abs(amountDifference));

      // Update loan balance
      const loan = repayment.loan;
      const newLoanBalance = amountDifference < 0 
        ? Number(loan.balance) + Math.abs(amountDifference)
        : Math.max(0, Number(loan.balance) - amountDifference);

      await this.prisma.loan.update({
        where: { id: repayment.loanId },
        data: { balance: new Prisma.Decimal(newLoanBalance) }
      });

      // Update or delete old journal entry
      await this.prisma.journalEntry.deleteMany({
        where: {
          reference: `REPAY-${id}`,
        }
      });

      // Create new journal entry with updated amount
      const loanRepaymentAccount = await this.ensureAccountByName(
        'Loan Repayments Received',
        'bank',
        'GL account for loan repayments'
      );

      const cashAccount = await this.ensureAccountByName(
        'Cashbox',
        'cash',
        'Default cash account'
      );

      await this.prisma.journalEntry.create({
        data: {
          date: updatedRepayment.date,
          reference: `REPAY-${id}`,
          description: `Loan repayment - ${loan.memberName}`,
          narration: updatedRepayment.notes || null,
          debitAccountId: cashAccount.id,
          debitAmount: new Prisma.Decimal(newAmount),
          creditAccountId: loanRepaymentAccount.id,
          creditAmount: new Prisma.Decimal(newAmount),
          category: 'loan_repayment',
        },
      });

      // Update cash account balance
      if (amountDifference > 0) {
        await this.prisma.account.update({
          where: { id: cashAccount.id },
          data: { balance: { increment: amountDec } },
        });
      } else {
        await this.prisma.account.update({
          where: { id: cashAccount.id },
          data: { balance: { decrement: amountDec } },
        });
      }

      // Update member loan balance
      if (loan.memberId) {
        if (amountDifference > 0) {
          await this.prisma.member.update({
            where: { id: loan.memberId },
            data: { loanBalance: { decrement: Math.abs(amountDifference) } },
          });
        } else {
          await this.prisma.member.update({
            where: { id: loan.memberId },
            data: { loanBalance: { increment: Math.abs(amountDifference) } },
          });
        }
      }
    }

    return updatedRepayment;
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
