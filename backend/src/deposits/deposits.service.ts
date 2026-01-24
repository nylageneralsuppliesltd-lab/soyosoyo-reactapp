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

      if (!cashAccount) {
        throw new Error('Cash account not found. Please select an account.');
      }

      // Update only the real account balance
      await this.prisma.account.update({
        where: { id: cashAccount.id },
        data: { balance: { increment: amountDecimal } },
      });

      // Get or create GL account for the contribution type/category
      // This acts as a contra account that tracks what type of deposit it was
      const glAccountName = depositData.category 
        ? `${depositData.category} Received` 
        : `${depositData.type} Received`;
      
      // Use upsert to avoid duplicate account names
      const glAccount = await this.prisma.account.upsert({
        where: { name: glAccountName },
        update: {}, // No updates needed if exists
        create: {
          name: glAccountName,
          type: 'bank', // GL account type
          description: `GL account for ${depositData.category || depositData.type}`,
          currency: 'KES',
          balance: new Prisma.Decimal(0),
        },
      });

      // Record proper double-entry journal entry:
      // Debit: Cash Account (asset increases)
      // Credit: Contribution GL Account (tracks source of deposit)
      await this.prisma.journalEntry.create({
        data: {
          date: depositData.date,
          reference: depositData.reference ?? null,
          description: `Member deposit${depositData.memberName ? ' - ' + depositData.memberName : ''}`,
          narration: depositData.notes ?? null,
          debitAccountId: cashAccount.id,
          debitAmount: amountDecimal,
          creditAccountId: glAccount.id,
          creditAmount: amountDecimal,
          category: depositData.category || 'deposit',
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
    try {
      // Get the existing deposit to calculate differences
      const existingDeposit = await this.prisma.deposit.findUnique({
        where: { id },
        include: { member: true },
      });

      if (!existingDeposit) {
        throw new BadRequestException('Deposit not found');
      }

      // Normalize input data
      const depositData = {
        memberName: data.memberName?.trim() || existingDeposit.memberName,
        memberId: data.memberId ? parseInt(data.memberId) : existingDeposit.memberId,
        amount: data.amount ? parseFloat(data.amount) : Number(existingDeposit.amount),
        method: data.method || existingDeposit.method,
        reference: data.reference?.trim() || existingDeposit.reference,
        date: data.date ? new Date(data.date) : existingDeposit.date,
        notes: data.notes?.trim() || existingDeposit.notes,
        type: data.type || existingDeposit.type,
        category: data.category?.trim() || existingDeposit.category,
        description: data.description?.trim() || existingDeposit.description,
        narration: data.narration?.trim() || existingDeposit.narration,
        accountId: data.accountId ? parseInt(data.accountId) : existingDeposit.accountId,
      };

      // Calculate amount difference
      const amountDifference = Number(depositData.amount) - Number(existingDeposit.amount);

      // Update the deposit record
      const updatedDeposit = await this.prisma.deposit.update({
        where: { id },
        data: depositData,
        include: { member: true },
      });

      // If amount changed, update all related financial records
      if (amountDifference !== 0) {
        // Get the account used for this deposit
        const cashAccount = depositData.accountId
          ? await this.prisma.account.findUnique({ where: { id: depositData.accountId } })
          : await this.prisma.account.findFirst({
              where: { 
                OR: [
                  { name: 'Cashbox' },
                  { type: 'cash' }
                ]
              }
            });

        if (!cashAccount) {
          throw new Error('Cash account not found. Cannot sync journal entries.');
        }

        // Update account balance by the difference
        await this.prisma.account.update({
          where: { id: cashAccount.id },
          data: { balance: { increment: amountDifference } },
        });

        // Find and update corresponding journal entry
        const glAccountName = depositData.category 
          ? `${depositData.category} Received` 
          : `${depositData.type} Received`;
        
        // Use upsert to avoid duplicate account names
        const glAccount = await this.prisma.account.upsert({
          where: { name: glAccountName },
          update: {}, // No updates needed if exists
          create: {
            name: glAccountName,
            type: 'bank', // GL account type
            description: `GL account for ${depositData.category || depositData.type}`,
            currency: 'KES',
            balance: new Prisma.Decimal(0),
          },
        });

        // Delete old journal entry
        await this.prisma.journalEntry.deleteMany({
          where: {
            debitAccountId: cashAccount.id,
            creditAccountId: glAccount.id,
            description: { contains: `Member deposit` },
            OR: [
              { reference: existingDeposit.reference || undefined },
              { date: existingDeposit.date }
            ]
          }
        });

        // Create new journal entry with updated amount
        const newAmount = new Prisma.Decimal(depositData.amount);
        await this.prisma.journalEntry.create({
          data: {
            date: depositData.date,
            reference: depositData.reference ?? null,
            description: `Member deposit${depositData.memberName ? ' - ' + depositData.memberName : ''}`,
            narration: depositData.notes ?? null,
            debitAccountId: cashAccount.id,
            debitAmount: newAmount,
            creditAccountId: glAccount.id,
            creditAmount: newAmount,
            category: depositData.category || 'deposit',
          },
        });

        // Update member balance if applicable
        if (depositData.memberId) {
          await this.prisma.member.update({
            where: { id: depositData.memberId },
            data: { balance: { increment: amountDifference } },
          });

          // Update or create ledger entry
          const newBalance = (existingDeposit.member?.balance || 0) + amountDifference;
          
          // Delete old ledger entry for this deposit
          await this.prisma.ledger.deleteMany({
            where: {
              memberId: depositData.memberId,
              reference: existingDeposit.reference || undefined,
              date: existingDeposit.date
            }
          });

          // Create new ledger entry with updated balance
          await this.prisma.ledger.create({
            data: {
              memberId: depositData.memberId,
              type: depositData.type || 'Deposit',
              amount: Number(depositData.amount),
              description: depositData.description || depositData.narration || depositData.category || 'Deposit',
              reference: depositData.reference,
              balanceAfter: newBalance,
              date: depositData.date,
            },
          });
        }
      }

      return updatedDeposit;
    } catch (error) {
      console.error('Deposit update error:', error);
      throw error;
    }
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
    let creditAccountName: string;

    // Determine accounts based on payment type
    switch (depositType) {
      case 'contribution': {
        // DR: Cash/Bank Account (money comes in)
        // CR: Contribution GL Account (tracks source)
        const cashAccount = accountId
          ? await this.ensureAccount(accountId)
          : await this.ensureAccount(null, 'cash', 'Default Cash Account');

        if (!cashAccount) {
          throw new Error('Cash account not found');
        }

        creditAccountName = description ? `${description} Received` : 'Contributions Received';
        const creditAccount = await this.ensureAccountByName(creditAccountName, 'bank', creditAccountName);

        debitAccountId = cashAccount.id;
        creditAccountId = creditAccount.id;
        debitDescription = `Contribution received - ${description}`;
        creditDescription = `Contribution received - ${description}`;
        break;
      }

      case 'fine': {
        // DR: Cash (money comes in)
        // CR: Fines Collected GL Account
        const cashAccount = accountId
          ? await this.ensureAccount(accountId)
          : await this.ensureAccount(null, 'cash', 'Default Cash Account');

        if (!cashAccount) {
          throw new Error('Cash account not found');
        }

        const creditAccount = await this.ensureAccountByName('Fines Collected', 'bank', 'Fines Collected GL Account');

        debitAccountId = cashAccount.id;
        creditAccountId = creditAccount.id;
        debitDescription = `Fine payment received`;
        creditDescription = `Fine payment received`;
        break;
      }

      case 'loan_repayment': {
        // DR: Cash (money comes in)
        // CR: Loan Repayments GL Account
        const cashAccount = accountId
          ? await this.ensureAccount(accountId)
          : await this.ensureAccount(null, 'cash', 'Default Cash Account');

        if (!cashAccount) {
          throw new Error('Cash account not found');
        }

        const creditAccount = await this.ensureAccountByName('Loan Repayments Received', 'bank', 'Loan Repayments GL Account');

        debitAccountId = cashAccount.id;
        creditAccountId = creditAccount.id;
        debitDescription = `Loan repayment received`;
        creditDescription = `Loan repayment received`;
        break;
      }

      case 'income': {
        // DR: Cash (money comes in)
        // CR: Income GL Account
        const cashAccount = accountId
          ? await this.ensureAccount(accountId)
          : await this.ensureAccount(null, 'cash', 'Default Cash Account');

        if (!cashAccount) {
          throw new Error('Cash account not found');
        }

        const creditAccount = await this.ensureAccountByName('Other Income', 'bank', 'Other Income GL Account');

        debitAccountId = cashAccount.id;
        creditAccountId = creditAccount.id;
        debitDescription = `Income received`;
        creditDescription = `Income received`;
        break;
      }

      case 'miscellaneous':
      default: {
        // DR: Cash (money comes in)
        // CR: Miscellaneous GL Account
        const cashAccount = accountId
          ? await this.ensureAccount(accountId)
          : await this.ensureAccount(null, 'cash', 'Default Cash Account');

        if (!cashAccount) {
          throw new Error('Cash account not found');
        }

        const creditAccount = await this.ensureAccountByName('Miscellaneous Receipts', 'bank', 'Miscellaneous GL Account');

        debitAccountId = cashAccount.id;
        creditAccountId = creditAccount.id;
        debitDescription = `Payment received`;
        creditDescription = `Payment received`;
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

      // DO NOT update GL account balances - they are calculated from journal entries
      // Only real cash/bank accounts need balance tracking
      const creditAccount = await this.prisma.account.findUnique({
        where: { id: creditAccountId },
        select: { name: true, type: true }
      });
    
      const isGLAccount = creditAccount && (
        creditAccount.name.includes('Received') || 
        creditAccount.name.includes('Expense') || 
        creditAccount.name.includes('Payable') ||
        creditAccount.name.includes('GL Account')
      );
    
      // Only update credit account balance if it's a real cash/bank account (not GL)
      if (!isGLAccount) {
        await this.prisma.account.update({
          where: { id: creditAccountId },
          data: { balance: { increment: amount } },
        });
      }

    // Update category ledger if applicable
    // NOTE: Contributions are NOT income - they are liabilities (money owed to members)
    // Only track actual income sources in the category ledger
    if (depositType === 'fine') {
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
