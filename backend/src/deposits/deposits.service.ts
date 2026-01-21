import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

export interface BulkPaymentRecord {
  date: string;
  memberName: string;
  memberId?: number;
  amount: number;
  paymentType: 'contribution' | 'fine' | 'loan_repayment' | 'income' | 'miscellaneous';
  contributionType?: string; // For custom contribution types
  paymentMethod: 'cash' | 'bank' | 'mpesa' | 'check_off' | 'bank_deposit' | 'other';
  accountId?: number;
  reference?: string;
  notes?: string;
}

export interface BulkImportResult {
  successful: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
  createdIds: number[];
}

@Injectable()
export class DepositsService {
  constructor(private prisma: PrismaService) {}

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
        : await this.ensureAccountByName('Cashbox', 'cash', 'Default cash account');

      const memberDepositAccount = await this.ensureAccountByName(
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

      // Update member balance and personal ledger for statement view
      if (depositData.memberId) {
        const updatedMember = await this.prisma.member.update({
          where: { id: depositData.memberId },
          data: { balance: { increment: depositData.amount } },
        });

        await this.prisma.ledger.create({
          data: {
            memberId: depositData.memberId,
            type: depositData.type || 'Deposit',
            amount: depositData.amount,
            description: depositData.description || depositData.narration || depositData.category || 'Deposit',
            reference: depositData.reference,
            balanceAfter: updatedMember.balance,
            date: depositData.date,
          },
        });
      }

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

  /**
   * Process bulk payments with double-entry bookkeeping
   * Handles contributions, fines, loan repayments, income, miscellaneous
   */
  async processBulkPayments(payments: BulkPaymentRecord[]): Promise<BulkImportResult> {
    const result: BulkImportResult = {
      successful: 0,
      failed: 0,
      errors: [],
      createdIds: [],
    };

    for (let i = 0; i < payments.length; i++) {
      try {
        const payment = payments[i];
        const depositId = await this.processPayment(payment);
        result.createdIds.push(depositId);
        result.successful++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          row: i + 2, // +2 because row 1 is headers, 0-indexed array
          message: error.message || 'Unknown error processing payment',
        });
      }
    }

    return result;
  }

  /**
   * Process a single payment with full double-entry bookkeeping
   */
  private async processPayment(payment: BulkPaymentRecord): Promise<number> {
    // Resolve member
    let memberId = payment.memberId;
    if (!memberId && payment.memberName) {
      const member = await this.prisma.member.findFirst({
        where: {
          OR: [
            { name: { contains: payment.memberName, mode: 'insensitive' } },
            { phone: payment.memberName },
          ],
        },
      });
      if (!member) {
        throw new BadRequestException(`Member '${payment.memberName}' not found`);
      }
      memberId = member.id;
    }

    // Validate required fields
    if (!payment.amount || payment.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }
    if (!payment.date) {
      throw new BadRequestException('Date is required');
    }

    const amountDecimal = new Prisma.Decimal(payment.amount);
    const paymentDate = new Date(payment.date);

    // Determine deposit type and related accounts
    const depositType = payment.paymentType;
    const description = this.getPaymentDescription(payment);

    // Create the deposit record
    const deposit = await this.prisma.deposit.create({
      data: {
        memberId: memberId || null,
        memberName: payment.memberName || null,
        type: depositType as any,
        category: payment.contributionType || payment.paymentType,
        amount: amountDecimal,
        method: payment.paymentMethod as any,
        accountId: payment.accountId || null,
        reference: payment.reference || null,
        notes: payment.notes || null,
        date: paymentDate,
        description: description,
        narration: payment.notes || null,
      },
    });

    // Ensure accounts and post double-entry
    await this.postDoubleEntryBookkeeping(
      deposit.id,
      depositType,
      memberId,
      amountDecimal,
      paymentDate,
      description,
      payment.accountId,
      payment.reference,
      payment.notes,
    );

    return deposit.id;
  }

  /**
   * Post double-entry bookkeeping transactions and update ledgers
   */
  private async postDoubleEntryBookkeeping(
    depositId: number,
    depositType: string,
    memberId: number | null,
    amount: Prisma.Decimal,
    date: Date,
    description: string,
    accountId?: number,
    reference?: string,
    notes?: string,
  ) {
    let debitAccountId: number;
    let creditAccountId: number;
    let debitDescription: string;
    let creditDescription: string;

    // Determine accounts based on payment type
    switch (depositType) {
      case 'contribution': {
        // DR: Cash/Bank Account | CR: Member Contribution Equity
        const cashAccount = accountId
          ? await this.ensureAccount(accountId)
          : await this.ensureAccount(null, 'cash', 'Default Cash Account');

        const memberContributionAccount = await this.ensureAccountByName(
          'Member Contributions Received',
          'cash',
          'Running balance of member contributions',
        );

        debitAccountId = cashAccount.id;
        creditAccountId = memberContributionAccount.id;
        debitDescription = `Contribution received - ${description}`;
        creditDescription = `Member contribution equity`;
        break;
      }

      case 'fine': {
        // DR: Cash | CR: Fines Received (Income)
        const cashAccount = accountId
          ? await this.ensureAccount(accountId)
          : await this.ensureAccount(null, 'cash', 'Default Cash Account');

        const finesAccount = await this.ensureAccountByName(
          'Fines & Penalties',
          'cash',
          'Fines and penalties received',
        );

        debitAccountId = cashAccount.id;
        creditAccountId = finesAccount.id;
        debitDescription = `Fine payment received`;
        creditDescription = `Fines income`;
        break;
      }

      case 'loan_repayment': {
        // DR: Cash | CR: Loans Receivable (Asset reduction)
        const cashAccount = accountId
          ? await this.ensureAccount(accountId)
          : await this.ensureAccount(null, 'cash', 'Default Cash Account');

        const loansReceivableAccount = await this.ensureAccountByName(
          'Loans Receivable',
          'cash',
          'Outstanding member loans',
        );

        debitAccountId = cashAccount.id;
        creditAccountId = loansReceivableAccount.id;
        debitDescription = `Loan repayment received`;
        creditDescription = `Loans receivable reduced`;
        break;
      }

      case 'income': {
        // DR: Cash | CR: Income Account
        const cashAccount = accountId
          ? await this.ensureAccount(accountId)
          : await this.ensureAccount(null, 'cash', 'Default Cash Account');

        const incomeAccount = await this.ensureAccountByName(
          'Other Income',
          'cash',
          'Miscellaneous income',
        );

        debitAccountId = cashAccount.id;
        creditAccountId = incomeAccount.id;
        debitDescription = `Income received`;
        creditDescription = `Income recorded`;
        break;
      }

      case 'miscellaneous':
      default: {
        // DR: Cash | CR: Miscellaneous (Could be various)
        const cashAccount = accountId
          ? await this.ensureAccount(accountId)
          : await this.ensureAccount(null, 'cash', 'Default Cash Account');

        const miscAccount = await this.ensureAccountByName(
          'Miscellaneous Receipts',
          'cash',
          'Other receipts',
        );

        debitAccountId = cashAccount.id;
        creditAccountId = miscAccount.id;
        debitDescription = `Payment received`;
        creditDescription = `Miscellaneous receipt`;
        break;
      }
    }

    // Record journal entry
    await this.prisma.journalEntry.create({
      data: {
        date,
        reference: reference || null,
        description: debitDescription,
        narration: notes || null,
        debitAccountId,
        debitAmount: amount,
        creditAccountId,
        creditAmount: amount,
        category: depositType,
      },
    });

    // Update account balances
    await this.prisma.account.update({
      where: { id: debitAccountId },
      data: { balance: { increment: amount } },
    });

    await this.prisma.account.update({
      where: { id: creditAccountId },
      data: { balance: { increment: amount } },
    });

    // Update category ledger if applicable
    if (depositType === 'contribution') {
      await this.updateCategoryLedger(
        'income',
        'Contributions',
        amount,
        depositId,
        'deposit',
        description,
      );
    } else if (depositType === 'fine') {
      await this.updateCategoryLedger('income', 'Fines', amount, depositId, 'deposit', description);
    } else if (depositType === 'income') {
      await this.updateCategoryLedger(
        'income',
        'Other Income',
        amount,
        depositId,
        'deposit',
        description,
      );
    }

    // Update member balance and ledger
    if (memberId) {
      const member = await this.prisma.member.update({
        where: { id: memberId },
        data: { balance: { increment: Number(amount) } },
      });

      await this.prisma.ledger.create({
        data: {
          memberId,
          type: depositType,
          amount: Number(amount),
          description: description,
          reference: reference || null,
          balanceAfter: Number(member.balance),
          date,
        },
      });
    }
  }

  /**
   * Update category ledger with transaction entry
   */
  private async updateCategoryLedger(
    categoryType: string,
    categoryName: string,
    amount: Prisma.Decimal,
    sourceId: number,
    sourceType: string,
    description: string,
  ) {
    try {
      // Find or create category ledger
      let categoryLedger = await this.prisma.categoryLedger.findUnique({
        where: { categoryName },
      });

      if (!categoryLedger) {
        categoryLedger = await this.prisma.categoryLedger.create({
          data: {
            categoryType,
            categoryName,
            totalAmount: amount,
            balance: amount,
          },
        });
      } else {
        // Update totals
        categoryLedger = await this.prisma.categoryLedger.update({
          where: { id: categoryLedger.id },
          data: {
            totalAmount: { increment: amount },
            balance: { increment: amount },
          },
        });
      }

      // Create entry in category ledger
      await this.prisma.categoryLedgerEntry.create({
        data: {
          categoryLedgerId: categoryLedger.id,
          type: 'credit',
          amount,
          description,
          sourceType,
          sourceId: sourceId.toString(),
          balanceAfter: categoryLedger.balance,
          narration: description,
        },
      });
    } catch (error) {
      console.warn('Category ledger update failed:', error.message);
      // Non-critical, continue processing
    }
  }

  /**
   * Helper: ensure account by ID or return default
   */
  private async ensureAccount(
    id?: number,
    type: string = 'cash',
    description?: string,
  ): Promise<{ id: number; name: string }> {
    if (id) {
      const existing = await this.prisma.account.findUnique({ where: { id } });
      if (existing) return existing;
    }

    const defaultName = type === 'cash' ? 'Cashbox' : 'Default Account';
    const existing = await this.prisma.account.findFirst({ where: { name: defaultName } });
    if (existing) return existing;

    return this.prisma.account.create({
      data: {
        name: defaultName,
        type: type as any,
        description: description ?? null,
        currency: 'KES',
        balance: new Prisma.Decimal(0),
      },
    });
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
   * Generate payment description based on type and data
   */
  private getPaymentDescription(payment: BulkPaymentRecord): string {
    switch (payment.paymentType) {
      case 'contribution':
        return `Contribution - ${payment.contributionType || 'Regular'}`;
      case 'fine':
        return 'Fine payment';
      case 'loan_repayment':
        return 'Loan repayment';
      case 'income':
        return 'Income recorded';
      case 'miscellaneous':
        return 'Miscellaneous payment';
      default:
        return 'Payment';
    }
  }
}
