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

  private buildDefaultReference(withdrawal: {
    id: number;
    type?: string | null;
    reference?: string | null;
  }) {
    if (withdrawal.reference) {
      return withdrawal.reference;
    }

    switch (withdrawal.type) {
      case 'expense':
        return `EXP-${withdrawal.id}`;
      case 'transfer':
        return `TRF-${withdrawal.id}`;
      case 'refund':
        return `REF-${withdrawal.id}`;
      case 'dividend':
        return `DIV-${withdrawal.id}`;
      default:
        return `WTH-${withdrawal.id}`;
    }
  }

  private applyCanonicalMemberName<T extends { member?: { name?: string | null } | null; memberName?: string | null }>(
    record: T | null,
  ): T | null {
    if (!record) {
      return record;
    }

    return {
      ...record,
      memberName: record.member?.name || record.memberName || null,
    };
  }

  private applyCanonicalMemberNames<T extends { member?: { name?: string | null } | null; memberName?: string | null }>(
    records: T[],
  ): T[] {
    return records.map((record) => this.applyCanonicalMemberName(record) as T);
  }

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

      if (!accountId) {
        throw new BadRequestException('Account is required');
      }

      const cashAccount = await this.prisma.account.findUnique({ where: { id: accountId } });
      if (!cashAccount) {
        throw new NotFoundException('Account not found');
      }

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

    // Get or create GL expense account for this category
    const expenseGLAccountName = `${category} Expense`;
    let expenseGLAccount = await this.prisma.account.findFirst({
      where: { name: expenseGLAccountName },
    });

    if (!expenseGLAccount) {
      expenseGLAccount = await this.prisma.account.create({
        data: {
          name: expenseGLAccountName,
          type: 'gl', // GL account type (non-cash)
          description: `GL account for ${category} expense`,
          currency: 'KES',
          balance: new Prisma.Decimal(0),
        },
      });
    }

    // Proper double-entry journal entry:
    // Debit: Expense GL Account (expense increases, reducing equity)
    // Credit: Cash Account (asset decreases)
    await this.prisma.journalEntry.create({
      data: {
        date: parsedDate,
        reference: reference || `EXP-${withdrawal.id}`,
        description: `Expense - ${category}`,
        narration: notes || null,
        debitAccountId: expenseGLAccount.id,
        debitAmount: amountDecimal,
        creditAccountId: cashAccount.id,
        creditAmount: amountDecimal,
        category: 'expense',
      },
    });

    // Update account balance
    await this.prisma.account.update({
      where: { id: cashAccount.id },
      data: { balance: { decrement: amountDecimal } },
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
    const { date, memberId, amount, contributionType, accountId, paymentMethod, reference, notes } = data;

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

    if (!accountId) {
      throw new BadRequestException('Account is required');
    }

    // Get accounts
    const cashAccount = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!cashAccount) {
      throw new NotFoundException('Account not found');
    }

    // Create withdrawal record
    const withdrawal = await this.prisma.withdrawal.create({
      data: {
        type: 'refund',
        category: `Refund - ${contributionType}`,
        amount: amountDecimal,
        memberId,
        memberName: member.name,
        description: `Contribution refund - ${contributionType}`,
        narration: notes || null,
        reference: reference || null,
        method: paymentMethod,
        accountId: cashAccount.id,
        date: parsedDate,
      },
    });

    // Get or create GL contribution liability account to reverse
    // Refund should reduce group savings (liability): debit the "{Type} Received" GL
    const contributionGLName = contributionType ? `${contributionType} Received` : 'Contributions Received';
    let contributionGLAccount = await this.prisma.account.findFirst({
      where: { name: contributionGLName },
    });

    if (!contributionGLAccount) {
      contributionGLAccount = await this.prisma.account.create({
        data: {
          name: contributionGLName,
          type: 'gl', // GL account type (non-cash)
          description: `GL account for ${contributionType || 'Contributions'} liability`,
          currency: 'KES',
          balance: new Prisma.Decimal(0),
        },
      });
    }

    // Proper double-entry journal entry:
    // Debit: Contributions Received GL (liability decreases)
    // Credit: Cash/Bank Account (asset decreases)
    await this.prisma.journalEntry.create({
      data: {
        date: parsedDate,
        reference: reference || `REF-${withdrawal.id}`,
        description: `Refund to ${member.name} - ${contributionType}`,
        narration: notes || null,
        debitAccountId: contributionGLAccount.id,
        debitAmount: amountDecimal,
        creditAccountId: cashAccount.id,
        creditAmount: amountDecimal,
        category: 'refund',
      },
    });

    // Update account balance
    await this.prisma.account.update({
      where: { id: cashAccount.id },
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
        // Store positive amount; downstream balance math treats refunds as debits
        amount: Number(amount),
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
    const { date, memberId, amount, accountId, paymentMethod, reference, notes } = data;

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

    if (!accountId) {
      throw new BadRequestException('Account is required');
    }

    // Get accounts
    const cashAccount = await this.prisma.account.findUnique({ where: { id: accountId } });

    if (!cashAccount) {
      throw new NotFoundException('Account not found');
    }

    // Create withdrawal record
    const withdrawal = await this.prisma.withdrawal.create({
      data: {
        type: 'dividend',
        category: 'Dividend Payout',
        amount: amountDecimal,
        memberId,
        memberName: member.name,
        description: `Dividend payout to ${member.name}`,
        narration: notes || null,
        reference: reference || null,
        method: paymentMethod,
        accountId: cashAccount.id,
        date: parsedDate,
      },
    });

    // Get or create GL dividend payable account
    const dividendGLAccountName = 'Dividends Payable';
    let dividendGLAccount = await this.prisma.account.findFirst({
      where: { name: dividendGLAccountName },
    });

    if (!dividendGLAccount) {
      dividendGLAccount = await this.prisma.account.create({
        data: {
          name: dividendGLAccountName,
          type: 'gl', // GL account type (non-cash)
          description: 'GL account for dividends payable',
          currency: 'KES',
          balance: new Prisma.Decimal(0),
        },
      });
    }

    // Proper double-entry journal entry:
    // Debit: Dividends Payable GL Account (liability decreases)
    // Credit: Cash Account (asset decreases)
    await this.prisma.journalEntry.create({
      data: {
        date: parsedDate,
        reference: reference || `DIV-${withdrawal.id}`,
        description: `Dividend payout to ${member.name}`,
        narration: notes || null,
        debitAccountId: dividendGLAccount.id,
        debitAmount: amountDecimal,
        creditAccountId: cashAccount.id,
        creditAmount: amountDecimal,
        category: 'dividend',
      },
    });

    // Update account balance
    await this.prisma.account.update({
      where: { id: cashAccount.id },
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
   * Record Interest Payout with double-entry bookkeeping
   * Uses TransactionType=expense and category="Interest Payout" because
   * TransactionType enum does not include a dedicated "interest" value.
   */
  async createInterestPayout(data: {
    date: string;
    memberId?: number;
    memberName?: string;
    amount: number;
    accountId?: number;
    paymentMethod: 'cash' | 'bank' | 'mpesa' | 'check_off' | 'bank_deposit' | 'other';
    reference?: string;
    notes?: string;
  }) {
    const { date, memberId, memberName, amount, accountId, paymentMethod, reference, notes } = data;

    if (!amount || amount <= 0) {
      throw new BadRequestException('Valid amount is required');
    }

    const parsedDate = new Date(date || new Date());
    const amountDecimal = new Prisma.Decimal(amount);

    let member = null as null | { id: number; name: string; balance: number };
    if (memberId) {
      member = await this.prisma.member.findUnique({
        where: { id: memberId },
        select: { id: true, name: true, balance: true },
      });

      if (!member) {
        throw new NotFoundException('Member not found');
      }
    }

    if (!accountId) {
      throw new BadRequestException('Account is required');
    }

    const cashAccount = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!cashAccount) {
      throw new NotFoundException('Account not found');
    }

    const effectiveMemberName = member?.name || memberName?.trim() || null;
    const description = effectiveMemberName
      ? `Interest payout to ${effectiveMemberName}`
      : 'Interest payout';

    const withdrawal = await this.prisma.withdrawal.create({
      data: {
        type: 'expense',
        category: 'Interest Payout',
        amount: amountDecimal,
        memberId: member?.id || null,
        memberName: effectiveMemberName,
        description,
        narration: notes || null,
        reference: reference || null,
        method: paymentMethod,
        accountId: cashAccount.id,
        date: parsedDate,
      },
    });

    const interestExpenseAccount = await this.ensureAccountByName(
      'Interest Expense',
      'gl',
      'GL account for member interest payouts',
    );

    await this.prisma.journalEntry.create({
      data: {
        date: parsedDate,
        reference: reference || `INT-${withdrawal.id}`,
        description,
        narration: notes || null,
        debitAccountId: interestExpenseAccount.id,
        debitAmount: amountDecimal,
        creditAccountId: cashAccount.id,
        creditAmount: amountDecimal,
        category: 'interest_payout',
      },
    });

    await this.prisma.account.update({
      where: { id: cashAccount.id },
      data: { balance: { decrement: amountDecimal } },
    });

    if (member) {
      await this.prisma.ledger.create({
        data: {
          memberId: member.id,
          type: 'interest_payout',
          amount: Number(amount),
          description: 'Interest payout',
          reference: reference || null,
          // Interest payout does not alter contribution balance.
          balanceAfter: Number(member.balance),
          date: parsedDate,
        },
      });
    }

    return withdrawal;
  }

  async void(id: number, data?: { reason?: string; actor?: string }) {
    const existingWithdrawal = await this.prisma.withdrawal.findUnique({
      where: { id },
      include: { member: true },
    });

    if (!existingWithdrawal) {
      throw new BadRequestException('Withdrawal not found');
    }

    if (!existingWithdrawal.accountId) {
      throw new BadRequestException('Cannot void withdrawal without an account');
    }

    const reason = data?.reason?.trim() || 'Voided by user';
    const actor = data?.actor?.trim() || 'System';
    const now = new Date();
    const amountDecimal = new Prisma.Decimal(existingWithdrawal.amount || 0);
    const amountNumber = Number(existingWithdrawal.amount || 0);

    // Reverse primary cash/bank movement for the original withdrawal.
    await this.prisma.account.update({
      where: { id: existingWithdrawal.accountId },
      data: { balance: { increment: amountDecimal } },
    });

    // Refunds decreased member contribution balance; voiding should restore it.
    if (existingWithdrawal.type === 'refund' && existingWithdrawal.memberId) {
      const updatedMember = await this.prisma.member.update({
        where: { id: existingWithdrawal.memberId },
        data: { balance: { increment: amountNumber } },
      });

      await this.prisma.ledger.create({
        data: {
          memberId: existingWithdrawal.memberId,
          type: 'refund_void',
          amount: Math.abs(amountNumber),
          description: `Voided refund - ${reason}`,
          reference: existingWithdrawal.reference
            ? `VOID-${existingWithdrawal.reference}`
            : `VOID-WTH-${existingWithdrawal.id}`,
          balanceAfter: Number(updatedMember.balance),
          date: now,
        },
      });
    }

    const defaultReference = this.buildDefaultReference(existingWithdrawal);
    const referenceCandidates = Array.from(
      new Set(
        [
          existingWithdrawal.reference,
          defaultReference,
          `EXP-${existingWithdrawal.id}`,
          `TRF-${existingWithdrawal.id}`,
          `REF-${existingWithdrawal.id}`,
          `DIV-${existingWithdrawal.id}`,
          `INT-${existingWithdrawal.id}`,
        ].filter((value): value is string => Boolean(value && String(value).trim())),
      ),
    );

    const originalJournal = await this.prisma.journalEntry.findFirst({
      where: {
        reference: { in: referenceCandidates },
      },
      orderBy: { id: 'desc' },
    });

    // Transfers also moved funds into a destination account (debit side).
    // Reverse that destination-side increment when the original journal is resolvable.
    if (existingWithdrawal.type === 'transfer') {
      if (!originalJournal?.debitAccountId) {
        throw new BadRequestException('Unable to void transfer: original journal entry not found');
      }

      if (originalJournal.debitAccountId !== existingWithdrawal.accountId) {
        await this.prisma.account.update({
          where: { id: originalJournal.debitAccountId },
          data: { balance: { decrement: amountDecimal } },
        });
      }
    }

    if (originalJournal?.debitAccountId) {
      const reverseDebitAccountId = originalJournal.creditAccountId || existingWithdrawal.accountId;
      const reverseCreditAccountId = originalJournal.debitAccountId;

      await this.prisma.journalEntry.create({
        data: {
          date: now,
          reference: existingWithdrawal.reference
            ? `VOID-${existingWithdrawal.reference}`
            : `VOID-WTH-${existingWithdrawal.id}`,
          description: `Void withdrawal #${existingWithdrawal.id} - ${reason}`,
          narration: `Voided by ${actor}`,
          debitAccountId: reverseDebitAccountId,
          debitAmount: amountDecimal,
          creditAccountId: reverseCreditAccountId,
          creditAmount: amountDecimal,
          category: 'withdrawal_void',
        },
      });
    }

    await this.prisma.withdrawal.delete({ where: { id } });

    return {
      success: true,
      id,
      message: 'Withdrawal voided successfully',
    };
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
    const records = await this.prisma.withdrawal.findMany({
      take,
      skip,
      orderBy: { date: 'desc' },
      include: { 
        member: true,
        account: true,
      },
    });

    return this.applyCanonicalMemberNames(records);
  }

  async findOne(id: number) {
    const record = await this.prisma.withdrawal.findUnique({
      where: { id },
      include: { 
        member: true,
        account: true,
      },
    });

    return this.applyCanonicalMemberName(record);
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
    const records = await this.prisma.withdrawal.findMany({
      where: { memberId },
      orderBy: { date: 'desc' },
      include: { member: true, account: true },
    });

    return this.applyCanonicalMemberNames(records);
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
