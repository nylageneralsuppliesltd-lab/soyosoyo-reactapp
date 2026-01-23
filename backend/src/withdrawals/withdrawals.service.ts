import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

export interface ExpenseRecord {
  date: string;
  amount: number;
  category: string;
  accountId?: number;
  paymentMethod: 'cash' | 'bank' | 'mpesa' | 'check_off' | 'bank_deposit' | 'other';
  description?: string;
  reference?: string;
  notes?: string;
}

export interface AccountTransferRecord {
  date: string;
  amount: number;
  fromAccountId: number;
  toAccountId: number;
  description?: string;
  reference?: string;
  notes?: string;
}

export interface RefundRecord {
  date: string;
  memberId: number;
  memberName?: string;
  amount: number;
  contributionType: string;
  accountId?: number;
  paymentMethod: 'cash' | 'bank' | 'mpesa' | 'check_off' | 'bank_deposit' | 'other';
  reference?: string;
  notes?: string;
}

export interface DividendPayoutRecord {
  date: string;
  memberId: number;
  memberName?: string;
  amount: number;
  accountId?: number;
  paymentMethod: 'cash' | 'bank' | 'mpesa' | 'check_off' | 'bank_deposit' | 'other';
  reference?: string;
  notes?: string;
}

@Injectable()
export class WithdrawalsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Helper: ensure account by name
   */
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

  /**
   * Record Expense Withdrawal with double-entry bookkeeping
   */
  async createExpense(data: ExpenseRecord) {
    const { date, amount, category, accountId, paymentMethod, description, reference, notes } = data;

    if (!amount || amount <= 0) {
      throw new BadRequestException('Valid amount is required');
    }

    if (!category || typeof category !== 'string' || category.trim() === '') {
      throw new BadRequestException('Expense category is required');
    }

    try {
      const parsedDate = new Date(date || new Date());
      const amountDecimal = new Prisma.Decimal(amount);

      // Validate the parsed amount
      if (isNaN(amountDecimal.toNumber()) || amountDecimal.toNumber() <= 0) {
        throw new BadRequestException('Amount must be a valid positive number');
      }

      // Get or create expense category
      let expenseCategory = await this.prisma.expenseCategory.findFirst({
        where: { name: category },
      });

      if (!expenseCategory) {
        expenseCategory = await this.prisma.expenseCategory.create({
          data: { name: category },
        });
      }

      // Get accounts
      const cashAccount = accountId
        ? await this.prisma.account.findUnique({ where: { id: accountId } })
        : await this.ensureAccountByName('Cashbox', 'cash', 'Default cash account');

      if (!cashAccount) {
        throw new NotFoundException('Cash account not found');
      }

      const expenseAccount = await this.ensureAccountByName(
        category,
        'bank',
        `Expense account for ${category}`,
      );

      // Create withdrawal record
      const withdrawal = await this.prisma.withdrawal.create({
        data: {
          type: 'expense',
          category,
          amount: amountDecimal,
          description: description || `Expense - ${category}`,
          narration: notes || null,
          reference: reference || null,
          method: paymentMethod,
          accountId: cashAccount.id,
          date: parsedDate,
        },
    });

    // Double-entry: DR Expense Account, CR Cash Account
    await this.prisma.journalEntry.create({
      data: {
        date: parsedDate,
        reference: reference || `EXP-${withdrawal.id}`,
        description: `Expense - ${category}`,
        narration: notes || null,
        debitAccountId: expenseAccount.id,
        debitAmount: amountDecimal,
        creditAccountId: cashAccount.id,
        creditAmount: amountDecimal,
        category: 'expense',
      },
    });

    // Update account balances
    await this.prisma.account.update({
      where: { id: cashAccount.id },
      data: { balance: { decrement: amountDecimal } },
    });

    await this.prisma.account.update({
      where: { id: expenseAccount.id },
      data: { balance: { increment: amountDecimal } },
    });

    // Update category ledger
    await this.updateCategoryLedger(
      expenseCategory.id,
      'expense',
      category,
      Number(amount),
      withdrawal.id,
      'withdrawal',
      description || `Expense - ${category}`,
    );

    return withdrawal;
    } catch (error) {
      console.error('Expense creation error:', error);
      throw error;
    }
  }

  /**
   * Record Account-to-Account Transfer with double-entry
   */
  async createTransfer(data: AccountTransferRecord) {
    const { date, amount, fromAccountId, toAccountId, description, reference, notes } = data;

    if (!amount || amount <= 0) {
      throw new BadRequestException('Valid amount is required');
    }

    if (!fromAccountId || !toAccountId) {
      throw new BadRequestException('Both from and to accounts are required');
    }

    if (fromAccountId === toAccountId) {
      throw new BadRequestException('Cannot transfer to the same account');
    }

    const parsedDate = new Date(date || new Date());
    const amountDecimal = new Prisma.Decimal(amount);

    // Get accounts
    const fromAccount = await this.prisma.account.findUnique({ where: { id: fromAccountId } });
    const toAccount = await this.prisma.account.findUnique({ where: { id: toAccountId } });

    if (!fromAccount || !toAccount) {
      throw new NotFoundException('One or both accounts not found');
    }

    // Create withdrawal record for tracking
    const withdrawal = await this.prisma.withdrawal.create({
      data: {
        type: 'transfer',
        category: 'Account Transfer',
        amount: amountDecimal,
        description: description || `Transfer from ${fromAccount.name} to ${toAccount.name}`,
        narration: notes || null,
        reference: reference || null,
        method: 'bank',
        accountId: fromAccountId,
        date: parsedDate,
      },
    });

    // Double-entry: DR To Account, CR From Account
    await this.prisma.journalEntry.create({
      data: {
        date: parsedDate,
        reference: reference || `TRF-${withdrawal.id}`,
        description: `Transfer: ${fromAccount.name} → ${toAccount.name}`,
        narration: notes || null,
        debitAccountId: toAccountId,
        debitAmount: amountDecimal,
        creditAccountId: fromAccountId,
        creditAmount: amountDecimal,
        category: 'transfer',
      },
    });

    // Update account balances
    await this.prisma.account.update({
      where: { id: fromAccountId },
      data: { balance: { decrement: amountDecimal } },
    });

    await this.prisma.account.update({
      where: { id: toAccountId },
      data: { balance: { increment: amountDecimal } },
    });

    return withdrawal;
  }

  /**
   * Record Contribution Refund with double-entry
   */
  async createRefund(data: RefundRecord) {
    const { date, memberId, memberName, amount, contributionType, accountId, paymentMethod, reference, notes } = data;

    if (!amount || amount <= 0) {
      throw new BadRequestException('Valid amount is required');
    }

    if (!memberId) {
      throw new BadRequestException('Member is required');
    }

    const parsedDate = new Date(date || new Date());
    const amountDecimal = new Prisma.Decimal(amount);

    // Get member
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Get accounts
    const cashAccount = accountId
      ? await this.prisma.account.findUnique({ where: { id: accountId } })
      : await this.ensureAccountByName('Cashbox', 'cash', 'Default cash account');

    if (!cashAccount) {
      throw new NotFoundException('Cash account not found');
    }

    const memberContributionAccount = await this.ensureAccountByName(
      'Member Contributions Received',
      'bank',
      'Member contributions liability account',
    );

    // Create withdrawal record
    const withdrawal = await this.prisma.withdrawal.create({
      data: {
        type: 'refund',
        category: `Refund - ${contributionType}`,
        amount: amountDecimal,
        memberId,
        memberName: memberName || member.name,
        description: `Contribution refund - ${contributionType}`,
        narration: notes || null,
        reference: reference || null,
        method: paymentMethod,
        accountId: cashAccount.id,
        date: parsedDate,
      },
    });

    // Double-entry: DR Member Contributions Account, CR Cash Account
    await this.prisma.journalEntry.create({
      data: {
        date: parsedDate,
        reference: reference || `REF-${withdrawal.id}`,
        description: `Refund to ${member.name} - ${contributionType}`,
        narration: notes || null,
        debitAccountId: memberContributionAccount.id,
        debitAmount: amountDecimal,
        creditAccountId: cashAccount.id,
        creditAmount: amountDecimal,
        category: 'refund',
      },
    });

    // Update account balances
    await this.prisma.account.update({
      where: { id: cashAccount.id },
      data: { balance: { decrement: amountDecimal } },
    });

    await this.prisma.account.update({
      where: { id: memberContributionAccount.id },
      data: { balance: { decrement: amountDecimal } },
    });

    // Update member balance and ledger
    const updatedMember = await this.prisma.member.update({
      where: { id: memberId },
      data: { balance: { decrement: Number(amount) } },
    });

    await this.prisma.ledger.create({
      data: {
        memberId,
        type: 'refund',
        amount: -Number(amount),
        description: `Refund - ${contributionType}`,
        reference: reference || null,
        balanceAfter: Number(updatedMember.balance),
        date: parsedDate,
      },
    });

    return withdrawal;
  }

  /**
   * Record Dividend Payout with double-entry
   */
  async createDividend(data: DividendPayoutRecord) {
    const { date, memberId, memberName, amount, accountId, paymentMethod, reference, notes } = data;

    if (!amount || amount <= 0) {
      throw new BadRequestException('Valid amount is required');
    }

    if (!memberId) {
      throw new BadRequestException('Member is required');
    }

    const parsedDate = new Date(date || new Date());
    const amountDecimal = new Prisma.Decimal(amount);

    // Get member
    const member = await this.prisma.member.findUnique({ where: { id: memberId } });
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Get accounts
    const cashAccount = accountId
      ? await this.prisma.account.findUnique({ where: { id: accountId } })
      : await this.ensureAccountByName('Cashbox', 'cash', 'Default cash account');

    if (!cashAccount) {
      throw new NotFoundException('Cash account not found');
    }

    const dividendAccount = await this.ensureAccountByName(
      'Dividends Payable',
      'bank',
      'Dividends payable to members',
    );

    // Create withdrawal record
    const withdrawal = await this.prisma.withdrawal.create({
      data: {
        type: 'dividend',
        category: 'Dividend Payout',
        amount: amountDecimal,
        memberId,
        memberName: memberName || member.name,
        description: `Dividend payout to ${member.name}`,
        narration: notes || null,
        reference: reference || null,
        method: paymentMethod,
        accountId: cashAccount.id,
        date: parsedDate,
      },
    });

    // Double-entry: DR Dividends Payable, CR Cash Account
    await this.prisma.journalEntry.create({
      data: {
        date: parsedDate,
        reference: reference || `DIV-${withdrawal.id}`,
        description: `Dividend payout to ${member.name}`,
        narration: notes || null,
        debitAccountId: dividendAccount.id,
        debitAmount: amountDecimal,
        creditAccountId: cashAccount.id,
        creditAmount: amountDecimal,
        category: 'dividend',
      },
    });

    // Update account balances
    await this.prisma.account.update({
      where: { id: cashAccount.id },
      data: { balance: { decrement: amountDecimal } },
    });

    await this.prisma.account.update({
      where: { id: dividendAccount.id },
      data: { balance: { decrement: amountDecimal } },
    });

    // Update member ledger (dividends don't affect contribution balance)
    await this.prisma.ledger.create({
      data: {
        memberId,
        type: 'dividend',
        amount: Number(amount),
        description: 'Dividend payout',
        reference: reference || null,
        balanceAfter: Number(member.balance), // Balance unchanged by dividends
        date: parsedDate,
      },
    });

    return withdrawal;
  }

  /**
   * Update category ledger with transaction entry
   */
  private async updateCategoryLedger(
    categoryId: number,
    categoryType: 'income' | 'expense',
    categoryName: string,
    amount: number,
    transactionId: number,
    transactionType: string,
    description: string,
  ) {
    try {
      let categoryLedger = await this.prisma.categoryLedger.findFirst({
        where: {
          OR: [
            { expenseCategoryId: categoryType === 'expense' ? categoryId : undefined },
            { incomeCategoryId: categoryType === 'income' ? categoryId : undefined },
          ],
        },
      });

      if (!categoryLedger) {
        categoryLedger = await this.prisma.categoryLedger.create({
          data: {
            categoryType,
            categoryName,
            expenseCategoryId: categoryType === 'expense' ? categoryId : null,
            incomeCategoryId: categoryType === 'income' ? categoryId : null,
          },
        });
      }

      const newBalance = Number(categoryLedger.balance) + amount;

      await this.prisma.categoryLedger.update({
        where: { id: categoryLedger.id },
        data: { 
          balance: newBalance,
          totalAmount: { increment: amount },
        },
      });

      await this.prisma.categoryLedgerEntry.create({
        data: {
          categoryLedgerId: categoryLedger.id,
          type: 'debit',
          amount,
          balanceAfter: newBalance,
          description,
          sourceType: transactionType,
          sourceId: transactionId.toString(),
        },
      });
    } catch (error) {
      console.warn('Category ledger update failed:', error.message);
      // Non-critical, continue processing
    }
  }

  async findAll(take = 100, skip = 0) {
    return this.prisma.withdrawal.findMany({
      take,
      skip,
      orderBy: { date: 'desc' },
      include: { 
        member: true,
        account: true,
      },
    });
  }

  async findOne(id: number) {
    return this.prisma.withdrawal.findUnique({
      where: { id },
      include: { 
        member: true,
        account: true,
      },
    });
  }

  async update(id: number, data: any) {
    // For simplicity, only allow updating notes/description
    return this.prisma.withdrawal.update({
      where: { id },
      data: {
        notes: data.notes,
        description: data.description,
        narration: data.narration,
      },
      include: { member: true, account: true },
    });
  }

  async remove(id: number) {
    // Note: This should ideally reverse the double-entry bookkeeping
    // For now, simple deletion
    return this.prisma.withdrawal.delete({ where: { id } });
  }

  async findByMember(memberId: number) {
    return this.prisma.withdrawal.findMany({
      where: { memberId },
      orderBy: { date: 'desc' },
      include: { account: true },
    });
  }

  async getWithdrawalStats() {
    const [total, byType] = await Promise.all([
      this.prisma.withdrawal.aggregate({
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.withdrawal.groupBy({
        by: ['type'],
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    return {
      totalAmount: total._sum.amount || 0,
      totalCount: total._count,
      byType,
    };
  }
}
