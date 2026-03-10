import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

export interface ContributionToLoanTransferDto {
  memberId: number;
  fromContributionType: string; // e.g., 'Monthly Minimum Contribution'
  toLoanId: number;
  amount: number;
  date: string;
  description?: string;
  notes?: string;
}

export interface MemberToMemberTransferDto {
  fromMemberId: number;
  fromSource: string; // 'contribution', 'savings'
  fromContributionType?: string;
  toMemberId: number;
  toDestination: string; // 'contribution', 'savings'
  toContributionType?: string;
  amount: number;
  date: string;
  description?: string;
  notes?: string;
}

export interface ContributionTransferDto {
  date: string;
  amount: number;
  fromMemberId?: number;
  fromMemberName?: string;
  fromSource: string;
  fromContributionType?: string;
  fromLoanId?: number;
  toMemberId?: number;
  toMemberName?: string;
  toDestination: string;
  toContributionType?: string;
  toLoanId?: number;
  description?: string;
  notes?: string;
  category?: string;
}

@Injectable()
export class ContributionTransfersService {
  private contributionTransferTableAvailable: boolean | null = null;

  constructor(private prisma: PrismaService) {}

  /**
   * Generate a unique reference for contribution transfer
   * Format: CT-YYMMDD-ID
   */
  private generateReference(id: number | string): string {
    const date = new Date();
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `CT-${yy}${mm}${dd}-${id}`;
  }

  private async hasContributionTransferTable(): Promise<boolean> {
    if (this.contributionTransferTableAvailable !== null) {
      return this.contributionTransferTableAvailable;
    }

    try {
      const result = (await this.prisma.$queryRawUnsafe(
        'SELECT to_regclass(\'public."ContributionTransfer"\') AS table_name',
      )) as Array<{ table_name: string | null }>;

      this.contributionTransferTableAvailable = Boolean(result?.[0]?.table_name);
      return this.contributionTransferTableAvailable;
    } catch {
      this.contributionTransferTableAvailable = false;
      return false;
    }
  }

  /**
   * Ensure GL account exists
   */
  private async ensureGLAccount(
    name: string,
    description?: string,
  ): Promise<{ id: number; name: string }> {
    const existing = await this.prisma.account.findFirst({
      where: { name, type: 'gl' },
    });
    if (existing) return existing;

    return this.prisma.account.create({
      data: {
        name,
        type: 'gl',
        description: description ?? null,
        currency: 'KES',
        balance: new Prisma.Decimal(0),
      },
    });
  }

  /**
   * Record Contribution to Loan Transfer
   * Transfers member's contribution to pay their loan balance
   * This is a GL-level transaction (no bank account movement)
   */
  async createContributionToLoanTransfer(data: ContributionToLoanTransferDto) {
    const amount = new Prisma.Decimal(data.amount);
    const parsedDate = new Date(data.date);

    // Validate member exists
    const member = await this.prisma.member.findUnique({
      where: { id: data.memberId },
      select: { id: true, name: true },
    });
    if (!member) {
      throw new NotFoundException(`Member with ID ${data.memberId} not found`);
    }

    // Validate loan exists and belongs to member
    const loan = await this.prisma.loan.findUnique({
      where: { id: data.toLoanId },
      select: { id: true, memberId: true, balance: true, loanType: { select: { name: true } } },
    });
    if (!loan) {
      throw new NotFoundException(`Loan with ID ${data.toLoanId} not found`);
    }
    if (loan.memberId !== data.memberId) {
      throw new BadRequestException('Loan does not belong to the specified member');
    }

    // Validate amount doesn't exceed loan balance
    if (Number(amount) > Number(loan.balance)) {
      throw new BadRequestException(
        `Transfer amount (${amount}) exceeds loan balance (${loan.balance})`,
      );
    }

    // Get or create GL accounts
    const contributionReceivableAccount = await this.ensureGLAccount(
      'Member Contributions Receivable',
      'GL account for tracking member contribution balances',
    );

    const loanReceivableAccount = await this.ensureGLAccount(
      'Loans Receivable',
      'Outstanding loans to members (Asset)',
    );

    const hasTransferTable = await this.hasContributionTransferTable();

    const response = await this.prisma.$transaction(async (tx) => {
      const txAny = tx as any;
      let transfer: any = null;

      if (hasTransferTable) {
        transfer = await txAny['contributionTransfer'].create({
          data: {
            fromMemberId: data.memberId,
            fromMemberName: member.name,
            fromSource: 'contribution',
            fromContributionType: data.fromContributionType,
            toMemberId: data.memberId,
            toMemberName: member.name,
            toDestination: 'loan',
            toLoanId: data.toLoanId,
            amount,
            date: parsedDate,
            description: data.description || 'Contribution transfer to loan',
            notes: data.notes,
            category: 'contribution_to_loan',
          },
        });
      }

      const reference = this.generateReference(transfer?.id ?? `${data.memberId}-${data.toLoanId}-${Date.now()}`);

      // Create journal entry for GL-level transfer
      // Debit: Loans Receivable (reduce loan asset)
      // Credit: Member Contributions Receivable (reduce contribution liability)
      const narration = [
        transfer ? `ContributionTransferId:${transfer.id}` : 'ContributionTransferId:N/A',
        `From:${data.fromContributionType}`,
        `To:Loan#${data.toLoanId}(${loan.loanType.name})`,
        `Member:${member.name}(#${member.id})`,
        data.description || '',
      ]
        .filter(Boolean)
        .join(' | ');

      await tx.journalEntry.create({
        data: {
          date: parsedDate,
          reference,
          description: `Contribution transfer to loan - ${member.name}`,
          narration,
          debitAccountId: loanReceivableAccount.id,
          debitAmount: amount,
          creditAccountId: contributionReceivableAccount.id,
          creditAmount: amount,
          category: 'contribution_transfer',
        },
      });

      // Update loan balance (reduce by transfer amount)
      await tx.loan.update({
        where: { id: data.toLoanId },
        data: {
          balance: {
            decrement: amount,
          },
        },
      });

      const updatedMember = await tx.member.update({
        where: { id: data.memberId },
        data: {
          balance: { decrement: Number(amount) },
          loanBalance: { decrement: Number(amount) },
        },
      });

      // Update member ledger
      await tx.ledger.create({
        data: {
          memberId: data.memberId,
          type: 'transfer_out',
          amount: Number(amount),
          description: `Transfer ${data.fromContributionType} to ${loan.loanType.name}`,
          reference,
          balanceAfter: Number(updatedMember.balance),
          date: parsedDate,
        },
      });

      if (hasTransferTable && transfer) {
        await txAny['contributionTransfer'].update({
          where: { id: transfer.id },
          data: {
            reference,
            debitAccount: loanReceivableAccount.name,
            creditAccount: contributionReceivableAccount.name,
            journalReference: reference,
          },
        });

        return txAny['contributionTransfer'].findUnique({
          where: { id: transfer.id },
          include: {
            fromMember: {
              select: { id: true, name: true, phone: true },
            },
            toMember: {
              select: { id: true, name: true, phone: true },
            },
          },
        });
      }

      return {
        id: null,
        fromMemberId: data.memberId,
        fromMemberName: member.name,
        toMemberId: data.memberId,
        toMemberName: member.name,
        toLoanId: data.toLoanId,
        amount,
        date: parsedDate,
        reference,
        description: data.description || 'Contribution transfer to loan',
        category: 'contribution_to_loan',
        debitAccount: loanReceivableAccount.name,
        creditAccount: contributionReceivableAccount.name,
        journalReference: reference,
      };
    });

    return response;
  }

  /**
   * Record Member to Member Transfer
   * Transfers contributions from one member to another
   * This is a GL-level transaction (no bank account movement)
   */
  async createMemberToMemberTransfer(data: MemberToMemberTransferDto) {
    const amount = new Prisma.Decimal(data.amount);
    const parsedDate = new Date(data.date);

    // Validate from member
    const fromMember = await this.prisma.member.findUnique({
      where: { id: data.fromMemberId },
      select: { id: true, name: true, balance: true },
    });
    if (!fromMember) {
      throw new NotFoundException(`Source member with ID ${data.fromMemberId} not found`);
    }

    // Validate to member
    const toMember = await this.prisma.member.findUnique({
      where: { id: data.toMemberId },
      select: { id: true, name: true },
    });
    if (!toMember) {
      throw new NotFoundException(`Destination member with ID ${data.toMemberId} not found`);
    }

    // Validate source and destination are different
    if (data.fromMemberId === data.toMemberId) {
      throw new BadRequestException('Cannot transfer to the same member');
    }

    // Validate from member has sufficient balance
    if (Number(fromMember.balance) < Number(amount)) {
      throw new BadRequestException(
        `Insufficient balance: ${fromMember.name} has ${fromMember.balance}, transfer requires ${amount}`,
      );
    }

    // Get or create member-specific GL accounts
    const fromMemberAccount = await this.ensureGLAccount(
      `Member ${fromMember.name} - Contributions`,
      `GL account for ${fromMember.name}'s contributions`,
    );

    const toMemberAccount = await this.ensureGLAccount(
      `Member ${toMember.name} - Contributions`,
      `GL account for ${toMember.name}'s contributions`,
    );

    const hasTransferTable = await this.hasContributionTransferTable();

    const response = await this.prisma.$transaction(async (tx) => {
      const txAny = tx as any;
      let transfer: any = null;

      if (hasTransferTable) {
        transfer = await txAny['contributionTransfer'].create({
          data: {
            fromMemberId: data.fromMemberId,
            fromMemberName: fromMember.name,
            fromSource: data.fromSource || 'contribution',
            fromContributionType: data.fromContributionType,
            toMemberId: data.toMemberId,
            toMemberName: toMember.name,
            toDestination: data.toDestination || 'contribution',
            toContributionType: data.toContributionType,
            amount,
            date: parsedDate,
            description:
              data.description || `Transfer from ${fromMember.name} to ${toMember.name}`,
            notes: data.notes,
            category: 'member_to_member',
          },
        });
      }

      const reference = this.generateReference(transfer?.id ?? `${data.fromMemberId}-${data.toMemberId}-${Date.now()}`);

      // Create journal entry
      // Debit: To Member's Contribution Account (increase)
      // Credit: From Member's Contribution Account (decrease)
      const narration = [
        transfer ? `ContributionTransferId:${transfer.id}` : 'ContributionTransferId:N/A',
        `From:${fromMember.name}(#${data.fromMemberId})`,
        `To:${toMember.name}(#${data.toMemberId})`,
        data.fromContributionType ? `Type:${data.fromContributionType}` : '',
        data.description || '',
      ]
        .filter(Boolean)
        .join(' | ');

      await tx.journalEntry.create({
        data: {
          date: parsedDate,
          reference,
          description: `Member transfer: ${fromMember.name} → ${toMember.name}`,
          narration,
          debitAccountId: toMemberAccount.id,
          debitAmount: amount,
          creditAccountId: fromMemberAccount.id,
          creditAmount: amount,
          category: 'contribution_transfer',
        },
      });

      // Update member balances
      const updatedFromMember = await tx.member.update({
        where: { id: data.fromMemberId },
        data: {
          balance: {
            decrement: Number(amount),
          },
        },
      });

      const updatedToMember = await tx.member.update({
        where: { id: data.toMemberId },
        data: {
          balance: {
            increment: Number(amount),
          },
        },
      });

      // Create ledger entries for both members
      await tx.ledger.createMany({
        data: [
          {
            memberId: data.fromMemberId,
            type: 'transfer_out',
            amount: Number(amount),
            description: `Transfer to ${toMember.name}`,
            reference,
            balanceAfter: Number(updatedFromMember.balance),
            date: parsedDate,
          },
          {
            memberId: data.toMemberId,
            type: 'transfer_in',
            amount: Number(amount),
            description: `Transfer from ${fromMember.name}`,
            reference,
            balanceAfter: Number(updatedToMember.balance),
            date: parsedDate,
          },
        ],
      });

      if (hasTransferTable && transfer) {
        await txAny['contributionTransfer'].update({
          where: { id: transfer.id },
          data: {
            reference,
            debitAccount: toMemberAccount.name,
            creditAccount: fromMemberAccount.name,
            journalReference: reference,
          },
        });

        return txAny['contributionTransfer'].findUnique({
          where: { id: transfer.id },
          include: {
            fromMember: {
              select: { id: true, name: true, phone: true },
            },
            toMember: {
              select: { id: true, name: true, phone: true },
            },
          },
        });
      }

      return {
        id: null,
        fromMemberId: data.fromMemberId,
        fromMemberName: fromMember.name,
        toMemberId: data.toMemberId,
        toMemberName: toMember.name,
        amount,
        date: parsedDate,
        reference,
        description: data.description || `Transfer from ${fromMember.name} to ${toMember.name}`,
        category: 'member_to_member',
        debitAccount: toMemberAccount.name,
        creditAccount: fromMemberAccount.name,
        journalReference: reference,
      };
    });

    return response;
  }

  /**
   * Generic contribution transfer creation
   */
  async createTransfer(data: ContributionTransferDto) {
    // Determine transfer type based on category or infer from fields
    const category = data.category || this.inferCategory(data);

    if (category === 'contribution_to_loan') {
      return this.createContributionToLoanTransfer({
        memberId: data.fromMemberId!,
        fromContributionType: data.fromContributionType || 'Contribution',
        toLoanId: data.toLoanId!,
        amount: data.amount,
        date: data.date,
        description: data.description,
        notes: data.notes,
      });
    } else if (category === 'member_to_member') {
      return this.createMemberToMemberTransfer({
        fromMemberId: data.fromMemberId!,
        fromSource: data.fromSource,
        fromContributionType: data.fromContributionType,
        toMemberId: data.toMemberId!,
        toDestination: data.toDestination,
        toContributionType: data.toContributionType,
        amount: data.amount,
        date: data.date,
        description: data.description,
        notes: data.notes,
      });
    }

    throw new BadRequestException('Invalid transfer category or missing required fields');
  }

  /**
   * Infer transfer category from data
   */
  private inferCategory(data: ContributionTransferDto): string {
    if (data.toLoanId && data.fromMemberId === data.toMemberId) {
      return 'contribution_to_loan';
    }
    if (data.fromMemberId && data.toMemberId && data.fromMemberId !== data.toMemberId) {
      return 'member_to_member';
    }
    return 'unknown';
  }

  /**
   * Find all contribution transfers
   */
  async findAll(take = 100, skip = 0, filters?: any) {
    if (!(await this.hasContributionTransferTable())) {
      return { data: [], total: 0 };
    }

    const where: any = { isVoided: false };
    if (filters?.fromMemberId) where.fromMemberId = filters.fromMemberId;
    if (filters?.toMemberId) where.toMemberId = filters.toMemberId;
    if (filters?.category) where.category = filters.category;
    if (filters?.startDate || filters?.endDate) {
      where.date = {};
      if (filters?.startDate) where.date.gte = new Date(filters.startDate);
      if (filters?.endDate) where.date.lte = new Date(filters.endDate);
    }

    const transfers = await (this.prisma as any)['contributionTransfer'].findMany({
      where,
      take,
      skip,
      orderBy: { date: 'desc' },
      include: {
        fromMember: {
          select: { id: true, name: true, phone: true },
        },
        toMember: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    return {
      data: transfers,
      total: await (this.prisma as any)['contributionTransfer'].count({ where }),
    };
  }

  /**
   * Find a specific contribution transfer
   */
  async findOne(id: number) {
    if (!(await this.hasContributionTransferTable())) {
      throw new NotFoundException('Contribution transfer table is not available in this database');
    }

    const transfer = await (this.prisma as any)['contributionTransfer'].findUnique({
      where: { id },
      include: {
        fromMember: {
          select: { id: true, name: true, phone: true },
        },
        toMember: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    if (!transfer) {
      throw new NotFoundException(`Contribution transfer with ID ${id} not found`);
    }

    return transfer;
  }

  /**
   * Void a contribution transfer
   */
  async voidTransfer(id: number, voidedBy: string, voidReason: string) {
    if (!(await this.hasContributionTransferTable())) {
      throw new BadRequestException('Contribution transfer table is not available in this database');
    }

    const transfer = await this.findOne(id);

    if (transfer.isVoided) {
      throw new BadRequestException('Transfer is already voided');
    }

    // TODO: Implement proper reversal logic
    // - Reverse journal entries
    // - Restore member balances
    // - Update loan balances
    // - Create reversal ledger entries

    return (this.prisma as any)['contributionTransfer'].update({
      where: { id },
      data: {
        isVoided: true,
        voidedAt: new Date(),
        voidedBy,
        voidReason,
      },
    });
  }
}
