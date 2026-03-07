import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class RepaymentsService {
  constructor(private prisma: PrismaService) {}

  private readonly financialAccountTypes = ['cash', 'bank', 'mobileMoney', 'pettyCash'] as const;

  private normalizePaymentMethod(method?: string) {
    const normalized = String(method || '').trim().toLowerCase();
    if (normalized === 'mpesa') return 'mobileMoney';
    if (['bank', 'bank_deposit', 'check_off'].includes(normalized)) return 'bank';
    if (normalized === 'cash') return 'cash';
    return undefined;
  }

  private async resolveSettlementAccount(options: {
    accountId?: number | null;
    fallbackAccountId?: number | null;
    method?: string;
  }) {
    const { accountId, fallbackAccountId, method } = options;
    const candidateIds = [accountId, fallbackAccountId].filter(
      (value): value is number => typeof value === 'number' && Number.isFinite(value),
    );

    for (const candidateId of candidateIds) {
      const account = await this.prisma.account.findUnique({ where: { id: candidateId } });
      if (account && this.financialAccountTypes.includes(account.type as any) && account.isActive !== false) {
        return account;
      }
    }

    const accounts = await this.prisma.account.findMany({
      where: {
        type: { in: this.financialAccountTypes as any },
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    if (accounts.length === 0) {
      throw new BadRequestException('No active settlement account found. Please create/select an account first.');
    }

    const preferredType = this.normalizePaymentMethod(method);
    const typeScoped = preferredType
      ? accounts.filter((account) => {
          if (preferredType === 'cash') return ['cash', 'pettyCash'].includes(account.type as any);
          return account.type === preferredType;
        })
      : accounts;

    if (typeScoped.length === 1) {
      return typeScoped[0];
    }

    const preferredNameMatchers: RegExp[] = [];
    if (preferredType === 'cash') {
      preferredNameMatchers.push(/^cash at hand$/i, /^cashbox$/i);
    } else if (preferredType === 'mobileMoney') {
      preferredNameMatchers.push(/e.?wallet/i, /mobile money/i, /mpesa/i, /c\.?e\.?w/i);
    } else if (preferredType === 'bank') {
      preferredNameMatchers.push(/co[- ]?operative/i, /cooperative/i, /cytonn/i, /money market/i, /collection account/i);
    }

    for (const matcher of preferredNameMatchers) {
      const matched = typeScoped.find((account) => matcher.test(account.name || ''));
      if (matched) {
        return matched;
      }
    }

    if (accounts.length === 1) {
      return accounts[0];
    }

    throw new BadRequestException(
      'Account is required to avoid mixed ledger postings. Multiple active settlement accounts exist; provide accountId.',
    );
  }

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
        accountId: data.accountId ? parseInt(data.accountId) : null,
      };

      // Validate required fields
      if (!repaymentData.loanId || !repaymentData.amount || repaymentData.amount <= 0) {
        throw new BadRequestException('Loan ID and valid amount are required');
      }

      const amountDecimal = new Prisma.Decimal(repaymentData.amount);
      const settlementAccount = await this.resolveSettlementAccount({
        accountId: repaymentData.accountId,
        method: repaymentData.method,
      });
      repaymentData.accountId = settlementAccount.id;

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
      await this.prisma.loan.update({
        where: { id: repaymentData.loanId },
        data: { balance: new Prisma.Decimal(newLoanBalance) }
      });

      // Sync: Create journal entry
      const loanRepaymentAccount = await this.ensureAccountByName(
        'Loan Repayments Received',
        'gl',
        'GL account for loan repayments'
      );

      const cashAccount = settlementAccount;

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
        const updatedMember = await this.prisma.member.update({
          where: { id: loan.memberId },
          data: { loanBalance: { decrement: repaymentData.amount } },
        });

        await this.prisma.ledger.create({
          data: {
            memberId: loan.memberId,
            type: 'loan_repayment',
            amount: repaymentData.amount,
            description: `Loan repayment - ${loan.member?.name || loan.memberName || `Loan #${loan.id}`}`,
            reference: `REPAY-${repayment.id}`,
            balanceAfter: Number(updatedMember.balance),
            date: repaymentData.date,
          },
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
    const oldMethod = repayment.method || 'cash';
    const newMethod = data.method || oldMethod;
    const newAccountId = data.accountId ? parseInt(data.accountId) : repayment.accountId;

    // Update the repayment
    const updatedRepayment = await this.prisma.repayment.update({
      where: { id },
      data: {
        amount: newAmount,
        method: newMethod,
        notes: data.notes || repayment.notes,
        date: data.date ? new Date(data.date) : repayment.date,
        accountId: newAccountId,
      },
      include: { loan: true },
    });

    const oldSettlementAccount = await this.resolveSettlementAccount({
      accountId: repayment.accountId,
      method: oldMethod,
    });
    const newSettlementAccount = await this.resolveSettlementAccount({
      accountId: updatedRepayment.accountId,
      fallbackAccountId: repayment.accountId,
      method: newMethod,
    });
    const accountChanged = oldSettlementAccount.id !== newSettlementAccount.id;

    // If amount/account changed, sync balances and journal entry
    if (amountDifference !== 0 || accountChanged) {
      const oldAmountDecimal = new Prisma.Decimal(oldAmount);
      const newAmountDecimal = new Prisma.Decimal(newAmount);

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
        'gl',
        'GL account for loan repayments'
      );

      await this.prisma.journalEntry.create({
        data: {
          date: updatedRepayment.date,
          reference: `REPAY-${id}`,
          description: `Loan repayment - ${loan.memberName}`,
          narration: updatedRepayment.notes || null,
          debitAccountId: newSettlementAccount.id,
          debitAmount: newAmountDecimal,
          creditAccountId: loanRepaymentAccount.id,
          creditAmount: newAmountDecimal,
          category: 'loan_repayment',
        },
      });

      // Reverse old posting then apply new posting (handles amount and account changes)
      await this.prisma.account.update({
        where: { id: oldSettlementAccount.id },
        data: { balance: { decrement: oldAmountDecimal } },
      });
      await this.prisma.account.update({
        where: { id: newSettlementAccount.id },
        data: { balance: { increment: newAmountDecimal } },
      });

      // Update member loan balance
      if (loan.memberId) {
        let updatedMember;
        if (amountDifference > 0) {
          updatedMember = await this.prisma.member.update({
            where: { id: loan.memberId },
            data: { loanBalance: { decrement: Math.abs(amountDifference) } },
          });
        } else {
          updatedMember = await this.prisma.member.update({
            where: { id: loan.memberId },
            data: { loanBalance: { increment: Math.abs(amountDifference) } },
          });
        }

        await this.prisma.ledger.deleteMany({
          where: {
            memberId: loan.memberId,
            reference: `REPAY-${id}`,
            type: 'loan_repayment',
          },
        });

        await this.prisma.ledger.create({
          data: {
            memberId: loan.memberId,
            type: 'loan_repayment',
            amount: newAmount,
            description: `Loan repayment - ${loan.memberName || `Loan #${loan.id}`}`,
            reference: `REPAY-${id}`,
            balanceAfter: Number(updatedMember?.balance ?? 0),
            date: updatedRepayment.date,
          },
        });
      }
    }

    return updatedRepayment;
  }

  async remove(id: number) {
    const repayment = await this.prisma.repayment.findUnique({
      where: { id },
      include: { loan: true },
    });

    if (!repayment) {
      throw new NotFoundException(`Repayment #${id} not found`);
    }

    const amountDecimal = new Prisma.Decimal(repayment.amount);

    await this.prisma.repayment.delete({ where: { id } });

    await this.prisma.loan.update({
      where: { id: repayment.loanId },
      data: { balance: { increment: amountDecimal } },
    });

    await this.prisma.journalEntry.deleteMany({
      where: { reference: `REPAY-${id}` },
    });

    const cashAccount = await this.resolveSettlementAccount({
      accountId: repayment.accountId,
      method: repayment.method || 'cash',
    });

    await this.prisma.account.update({
      where: { id: cashAccount.id },
      data: { balance: { decrement: amountDecimal } },
    });

    if (repayment.loan.memberId) {
      await this.prisma.member.update({
        where: { id: repayment.loan.memberId },
        data: { loanBalance: { increment: Number(repayment.amount) } },
      });

      await this.prisma.ledger.deleteMany({
        where: {
          memberId: repayment.loan.memberId,
          reference: `REPAY-${id}`,
          type: 'loan_repayment',
        },
      });
    }

    return { success: true, id };
  }

  async findByLoan(loanId: number) {
    return this.prisma.repayment.findMany({
      where: { loanId },
      orderBy: { date: 'desc' },
    });
  }
}
