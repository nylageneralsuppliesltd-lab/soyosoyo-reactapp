import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { randomUUID } from 'crypto';

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
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  private generateReference(prefix: string) {
    return `${prefix}-${randomUUID()}`;
  }

  private async assertReferenceUnique(reference?: string | null, excludeId?: number) {
    if (!reference) return;
    const existing = await this.prisma.withdrawal.findFirst({
      where: {
        reference,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('Reference already exists for another withdrawal.');
    }
  }

  private toAuditSnapshot(withdrawal: any) {
    return {
      id: withdrawal.id,
      memberId: withdrawal.memberId,
      memberName: withdrawal.memberName,
      amount: Number(withdrawal.amount),
      method: withdrawal.method,
      reference: withdrawal.reference,
      date: withdrawal.date ? new Date(withdrawal.date).toISOString() : null,
      notes: withdrawal.notes,
      type: withdrawal.type,
      category: withdrawal.category,
      description: withdrawal.description,
      narration: withdrawal.narration,
      accountId: withdrawal.accountId,
    };
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
      const effectiveReference = reference?.trim() || this.generateReference('EXP');
      await this.assertReferenceUnique(effectiveReference);

      const withdrawal = await this.prisma.withdrawal.create({
        data: {
          type: 'expense',
          category,
          amount: amountDecimal,
          description: description || `Expense - ${category}`,
          narration: notes || null,
          reference: effectiveReference,
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
    const narrationParts = [
      `WithdrawalId:${withdrawal.id}`,
      `Category:${category}`,
      `AccountId:${cashAccount.id}`,
      `SourceRef:${effectiveReference ?? 'n/a'}`,
    ];
    const narration = notes
      ? `${notes} | ${narrationParts.join(' | ')}`
      : narrationParts.join(' | ');

    await this.prisma.journalEntry.create({
      data: {
        date: parsedDate,
        reference: effectiveReference,
        description: `Expense - ${category} (withdrawalId:${withdrawal.id})`,
        narration,
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

    const effectiveReference = reference?.trim() || this.generateReference('TRF');
    await this.assertReferenceUnique(effectiveReference);

    // Create withdrawal record for tracking
    const withdrawal = await this.prisma.withdrawal.create({
      data: {
        type: 'transfer',
        category: 'Account Transfer',
        amount: amountDecimal,
        description: description || `Transfer from ${fromAccount.name} to ${toAccount.name}`,
        narration: notes || null,
        reference: effectiveReference,
        method: 'bank',
        accountId: fromAccountId,
        date: parsedDate,
      },
    });

    // Double-entry: DR To Account, CR From Account
    const narrationParts = [
      `TransferId:${withdrawal.id}`,
      `FromAccount:${fromAccountId}`,
      `ToAccount:${toAccountId}`,
      `SourceRef:${effectiveReference ?? 'n/a'}`,
    ];
    const narration = notes
      ? `${notes} | ${narrationParts.join(' | ')}`
      : narrationParts.join(' | ');

    await this.prisma.journalEntry.create({
      data: {
        date: parsedDate,
        reference: effectiveReference,
        description: `Transfer: ${fromAccount.name} → ${toAccount.name} (transferId:${withdrawal.id})`,
        narration,
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

    if (!accountId) {
      throw new BadRequestException('Account is required');
    }

    // Get accounts
    const cashAccount = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!cashAccount) {
      throw new NotFoundException('Account not found');
    }

    const effectiveReference = reference?.trim() || this.generateReference('REF');
    await this.assertReferenceUnique(effectiveReference);

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
        reference: effectiveReference,
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
    const narrationParts = [
      `RefundId:${withdrawal.id}`,
      `MemberId:${memberId}`,
      `ContributionType:${contributionType}`,
      `AccountId:${cashAccount.id}`,
      `SourceRef:${effectiveReference ?? 'n/a'}`,
    ];
    const narration = notes
      ? `${notes} | ${narrationParts.join(' | ')}`
      : narrationParts.join(' | ');

    await this.prisma.journalEntry.create({
      data: {
        date: parsedDate,
        reference: effectiveReference,
        description: `Refund to ${member.name} - ${contributionType} (refundId:${withdrawal.id})`,
        narration,
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
        reference: effectiveReference,
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

    if (!accountId) {
      throw new BadRequestException('Account is required');
    }

    // Get accounts
    const cashAccount = await this.prisma.account.findUnique({ where: { id: accountId } });

    if (!cashAccount) {
      throw new NotFoundException('Account not found');
    }

    const effectiveReference = reference?.trim() || this.generateReference('DIV');
    await this.assertReferenceUnique(effectiveReference);

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
        reference: effectiveReference,
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
    const narrationParts = [
      `DividendId:${withdrawal.id}`,
      `MemberId:${memberId}`,
      `AccountId:${cashAccount.id}`,
      `SourceRef:${effectiveReference ?? 'n/a'}`,
    ];
    const narration = notes
      ? `${notes} | ${narrationParts.join(' | ')}`
      : narrationParts.join(' | ');

    await this.prisma.journalEntry.create({
      data: {
        date: parsedDate,
        reference: effectiveReference,
        description: `Dividend payout to ${member.name} (dividendId:${withdrawal.id})`,
        narration,
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
        reference: effectiveReference,
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
    prismaClient: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    try {
      let categoryLedger = await prismaClient.categoryLedger.findFirst({
        where: {
          OR: [
            { expenseCategoryId: categoryType === 'expense' ? categoryId : undefined },
            { incomeCategoryId: categoryType === 'income' ? categoryId : undefined },
          ],
        },
      });

      if (!categoryLedger) {
        categoryLedger = await prismaClient.categoryLedger.create({
          data: {
            categoryType,
            categoryName,
            expenseCategoryId: categoryType === 'expense' ? categoryId : null,
            incomeCategoryId: categoryType === 'income' ? categoryId : null,
          },
        });
      }

      const newBalance = Number(categoryLedger.balance) + amount;

      await prismaClient.categoryLedger.update({
        where: { id: categoryLedger.id },
        data: { 
          balance: newBalance,
          totalAmount: { increment: amount },
        },
      });

      await prismaClient.categoryLedgerEntry.create({
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

  private async reverseCategoryLedger(
    categoryName: string,
    amount: number,
    transactionId: number,
    prismaClient: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    try {
      const expenseCategory = await prismaClient.expenseCategory.findFirst({
        where: { name: categoryName },
      });

      if (!expenseCategory) return;

      const categoryLedger = await prismaClient.categoryLedger.findFirst({
        where: { expenseCategoryId: expenseCategory.id },
      });

      if (!categoryLedger) return;

      const newBalance = Number(categoryLedger.balance) - amount;

      await prismaClient.categoryLedger.update({
        where: { id: categoryLedger.id },
        data: {
          balance: newBalance,
          totalAmount: { decrement: amount },
        },
      });

      await prismaClient.categoryLedgerEntry.create({
        data: {
          categoryLedgerId: categoryLedger.id,
          type: 'credit',
          amount,
          balanceAfter: newBalance,
          description: `Reversal - ${categoryName}`,
          sourceType: 'withdrawal',
          sourceId: transactionId.toString(),
        },
      });
    } catch (error) {
      console.warn('Category ledger reversal failed:', error.message);
    }
  }

  private async findWithdrawalJournalEntries(
    withdrawal: any,
    prismaClient: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const referenceFilter = withdrawal.reference ? { reference: withdrawal.reference } : undefined;
    const tags = [
      `WithdrawalId:${withdrawal.id}`,
      `TransferId:${withdrawal.id}`,
      `RefundId:${withdrawal.id}`,
      `DividendId:${withdrawal.id}`,
    ];

    return prismaClient.journalEntry.findMany({
      where: {
        OR: [
          referenceFilter,
          ...tags.map((tag) => ({ narration: { contains: tag } })),
        ].filter(Boolean) as any,
      },
    });
  }

  private async deleteWithdrawalLedgerEntries(
    memberId: number | null,
    reference: string | null,
    date: Date,
    prismaClient: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (!memberId) return;

    await prismaClient.ledger.deleteMany({
      where: {
        memberId,
        OR: [
          { reference: reference || undefined },
          { date },
        ],
      },
    });
  }

  async findAll(take = 100, skip = 0) {
    // Fetch withdrawals (expenses, transfers, refunds, dividends)
    const withdrawals = await this.prisma.withdrawal.findMany({
      orderBy: { date: 'desc' },
      include: { 
        member: true,
        account: true,
      },
    });

    // Fetch active/disbursed loans (loan disbursements = money out)
    const loans = await this.prisma.loan.findMany({
      where: {
        status: { in: ['active', 'closed'] },
        disbursementDate: { not: null },
      },
      orderBy: { disbursementDate: 'desc' },
      include: { 
        member: true,
        loanType: true,
      },
    });

    // Transform withdrawals to common format
    const withdrawalEntries = withdrawals.map(w => ({
      ...w,
      transactionType: 'withdrawal',
      source: 'withdrawal',
      recordedAt: w.createdAt || w.date,
      isSystemGenerated: false,
    }));

    // Transform loans to common format (as withdrawal entries)
    const loanEntries = loans.map(l => ({
      id: l.id,
      memberId: l.memberId,
      memberName: l.memberName || l.member?.name || l.externalName || l.bankName || 'Unknown',
      member: l.member,
      amount: l.amount,
      method: 'bank_transfer',
      reference: `LOAN-${l.id}`,
      date: l.disbursementDate,
      notes: l.notes || `Loan disbursed - ${l.loanType?.name || 'Loan'}`,
      type: 'loan_disbursement',
      category: 'Loan Disbursement',
      purpose: l.purpose,
      description: `Loan disbursement - ${l.loanType?.name || 'Loan'}`,
      transactionType: 'withdrawal',
      source: 'loan',
      recordedAt: l.createdAt || l.disbursementDate,
      isSystemGenerated: false,
      loanId: l.id,
      loanType: l.loanType,
      loanStatus: l.status,
      loanDirection: l.loanDirection,
      balance: l.balance,
      interestRate: l.interestRate,
      periodMonths: l.periodMonths,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }));

    // Combine and sort by date (descending)
    const allEntries = [...withdrawalEntries, ...loanEntries].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });

    // Apply pagination
    const paginatedEntries = allEntries.slice(skip, skip + take);

    return {
      data: paginatedEntries,
      total: allEntries.length,
      withdrawals: withdrawalEntries.length,
      loans: loanEntries.length,
    };
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
    const { updatedWithdrawal, beforeSnapshot } = await this.prisma.$transaction(async (tx) => {
      const existingWithdrawal = await tx.withdrawal.findUnique({
        where: { id },
        include: { member: true, account: true },
      });

      if (!existingWithdrawal) {
        throw new NotFoundException('Withdrawal not found');
      }

      if (existingWithdrawal.isVoided) {
        throw new BadRequestException('Voided withdrawals cannot be edited');
      }

      const beforeSnapshot = this.toAuditSnapshot(existingWithdrawal);
      const journalEntries = await this.findWithdrawalJournalEntries(existingWithdrawal, tx);
      const oldAmount = Number(existingWithdrawal.amount);
      const oldReference = existingWithdrawal.reference || null;
      const oldDate = existingWithdrawal.date;

      if (existingWithdrawal.type === 'expense') {
        const cashAccountId = journalEntries[0]?.creditAccountId || existingWithdrawal.accountId;
        if (cashAccountId) {
          await tx.account.update({
            where: { id: cashAccountId },
            data: { balance: { increment: oldAmount } },
          });
        }
        await this.reverseCategoryLedger(existingWithdrawal.category, oldAmount, existingWithdrawal.id, tx);
      }

      if (existingWithdrawal.type === 'transfer') {
        const fromAccountId = journalEntries[0]?.creditAccountId || existingWithdrawal.accountId;
        const toAccountId = journalEntries[0]?.debitAccountId || null;
        if (fromAccountId) {
          await tx.account.update({
            where: { id: fromAccountId },
            data: { balance: { increment: oldAmount } },
          });
        }
        if (toAccountId) {
          await tx.account.update({
            where: { id: toAccountId },
            data: { balance: { decrement: oldAmount } },
          });
        }
      }

      if (existingWithdrawal.type === 'refund') {
        const cashAccountId = journalEntries[0]?.creditAccountId || existingWithdrawal.accountId;
        if (cashAccountId) {
          await tx.account.update({
            where: { id: cashAccountId },
            data: { balance: { increment: oldAmount } },
          });
        }
        if (existingWithdrawal.memberId) {
          await tx.member.update({
            where: { id: existingWithdrawal.memberId },
            data: { balance: { increment: oldAmount } },
          });
        }
        await this.deleteWithdrawalLedgerEntries(
          existingWithdrawal.memberId,
          oldReference,
          oldDate,
          tx,
        );
      }

      if (existingWithdrawal.type === 'dividend') {
        const cashAccountId = journalEntries[0]?.creditAccountId || existingWithdrawal.accountId;
        if (cashAccountId) {
          await tx.account.update({
            where: { id: cashAccountId },
            data: { balance: { increment: oldAmount } },
          });
        }
        await this.deleteWithdrawalLedgerEntries(
          existingWithdrawal.memberId,
          oldReference,
          oldDate,
          tx,
        );
      }

      if (journalEntries.length > 0) {
        await tx.journalEntry.deleteMany({
          where: { id: { in: journalEntries.map((entry) => entry.id) } },
        });
      } else {
        await tx.journalEntry.deleteMany({
          where: {
            OR: [
              { reference: existingWithdrawal.reference || undefined },
              { narration: { contains: `WithdrawalId:${existingWithdrawal.id}` } },
              { narration: { contains: `TransferId:${existingWithdrawal.id}` } },
              { narration: { contains: `RefundId:${existingWithdrawal.id}` } },
              { narration: { contains: `DividendId:${existingWithdrawal.id}` } },
            ],
          },
        });
      }

      const newAmount = data.amount !== undefined ? Number(data.amount) : oldAmount;
      const newDate = data.date ? new Date(data.date) : existingWithdrawal.date;
      const newReference = data.reference?.trim() || existingWithdrawal.reference || null;
      await this.assertReferenceUnique(newReference, existingWithdrawal.id);
      const newNotes = data.notes ?? existingWithdrawal.notes ?? null;
      const newDescription = data.description?.trim() || existingWithdrawal.description;
      const newNarration = data.narration?.trim() || existingWithdrawal.narration;
      const newCategory = data.category?.trim() || existingWithdrawal.category;
      const newAccountId = data.accountId ?? existingWithdrawal.accountId;
      const newMemberId = data.memberId ?? existingWithdrawal.memberId;
      const newMemberName = data.memberName ?? existingWithdrawal.memberName;
      const newMethod = data.method ?? existingWithdrawal.method;
      const toAccountId = data.toAccountId ?? journalEntries[0]?.debitAccountId ?? null;

      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id },
        data: {
          amount: newAmount,
          date: newDate,
          reference: newReference,
          notes: newNotes,
          description: newDescription,
          narration: newNarration,
          category: newCategory,
          accountId: newAccountId,
          memberId: newMemberId,
          memberName: newMemberName,
          method: newMethod,
        },
        include: { member: true, account: true },
      });

      if (existingWithdrawal.type === 'expense') {
        if (!newAccountId) {
          throw new BadRequestException('Account is required');
        }

        let expenseCategory = await tx.expenseCategory.findFirst({
          where: { name: newCategory },
        });

        if (!expenseCategory) {
          expenseCategory = await tx.expenseCategory.create({
            data: { name: newCategory },
          });
        }

        const cashAccount = await tx.account.findUnique({ where: { id: newAccountId } });
        if (!cashAccount) {
          throw new NotFoundException('Account not found');
        }

        const expenseGLAccountName = `${newCategory} Expense`;
        let expenseGLAccount = await tx.account.findFirst({
          where: { name: expenseGLAccountName },
        });

        if (!expenseGLAccount) {
          expenseGLAccount = await tx.account.create({
            data: {
              name: expenseGLAccountName,
              type: 'gl',
              description: `GL account for ${newCategory} expense`,
              currency: 'KES',
              balance: new Prisma.Decimal(0),
            },
          });
        }

        const narrationParts = [
          `WithdrawalId:${updatedWithdrawal.id}`,
          `Category:${newCategory}`,
          `AccountId:${cashAccount.id}`,
          `SourceRef:${newReference ?? 'n/a'}`,
        ];
        const journalNarration = newNotes
          ? `${newNotes} | ${narrationParts.join(' | ')}`
          : narrationParts.join(' | ');

        await tx.journalEntry.create({
          data: {
            date: newDate,
            reference: newReference,
            description: `Expense - ${newCategory} (withdrawalId:${updatedWithdrawal.id})`,
            narration: journalNarration,
            debitAccountId: expenseGLAccount.id,
            debitAmount: new Prisma.Decimal(newAmount),
            creditAccountId: cashAccount.id,
            creditAmount: new Prisma.Decimal(newAmount),
            category: 'expense',
          },
        });

        await tx.account.update({
          where: { id: cashAccount.id },
          data: { balance: { decrement: newAmount } },
        });

        await this.updateCategoryLedger(
          expenseCategory.id,
          'expense',
          newCategory,
          Number(newAmount),
          updatedWithdrawal.id,
          'withdrawal',
          newDescription || `Expense - ${newCategory}`,
          tx,
        );
      }

      if (existingWithdrawal.type === 'transfer') {
        if (!newAccountId || !toAccountId) {
          throw new BadRequestException('Both from and to accounts are required');
        }

        if (newAccountId === toAccountId) {
          throw new BadRequestException('Cannot transfer to the same account');
        }

        const fromAccount = await tx.account.findUnique({ where: { id: newAccountId } });
        const toAccount = await tx.account.findUnique({ where: { id: toAccountId } });

        if (!fromAccount || !toAccount) {
          throw new NotFoundException('One or both accounts not found');
        }

        const narrationParts = [
          `TransferId:${updatedWithdrawal.id}`,
          `FromAccount:${newAccountId}`,
          `ToAccount:${toAccountId}`,
          `SourceRef:${newReference ?? 'n/a'}`,
        ];
        const journalNarration = newNotes
          ? `${newNotes} | ${narrationParts.join(' | ')}`
          : narrationParts.join(' | ');

        await tx.journalEntry.create({
          data: {
            date: newDate,
            reference: newReference,
            description: `Transfer: ${fromAccount.name} → ${toAccount.name} (transferId:${updatedWithdrawal.id})`,
            narration: journalNarration,
            debitAccountId: toAccountId,
            debitAmount: new Prisma.Decimal(newAmount),
            creditAccountId: newAccountId,
            creditAmount: new Prisma.Decimal(newAmount),
            category: 'transfer',
          },
        });

        await tx.account.update({
          where: { id: newAccountId },
          data: { balance: { decrement: newAmount } },
        });

        await tx.account.update({
          where: { id: toAccountId },
          data: { balance: { increment: newAmount } },
        });
      }

      if (existingWithdrawal.type === 'refund') {
        if (!newAccountId) {
          throw new BadRequestException('Account is required');
        }

        if (!newMemberId) {
          throw new BadRequestException('Member is required');
        }

        const cashAccount = await tx.account.findUnique({ where: { id: newAccountId } });
        if (!cashAccount) {
          throw new NotFoundException('Account not found');
        }

        const contributionType = data.contributionType
          ? String(data.contributionType).trim()
          : newCategory?.startsWith('Refund - ')
            ? newCategory.replace('Refund - ', '')
            : 'Contributions';

        const contributionGLName = contributionType
          ? `${contributionType} Received`
          : 'Contributions Received';

        let contributionGLAccount = await tx.account.findFirst({
          where: { name: contributionGLName },
        });

        if (!contributionGLAccount) {
          contributionGLAccount = await tx.account.create({
            data: {
              name: contributionGLName,
              type: 'gl',
              description: `GL account for ${contributionType || 'Contributions'} liability`,
              currency: 'KES',
              balance: new Prisma.Decimal(0),
            },
          });
        }

        const narrationParts = [
          `RefundId:${updatedWithdrawal.id}`,
          `MemberId:${newMemberId}`,
          `ContributionType:${contributionType}`,
          `AccountId:${cashAccount.id}`,
          `SourceRef:${newReference ?? 'n/a'}`,
        ];
        const journalNarration = newNotes
          ? `${newNotes} | ${narrationParts.join(' | ')}`
          : narrationParts.join(' | ');

        await tx.journalEntry.create({
          data: {
            date: newDate,
            reference: newReference,
            description: `Refund to ${newMemberName || 'Member'} - ${contributionType} (refundId:${updatedWithdrawal.id})`,
            narration: journalNarration,
            debitAccountId: contributionGLAccount.id,
            debitAmount: new Prisma.Decimal(newAmount),
            creditAccountId: cashAccount.id,
            creditAmount: new Prisma.Decimal(newAmount),
            category: 'refund',
          },
        });

        await tx.account.update({
          where: { id: cashAccount.id },
          data: { balance: { decrement: newAmount } },
        });

        const updatedMember = await tx.member.update({
          where: { id: newMemberId },
          data: { balance: { decrement: Number(newAmount) } },
        });

        await tx.ledger.create({
          data: {
            memberId: newMemberId,
            type: 'refund',
            amount: Number(newAmount),
            description: `Refund - ${contributionType}`,
            reference: newReference,
            balanceAfter: Number(updatedMember.balance),
            date: newDate,
          },
        });
      }

      if (existingWithdrawal.type === 'dividend') {
        if (!newAccountId) {
          throw new BadRequestException('Account is required');
        }

        if (!newMemberId) {
          throw new BadRequestException('Member is required');
        }

        const cashAccount = await tx.account.findUnique({ where: { id: newAccountId } });
        if (!cashAccount) {
          throw new NotFoundException('Account not found');
        }

        let dividendGLAccount = await tx.account.findFirst({
          where: { name: 'Dividends Payable' },
        });

        if (!dividendGLAccount) {
          dividendGLAccount = await tx.account.create({
            data: {
              name: 'Dividends Payable',
              type: 'gl',
              description: 'GL account for dividends payable',
              currency: 'KES',
              balance: new Prisma.Decimal(0),
            },
          });
        }

        const narrationParts = [
          `DividendId:${updatedWithdrawal.id}`,
          `MemberId:${newMemberId}`,
          `AccountId:${cashAccount.id}`,
          `SourceRef:${newReference ?? 'n/a'}`,
        ];
        const journalNarration = newNotes
          ? `${newNotes} | ${narrationParts.join(' | ')}`
          : narrationParts.join(' | ');

        await tx.journalEntry.create({
          data: {
            date: newDate,
            reference: newReference,
            description: `Dividend payout to ${newMemberName || 'Member'} (dividendId:${updatedWithdrawal.id})`,
            narration: journalNarration,
            debitAccountId: dividendGLAccount.id,
            debitAmount: new Prisma.Decimal(newAmount),
            creditAccountId: cashAccount.id,
            creditAmount: new Prisma.Decimal(newAmount),
            category: 'dividend',
          },
        });

        await tx.account.update({
          where: { id: cashAccount.id },
          data: { balance: { decrement: newAmount } },
        });

        await tx.ledger.create({
          data: {
            memberId: newMemberId,
            type: 'dividend',
            amount: Number(newAmount),
            description: 'Dividend payout',
            reference: newReference,
            balanceAfter: Number(updatedWithdrawal.member?.balance || 0),
            date: newDate,
          },
        });
      }

      return { updatedWithdrawal, beforeSnapshot };
    });

    const afterSnapshot = this.toAuditSnapshot(updatedWithdrawal);
    await this.auditService.log({
      actor: data?.updatedBy || data?.actor || 'system',
      action: 'withdrawal.update',
      resource: 'withdrawal',
      resourceId: String(id),
      payload: {
        before: beforeSnapshot,
        after: afterSnapshot,
      },
    });

    return updatedWithdrawal;
  }

  async remove(id: number) {
    const { deletedWithdrawal, beforeSnapshot } = await this.prisma.$transaction(async (tx) => {
      const existingWithdrawal = await tx.withdrawal.findUnique({
        where: { id },
        include: { member: true, account: true },
      });

      if (!existingWithdrawal) {
        throw new NotFoundException('Withdrawal not found');
      }

      const beforeSnapshot = this.toAuditSnapshot(existingWithdrawal);
      const journalEntries = await this.findWithdrawalJournalEntries(existingWithdrawal, tx);
      const hasPostedEntries = journalEntries.length > 0;

      if (existingWithdrawal.isVoided) {
        if (existingWithdrawal.memberId) {
          await this.deleteWithdrawalLedgerEntries(
            existingWithdrawal.memberId,
            existingWithdrawal.reference || null,
            existingWithdrawal.date,
            tx,
          );
        }

        await tx.journalEntry.deleteMany({
          where: {
            OR: [
              { reference: existingWithdrawal.reference || undefined },
              { narration: { contains: `WithdrawalId:${existingWithdrawal.id}` } },
              { narration: { contains: `TransferId:${existingWithdrawal.id}` } },
              { narration: { contains: `RefundId:${existingWithdrawal.id}` } },
              { narration: { contains: `DividendId:${existingWithdrawal.id}` } },
              { reference: `VOID-${existingWithdrawal.reference || `WTH-${existingWithdrawal.id}`}` },
            ],
          },
        });
      } else {
        const oldAmount = Number(existingWithdrawal.amount);
        const oldReference = existingWithdrawal.reference || null;
        const oldDate = existingWithdrawal.date;

        if (hasPostedEntries && existingWithdrawal.type === 'expense') {
          const cashAccountId = journalEntries[0]?.creditAccountId || existingWithdrawal.accountId;
          if (cashAccountId) {
            await tx.account.update({
              where: { id: cashAccountId },
              data: { balance: { increment: oldAmount } },
            });
          }
          await this.reverseCategoryLedger(existingWithdrawal.category, oldAmount, existingWithdrawal.id, tx);
        }

        if (hasPostedEntries && existingWithdrawal.type === 'transfer') {
          const fromAccountId = journalEntries[0]?.creditAccountId || existingWithdrawal.accountId;
          const toAccountId = journalEntries[0]?.debitAccountId || null;
          if (fromAccountId) {
            await tx.account.update({
              where: { id: fromAccountId },
              data: { balance: { increment: oldAmount } },
            });
          }
          if (toAccountId) {
            await tx.account.update({
              where: { id: toAccountId },
              data: { balance: { decrement: oldAmount } },
            });
          }
        }

        if (hasPostedEntries && existingWithdrawal.type === 'refund') {
          const cashAccountId = journalEntries[0]?.creditAccountId || existingWithdrawal.accountId;
          if (cashAccountId) {
            await tx.account.update({
              where: { id: cashAccountId },
              data: { balance: { increment: oldAmount } },
            });
          }
          if (existingWithdrawal.memberId) {
            await tx.member.update({
              where: { id: existingWithdrawal.memberId },
              data: { balance: { increment: oldAmount } },
            });
          }
          await this.deleteWithdrawalLedgerEntries(
            existingWithdrawal.memberId,
            oldReference,
            oldDate,
            tx,
          );
        }

        if (hasPostedEntries && existingWithdrawal.type === 'dividend') {
          const cashAccountId = journalEntries[0]?.creditAccountId || existingWithdrawal.accountId;
          if (cashAccountId) {
            await tx.account.update({
              where: { id: cashAccountId },
              data: { balance: { increment: oldAmount } },
            });
          }
          await this.deleteWithdrawalLedgerEntries(
            existingWithdrawal.memberId,
            oldReference,
            oldDate,
            tx,
          );
        }

        if (hasPostedEntries) {
          await tx.journalEntry.deleteMany({
            where: { id: { in: journalEntries.map((entry) => entry.id) } },
          });
        } else {
          await tx.journalEntry.deleteMany({
            where: {
              OR: [
                { reference: existingWithdrawal.reference || undefined },
                { narration: { contains: `WithdrawalId:${existingWithdrawal.id}` } },
                { narration: { contains: `TransferId:${existingWithdrawal.id}` } },
                { narration: { contains: `RefundId:${existingWithdrawal.id}` } },
                { narration: { contains: `DividendId:${existingWithdrawal.id}` } },
              ],
            },
          });
        }
      }

      const deletedWithdrawal = await tx.withdrawal.delete({ where: { id } });

      return { deletedWithdrawal, beforeSnapshot };
    });

    await this.auditService.log({
      actor: 'system',
      action: 'withdrawal.delete',
      resource: 'withdrawal',
      resourceId: String(id),
      payload: {
        before: beforeSnapshot,
      },
    });

    return deletedWithdrawal;
  }

  async void(id: number, data: any) {
    const { updatedWithdrawal, beforeSnapshot } = await this.prisma.$transaction(async (tx) => {
      const existingWithdrawal = await tx.withdrawal.findUnique({
        where: { id },
        include: { member: true, account: true },
      });

      if (!existingWithdrawal) {
        throw new NotFoundException('Withdrawal not found');
      }

      if (existingWithdrawal.isVoided) {
        throw new BadRequestException('Withdrawal is already voided');
      }

      const beforeSnapshot = this.toAuditSnapshot(existingWithdrawal);
      const journalEntries = await this.findWithdrawalJournalEntries(existingWithdrawal, tx);
      const oldAmount = Number(existingWithdrawal.amount);

      if (existingWithdrawal.type === 'expense') {
        const cashAccountId = journalEntries[0]?.creditAccountId || existingWithdrawal.accountId;
        if (cashAccountId) {
          await tx.account.update({
            where: { id: cashAccountId },
            data: { balance: { increment: oldAmount } },
          });
        }
        await this.reverseCategoryLedger(existingWithdrawal.category, oldAmount, existingWithdrawal.id, tx);
      }

      if (existingWithdrawal.type === 'transfer') {
        const fromAccountId = journalEntries[0]?.creditAccountId || existingWithdrawal.accountId;
        const toAccountId = journalEntries[0]?.debitAccountId || null;
        if (fromAccountId) {
          await tx.account.update({
            where: { id: fromAccountId },
            data: { balance: { increment: oldAmount } },
          });
        }
        if (toAccountId) {
          await tx.account.update({
            where: { id: toAccountId },
            data: { balance: { decrement: oldAmount } },
          });
        }
      }

      if (existingWithdrawal.type === 'refund') {
        const cashAccountId = journalEntries[0]?.creditAccountId || existingWithdrawal.accountId;
        if (cashAccountId) {
          await tx.account.update({
            where: { id: cashAccountId },
            data: { balance: { increment: oldAmount } },
          });
        }
        if (existingWithdrawal.memberId) {
          const updatedMember = await tx.member.update({
            where: { id: existingWithdrawal.memberId },
            data: { balance: { increment: oldAmount } },
          });

          await tx.ledger.create({
            data: {
              memberId: existingWithdrawal.memberId,
              type: 'refund_void',
              amount: -oldAmount,
              description: `Void refund ${existingWithdrawal.reference || `REF-${existingWithdrawal.id}`}`,
              reference: existingWithdrawal.reference || `REF-${existingWithdrawal.id}`,
              balanceAfter: Number(updatedMember.balance),
              date: new Date(),
            },
          });
        }
      }

      if (existingWithdrawal.type === 'dividend') {
        const cashAccountId = journalEntries[0]?.creditAccountId || existingWithdrawal.accountId;
        if (cashAccountId) {
          await tx.account.update({
            where: { id: cashAccountId },
            data: { balance: { increment: oldAmount } },
          });
        }
        if (existingWithdrawal.memberId) {
          const member = await tx.member.findUnique({
            where: { id: existingWithdrawal.memberId },
          });

          await tx.ledger.create({
            data: {
              memberId: existingWithdrawal.memberId,
              type: 'dividend_void',
              amount: -oldAmount,
              description: `Void dividend ${existingWithdrawal.reference || `DIV-${existingWithdrawal.id}`}`,
              reference: existingWithdrawal.reference || `DIV-${existingWithdrawal.id}`,
              balanceAfter: Number(member?.balance || 0),
              date: new Date(),
            },
          });
        }
      }

      const voidReference = `VOID-${existingWithdrawal.reference || `WTH-${existingWithdrawal.id}`}`;
      for (const entry of journalEntries) {
        await tx.journalEntry.create({
          data: {
            date: new Date(),
            reference: voidReference,
            description: `Void withdrawal ${existingWithdrawal.reference || `WTH-${existingWithdrawal.id}`}`,
            narration: `VoidOfRef:${entry.reference || 'n/a'} | WithdrawalId:${existingWithdrawal.id}`,
            debitAccountId: entry.creditAccountId,
            debitAmount: entry.creditAmount,
            creditAccountId: entry.debitAccountId,
            creditAmount: entry.debitAmount,
            category: entry.category,
          },
        });
      }

      const updatedWithdrawal = await tx.withdrawal.update({
        where: { id },
        data: {
          isVoided: true,
          voidedAt: new Date(),
          voidedBy: data?.actor || data?.updatedBy || 'system',
          voidReason: data?.reason ? String(data.reason).trim() : null,
        },
      });

      return { updatedWithdrawal, beforeSnapshot };
    });

    await this.auditService.log({
      actor: data?.actor || data?.updatedBy || 'system',
      action: 'withdrawal.void',
      resource: 'withdrawal',
      resourceId: String(id),
      payload: {
        before: beforeSnapshot,
      },
    });

    return updatedWithdrawal;
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
