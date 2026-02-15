import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { randomUUID } from 'crypto';

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
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  private generateReference(prefix: string) {
    return `${prefix}-${randomUUID()}`;
  }

  private async assertReferenceUnique(reference?: string | null, excludeId?: number) {
    if (!reference) return;
    const existing = await this.prisma.deposit.findFirst({
      where: {
        reference,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException('Reference already exists for another deposit.');
    }
  }

  private async resolveCashAccountId(
    journalEntries: any[],
    fallbackAccountId: number | null,
    prismaClient: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<number | null> {
    // Try to extract from journal entries first (debitAccountId is the cash account for deposits)
    if (journalEntries && journalEntries.length > 0) {
      const debitAccountId = journalEntries[0]?.debitAccountId;
      if (debitAccountId) {
        return debitAccountId;
      }
    }

    // Use fallback if provided
    if (fallbackAccountId) {
      return fallbackAccountId;
    }

    // Find default cash account
    const defaultCashAccount = await prismaClient.account.findFirst({
      where: { name: 'Cashbox', type: 'cash' },
      select: { id: true },
    });

    return defaultCashAccount?.id ?? null;
  }

  private toAuditSnapshot(deposit: any) {
    return {
      id: deposit.id,
      memberId: deposit.memberId,
      memberName: deposit.memberName,
      amount: Number(deposit.amount),
      method: deposit.method,
      reference: deposit.reference,
      date: deposit.date ? new Date(deposit.date).toISOString() : null,
      notes: deposit.notes,
      type: deposit.type,
      category: deposit.category,
      description: deposit.description,
      narration: deposit.narration,
      accountId: deposit.accountId,
    };
  }

  private async findDepositJournalEntries(
    depositId: number,
    reference: string | null | undefined,
    prismaClient: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const referenceFilter = reference ? { reference } : undefined;
    return prismaClient.journalEntry.findMany({
      where: {
        OR: [
          referenceFilter,
          { narration: { contains: `DepositId:${depositId}` } },
        ].filter(Boolean) as any,
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

      const externalRef = depositData.reference;
      const effectiveReference = externalRef || this.generateReference('DEP');
      await this.assertReferenceUnique(effectiveReference);

      // Create the deposit record
      const deposit = await this.prisma.deposit.create({
        data: {
          ...depositData,
          reference: effectiveReference,
        },
      });

      // Ensure accounts exist (fallback defaults if none provided)
      const cashAccount = depositData.accountId
        ? await this.prisma.account.findUnique({ where: { id: depositData.accountId } })
        : await this.prisma.account.findFirst({ where: { name: 'Cashbox', type: 'cash' } });

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
          type: 'gl', // Dedicated GL account type (not a real cash/bank account)
          description: `GL account for ${depositData.category || depositData.type}`,
          currency: 'KES',
          balance: new Prisma.Decimal(0),
        },
      });

      // Record proper double-entry journal entry:
      // Debit: Cash Account (asset increases)
      // Credit: Contribution GL Account (tracks source of deposit)
      const narrationParts = [
        `DepositId:${deposit.id}`,
        `MemberId:${depositData.memberId ?? 'n/a'}`,
        `Type:${depositData.type}`,
        `Category:${depositData.category ?? 'n/a'}`,
        `SourceRef:${effectiveReference ?? 'n/a'}`,
      ];

      const narration = depositData.notes
        ? `${depositData.notes} | ${narrationParts.join(' | ')}`
        : narrationParts.join(' | ');

      await this.prisma.journalEntry.create({
        data: {
          date: depositData.date,
          reference: effectiveReference,
          description: `Member deposit - ${depositData.memberName || 'Member'} (memberId:${depositData.memberId ?? 'n/a'})`,
          narration,
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
            reference: effectiveReference,
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
    // Fetch deposits (contributions)
    const deposits = await this.prisma.deposit.findMany({
      orderBy: { date: 'desc' },
      include: { member: true },
    });

    // Fetch repayments (loan repayments = money in)
    const repayments = await this.prisma.repayment.findMany({
      orderBy: { date: 'desc' },
      include: { 
        member: true,
        loan: {
          include: {
            loanType: true,
          },
        },
      },
    });

    // Transform deposits to common format
    const depositEntries = deposits.map(d => ({
      ...d,
      type: d.type || 'contribution',
      transactionType: 'deposit',
      source: 'deposit',
    }));

    // Transform repayments to common format (as deposit entries)
    const repaymentEntries = repayments.map(r => ({
      id: r.id,
      memberId: r.memberId,
      memberName: r.member?.name || 'Unknown',
      member: r.member,
      amount: r.amount,
      method: r.method,
      reference: r.reference,
      date: r.date,
      notes: r.notes || `Loan repayment (Loan #${r.loanId})`,
      type: 'loan_repayment',
      category: 'Loan Repayment',
      description: `Loan repayment - ${r.loan?.loanType?.name || 'Loan'}`,
      transactionType: 'deposit',
      source: 'repayment',
      loanId: r.loanId,
      principal: r.principal,
      interest: r.interest,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    // Combine and sort by date (descending)
    const allEntries = [...depositEntries, ...repaymentEntries].sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });

    // Apply pagination
    const paginatedEntries = allEntries.slice(skip, skip + take);

    return {
      data: paginatedEntries,
      total: allEntries.length,
      deposits: depositEntries.length,
      repayments: repaymentEntries.length,
    };
  }

  async findOne(id: number) {
    return this.prisma.deposit.findUnique({
      where: { id },
      include: { member: true },
    });
  }

  async update(id: number, data: any) {
    try {
      const { updatedDeposit, beforeSnapshot } = await this.prisma.$transaction(async (tx) => {
        // Get the existing deposit to calculate differences
        const existingDeposit = await tx.deposit.findUnique({
          where: { id },
          include: { member: true },
        });

        if (!existingDeposit) {
          throw new BadRequestException('Deposit not found');
        }

        const beforeSnapshot = this.toAuditSnapshot(existingDeposit);

        // Normalize input data
        const depositData = {
          memberName: data.memberName?.trim() || existingDeposit.memberName,
          memberId: data.memberId ? parseInt(data.memberId) : existingDeposit.memberId,
          amount: data.amount ? parseFloat(data.amount) : Number(existingDeposit.amount),
          method: data.method || existingDeposit.method,
          reference: data.reference?.trim() || existingDeposit.reference || this.generateReference('DEP'),
          date: data.date ? new Date(data.date) : existingDeposit.date,
          notes: data.notes?.trim() || existingDeposit.notes,
          type: data.type || existingDeposit.type,
          category: data.category?.trim() || existingDeposit.category,
          description: data.description?.trim() || existingDeposit.description,
          narration: data.narration?.trim() || existingDeposit.narration,
          accountId: data.accountId ? parseInt(data.accountId) : existingDeposit.accountId,
        };

        await this.assertReferenceUnique(depositData.reference, existingDeposit.id);

        const updatedDeposit = await tx.deposit.update({
          where: { id },
          data: depositData,
          include: { member: true },
        });

        const journalEntries = await this.findDepositJournalEntries(
          existingDeposit.id,
          existingDeposit.reference,
          tx,
        );

        const oldAmount = Number(existingDeposit.amount);
        const newAmountValue = Number(depositData.amount);
        const oldCashAccountId = await this.resolveCashAccountId(
          journalEntries,
          existingDeposit.accountId,
          tx,
        );
        const newCashAccountId = depositData.accountId
          ? depositData.accountId
          : oldCashAccountId || (await this.resolveCashAccountId([], null, tx));

        if (!newCashAccountId) {
          throw new Error('Cash account not found. Cannot sync journal entries.');
        }

        if (oldCashAccountId) {
          await tx.account.update({
            where: { id: oldCashAccountId },
            data: { balance: { decrement: oldAmount } },
          });
        }

        if (newCashAccountId) {
          await tx.account.update({
            where: { id: newCashAccountId },
            data: { balance: { increment: newAmountValue } },
          });
        }

        if (journalEntries.length > 0) {
          await tx.journalEntry.deleteMany({
            where: { id: { in: journalEntries.map((entry) => entry.id) } },
          });
        } else {
          await tx.journalEntry.deleteMany({
            where: {
              OR: [
                { reference: existingDeposit.reference || undefined },
                { narration: { contains: `DepositId:${existingDeposit.id}` } },
              ],
            },
          });
        }

        const glAccountName = depositData.category
          ? `${depositData.category} Received`
          : `${depositData.type} Received`;

        const glAccount = await tx.account.upsert({
          where: { name: glAccountName },
          update: {},
          create: {
            name: glAccountName,
            type: 'gl',
            description: `GL account for ${depositData.category || depositData.type}`,
            currency: 'KES',
            balance: new Prisma.Decimal(0),
          },
        });

        const narrationParts = [
          `DepositId:${existingDeposit.id}`,
          `MemberId:${depositData.memberId ?? 'n/a'}`,
          `Type:${depositData.type}`,
          `Category:${depositData.category ?? 'n/a'}`,
          `SourceRef:${depositData.reference ?? 'n/a'}`,
        ];

        const narration = depositData.notes
          ? `${depositData.notes} | ${narrationParts.join(' | ')}`
          : narrationParts.join(' | ');

        await tx.journalEntry.create({
          data: {
            date: depositData.date,
            reference: depositData.reference ?? null,
            description: `Member deposit - ${depositData.memberName || 'Member'} (memberId:${depositData.memberId ?? 'n/a'})`,
            narration,
            debitAccountId: newCashAccountId,
            debitAmount: new Prisma.Decimal(newAmountValue),
            creditAccountId: glAccount.id,
            creditAmount: new Prisma.Decimal(newAmountValue),
            category: depositData.category || 'deposit',
          },
        });

        const oldMemberId = existingDeposit.memberId;
        const newMemberId = depositData.memberId;

        if (oldMemberId && newMemberId && oldMemberId === newMemberId) {
          const difference = newAmountValue - oldAmount;
          if (difference !== 0) {
            await tx.member.update({
              where: { id: newMemberId },
              data: { balance: { increment: difference } },
            });
          }
        } else {
          if (oldMemberId) {
            await tx.member.update({
              where: { id: oldMemberId },
              data: { balance: { decrement: oldAmount } },
            });
          }
          if (newMemberId) {
            await tx.member.update({
              where: { id: newMemberId },
              data: { balance: { increment: newAmountValue } },
            });
          }
        }

        if (oldMemberId) {
          await tx.ledger.deleteMany({
            where: {
              memberId: oldMemberId,
              OR: [
                { reference: existingDeposit.reference || undefined },
                { date: existingDeposit.date },
              ],
            },
          });
        }

        if (newMemberId) {
          const refreshedMember = await tx.member.findUnique({
            where: { id: newMemberId },
          });

          await tx.ledger.create({
            data: {
              memberId: newMemberId,
              type: depositData.type || 'Deposit',
              amount: newAmountValue,
              description: depositData.description || depositData.narration || depositData.category || 'Deposit',
              reference: depositData.reference,
              balanceAfter: Number(refreshedMember?.balance || 0),
              date: depositData.date,
            },
          });
        }

        return { updatedDeposit, beforeSnapshot };
      });

      const afterSnapshot = this.toAuditSnapshot(updatedDeposit);
      await this.auditService.log({
        actor: data?.updatedBy || data?.actor || 'system',
        action: 'deposit.update',
        resource: 'deposit',
        resourceId: String(id),
        payload: {
          before: beforeSnapshot,
          after: afterSnapshot,
        },
      });

      return updatedDeposit;
    } catch (error) {
      console.error('Deposit update error:', error);
      throw error;
    }
  }

  async remove(id: number) {
    const { deletedDeposit, beforeSnapshot } = await this.prisma.$transaction(async (tx) => {
      const existingDeposit = await tx.deposit.findUnique({
        where: { id },
        include: { member: true },
      });

      if (!existingDeposit) {
        throw new BadRequestException('Deposit not found');
      }

      const beforeSnapshot = this.toAuditSnapshot(existingDeposit);
      const dayStart = new Date(existingDeposit.date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(existingDeposit.date);
      dayEnd.setHours(23, 59, 59, 999);

      const journalEntries = await this.findDepositJournalEntries(
        existingDeposit.id,
        existingDeposit.reference,
        tx,
      );

      const oldAmount = Number(existingDeposit.amount);
      const fallbackJournalEntries = journalEntries.length
        ? []
        : await tx.journalEntry.findMany({
            where: {
              date: { gte: dayStart, lte: dayEnd },
              OR: [
                { debitAmount: new Prisma.Decimal(oldAmount) },
                { creditAmount: new Prisma.Decimal(oldAmount) },
              ],
              AND: [
                {
                  OR: [
                    existingDeposit.memberName
                      ? {
                          description: {
                            contains: existingDeposit.memberName,
                          },
                        }
                      : undefined,
                    existingDeposit.memberId
                      ? { narration: { contains: `MemberId:${existingDeposit.memberId}` } }
                      : undefined,
                    { description: { contains: 'Member deposit' } },
                  ].filter(Boolean) as any,
                },
              ],
            },
          });

      const journalEntriesToUse = journalEntries.length ? journalEntries : fallbackJournalEntries;
      const hasPostedEntries = journalEntriesToUse.length > 0;

      if (existingDeposit.isVoided) {
        if (existingDeposit.memberId) {
          await tx.ledger.deleteMany({
            where: {
              memberId: existingDeposit.memberId,
              OR: [
                { reference: existingDeposit.reference || undefined },
                { date: existingDeposit.date },
              ],
            },
          });
        }

        await tx.journalEntry.deleteMany({
          where: {
            OR: [
              { reference: existingDeposit.reference || undefined },
              { narration: { contains: `DepositId:${existingDeposit.id}` } },
              { reference: `VOID-${existingDeposit.reference || `DEP-${existingDeposit.id}`}` },
            ],
          },
        });
      } else {
        const cashAccountId = hasPostedEntries
          ? await this.resolveCashAccountId(
              journalEntriesToUse,
              existingDeposit.accountId,
              tx,
            )
          : null;

        if (hasPostedEntries && cashAccountId) {
          await tx.account.update({
            where: { id: cashAccountId },
            data: { balance: { decrement: oldAmount } },
          });
        }

        if (existingDeposit.memberId) {
          await tx.member.update({
            where: { id: existingDeposit.memberId },
            data: { balance: { decrement: oldAmount } },
          });

          await tx.ledger.deleteMany({
            where: {
              memberId: existingDeposit.memberId,
              OR: [
                { reference: existingDeposit.reference || undefined },
                { date: { gte: dayStart, lte: dayEnd } },
                {
                  AND: [
                    { amount: oldAmount },
                    { date: { gte: dayStart, lte: dayEnd } },
                    {
                      OR: [
                        existingDeposit.description
                          ? {
                              description: {
                                contains: existingDeposit.description,
                              },
                            }
                          : undefined,
                        existingDeposit.category
                          ? {
                              description: {
                                contains: existingDeposit.category,
                              },
                            }
                          : undefined,
                        { description: { contains: 'Deposit' } },
                      ].filter(Boolean) as any,
                    },
                  ],
                },
              ],
            },
          });
        }

        if (hasPostedEntries) {
          await tx.journalEntry.deleteMany({
            where: { id: { in: journalEntriesToUse.map((entry) => entry.id) } },
          });
        } else {
          await tx.journalEntry.deleteMany({
            where: {
              OR: [
                { reference: existingDeposit.reference || undefined },
                { narration: { contains: `DepositId:${existingDeposit.id}` } },
              ],
            },
          });
        }
      }

      const deletedDeposit = await tx.deposit.delete({ where: { id } });

      return { deletedDeposit, beforeSnapshot };
    });

    await this.auditService.log({
      actor: 'system',
      action: 'deposit.delete',
      resource: 'deposit',
      resourceId: String(id),
      payload: {
        before: beforeSnapshot,
      },
    });

    return deletedDeposit;
  }

  async void(id: number, data: any) {
    const { updatedDeposit, beforeSnapshot } = await this.prisma.$transaction(async (tx) => {
      const existingDeposit = await tx.deposit.findUnique({
        where: { id },
        include: { member: true },
      });

      if (!existingDeposit) {
        throw new BadRequestException('Deposit not found');
      }

      if (existingDeposit.isVoided) {
        throw new BadRequestException('Deposit is already voided');
      }

      const beforeSnapshot = this.toAuditSnapshot(existingDeposit);
      const journalEntries = await this.findDepositJournalEntries(
        existingDeposit.id,
        existingDeposit.reference,
        tx,
      );

      const hasPostedEntries = journalEntries.length > 0;

      if (hasPostedEntries) {
        const oldAmount = Number(existingDeposit.amount);
        const cashAccountId = await this.resolveCashAccountId(
          journalEntries,
          existingDeposit.accountId,
          tx,
        );

        if (cashAccountId) {
          await tx.account.update({
            where: { id: cashAccountId },
            data: { balance: { decrement: oldAmount } },
          });
        }

        if (existingDeposit.memberId) {
          const updatedMember = await tx.member.update({
            where: { id: existingDeposit.memberId },
            data: { balance: { decrement: oldAmount } },
          });

          await tx.ledger.create({
            data: {
              memberId: existingDeposit.memberId,
              type: 'deposit_void',
              amount: -oldAmount,
              description: `Void deposit ${existingDeposit.reference || `DEP-${existingDeposit.id}`}`,
              reference: existingDeposit.reference || `DEP-${existingDeposit.id}`,
              balanceAfter: Number(updatedMember.balance),
              date: new Date(),
            },
          });
        }

        const voidReference = `VOID-${existingDeposit.reference || `DEP-${existingDeposit.id}`}`;
        for (const entry of journalEntries) {
          await tx.journalEntry.create({
            data: {
              date: new Date(),
              reference: voidReference,
              description: `Void deposit ${existingDeposit.reference || `DEP-${existingDeposit.id}`}`,
              narration: `VoidOfRef:${entry.reference || 'n/a'} | DepositId:${existingDeposit.id}`,
              debitAccountId: entry.creditAccountId,
              debitAmount: entry.creditAmount,
              creditAccountId: entry.debitAccountId,
              creditAmount: entry.debitAmount,
              category: entry.category,
            },
          });
        }
      }

      const updatedDeposit = await tx.deposit.update({
        where: { id },
        data: {
          isVoided: true,
          voidedAt: new Date(),
          voidedBy: data?.actor || data?.updatedBy || 'system',
          voidReason: data?.reason ? String(data.reason).trim() : null,
        },
      });

      return { updatedDeposit, beforeSnapshot };
    });

    await this.auditService.log({
      actor: data?.actor || data?.updatedBy || 'system',
      action: 'deposit.void',
      resource: 'deposit',
      resourceId: String(id),
      payload: {
        before: beforeSnapshot,
      },
    });

    return updatedDeposit;
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
    const description = payment.notes || '';

    // Create the deposit record
    const externalRef = payment.reference?.trim() || null;
    const effectiveReference = externalRef || this.generateReference('DEP');
    await this.assertReferenceUnique(effectiveReference);

    const deposit = await this.prisma.deposit.create({
      data: {
        memberId: memberId || null,
        memberName: payment.memberName || null,
        type: depositType as any,
        category: payment.contributionType || payment.paymentType,
        amount: amountDecimal,
        method: payment.paymentMethod as any,
        accountId: payment.accountId || null,
        reference: effectiveReference,
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
      effectiveReference,
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
          ? await this.prisma.account.findUnique({ where: { id: accountId } })
          : await this.prisma.account.findFirst({ where: { type: 'cash' } });

        if (!cashAccount) {
          throw new Error('Cash account not found');
        }

        creditAccountName = description ? `${description} Received` : 'Contributions Received';
        const creditAccount = await this.prisma.account.findFirst({ where: { name: creditAccountName, type: 'gl' } });

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
          ? await this.prisma.account.findUnique({ where: { id: accountId } })
          : await this.prisma.account.findFirst({ where: { type: 'cash' } });

        if (!cashAccount) {
          throw new Error('Cash account not found');
        }

        const creditAccount = await this.prisma.account.findFirst({ where: { name: 'Fines Collected', type: 'gl' } });

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
          ? await this.prisma.account.findUnique({ where: { id: accountId } })
          : await this.prisma.account.findFirst({ where: { type: 'cash' } });

        if (!cashAccount) {
          throw new Error('Cash account not found');
        }

        const creditAccount = await this.prisma.account.findFirst({ where: { name: 'Loan Repayments Received', type: 'gl' } });

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
          ? await this.prisma.account.findUnique({ where: { id: accountId } })
          : await this.prisma.account.findFirst({ where: { type: 'cash' } });

        if (!cashAccount) {
          throw new Error('Cash account not found');
        }

        const creditAccount = await this.prisma.account.findFirst({ where: { name: 'Other Income', type: 'gl' } });

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
          ? await this.prisma.account.findUnique({ where: { id: accountId } })
          : await this.prisma.account.findFirst({ where: { type: 'cash' } });

        if (!cashAccount) {
          throw new Error('Cash account not found');
        }

        const creditAccount = await this.prisma.account.findFirst({ where: { name: 'Miscellaneous Receipts', type: 'gl' } });

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
  }
}
