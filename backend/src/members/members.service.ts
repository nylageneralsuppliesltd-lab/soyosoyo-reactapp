import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

interface ListOptions {
  skip?: number;
  take?: number;
  search?: string;
  role?: string;
  active?: boolean;
  sort?: 'asc' | 'desc';
}

const MONTHLY_INVOICE_AMOUNT = 200;

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function monthsInclusive(from: Date, to: Date): number {
  const yearDiff = to.getFullYear() - from.getFullYear();
  const monthDiff = to.getMonth() - from.getMonth();
  return Math.max(0, yearDiff * 12 + monthDiff + 1);
}

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateMemberDto) {
    try {
      console.log('[MembersService.create] Starting with dto:', JSON.stringify(dto));

      // Check if member exists
      console.log('[MembersService.create] Checking if member with phone exists:', dto.phone);
      const existing = await this.prisma.member.findUnique({ where: { phone: dto.phone } });
      if (existing) {
        console.warn('[MembersService.create] Member already exists with phone:', dto.phone);
        throw new BadRequestException('Member with this phone number already exists.');
      }

      // Prepare data and convert empty strings to null for optional fields
      const { nextOfKin, ...rest } = dto;

      const dataToCreate = {
        ...rest,
        dob: rest.dob && rest.dob.trim() ? rest.dob : null,
        email: rest.email && rest.email.trim() ? rest.email : null,
        idNumber: rest.idNumber && rest.idNumber.trim() ? rest.idNumber : null,
        gender: rest.gender && rest.gender.trim() ? rest.gender : null,
        employmentStatus: rest.employmentStatus && rest.employmentStatus.trim() ? rest.employmentStatus : null,
        employerName: rest.employerName && rest.employerName.trim() ? rest.employerName : null,
        regNo: rest.regNo && rest.regNo.trim() ? rest.regNo : null,
        employerAddress: rest.employerAddress && rest.employerAddress.trim() ? rest.employerAddress : null,
        nextOfKin: nextOfKin && nextOfKin.length > 0 ? JSON.parse(JSON.stringify(nextOfKin)) : null,
      };

      delete (dataToCreate as any).customRole;
      console.log('[MembersService.create] Prepared data for creation:', JSON.stringify(dataToCreate));

      const result = await this.prisma.member.create({ data: dataToCreate });
      console.log('[MembersService.create] Member created with id:', result.id);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorName = err instanceof Error ? err.name : 'Unknown';
      console.error('[MembersService.create] FAILED:', errorName, errorMsg);
      throw err;
    }
  }

  async findAll(options: ListOptions = {}) {
    const { skip = 0, take = 50, search, role, active, sort = 'desc' } = options;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (active !== undefined) {
      where.active = active;
    }

    const [members, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: sort },
        include: {
          ledger: {
            select: {
              amount: true,
              type: true,
            },
          },
        },
      }),
      this.prisma.member.count({ where }),
    ]);

    const firstContributionPayment = await this.prisma.deposit.findFirst({
      where: { type: 'contribution' },
      orderBy: { date: 'asc' },
      select: { date: true },
    });

    const groupInceptionMonth = startOfMonth(firstContributionPayment?.date || new Date());
    const currentMonth = startOfMonth(new Date());

    const memberIds = members.map((member) => member.id);
    const contributionRows = memberIds.length
      ? await this.prisma.deposit.groupBy({
          by: ['memberId', 'category'],
          where: {
            memberId: { in: memberIds },
          },
          _sum: { amount: true },
        })
      : [];

    const contributionTotalsByMember = contributionRows.reduce((acc, row) => {
      const memberContributionTotals = acc[row.memberId] || {
        totalContributions: 0,
        monthlyMinimumContribution: 0,
        shareCapital: 0,
        registrationFee: 0,
        riskFund: 0,
      };

      const amount = Number(row._sum.amount || 0);
      memberContributionTotals.totalContributions += amount;

      if (row.category === 'Monthly Minimum Contribution') {
        memberContributionTotals.monthlyMinimumContribution += amount;
      } else if (row.category === 'Share Capital') {
        memberContributionTotals.shareCapital += amount;
      } else if (row.category === 'Registration Fee') {
        memberContributionTotals.registrationFee += amount;
      } else if (row.category === 'Risk Fund') {
        memberContributionTotals.riskFund += amount;
      }

      acc[row.memberId] = memberContributionTotals;
      return acc;
    }, {} as Record<number, {
      totalContributions: number;
      monthlyMinimumContribution: number;
      shareCapital: number;
      registrationFee: number;
      riskFund: number;
    }>);

    // Calculate real-time balances from ledger
    const membersWithCalculatedBalance = members.map((member) => {
      const ledgerEntries = member.ledger || [];
      const contributionTotals = contributionTotalsByMember[member.id] || {
        totalContributions: 0,
        monthlyMinimumContribution: 0,
        shareCapital: 0,
        registrationFee: 0,
        riskFund: 0,
      };

      const paidTowardMonthlyInvoice = contributionTotals.monthlyMinimumContribution;
      const memberJoinMonth = startOfMonth(member.createdAt);
      const memberArrearsStartMonth = addMonths(memberJoinMonth, 1);
      const effectiveArrearsStart = memberArrearsStartMonth > groupInceptionMonth
        ? memberArrearsStartMonth
        : groupInceptionMonth;
      const expectedMonthsForMember = monthsInclusive(effectiveArrearsStart, currentMonth);
      const expectedInvoicedAmountForMember = expectedMonthsForMember * MONTHLY_INVOICE_AMOUNT;
      const computedArrears = expectedInvoicedAmountForMember - paidTowardMonthlyInvoice;

      const calculatedBalance = ledgerEntries.reduce((sum, entry) => {
        const amount = Number(entry.amount);
        const credits = ['contribution', 'deposit', 'income', 'loan_repayment', 'fine_payment'];
        const debits = ['withdrawal', 'expense', 'loan_disbursement', 'fine', 'transfer_out', 'refund'];

        if (credits.includes(entry.type)) {
          return sum + amount;
        }
        if (debits.includes(entry.type)) {
          return sum - Math.abs(amount);
        }
        return sum;
      }, 0);

      // Calculate loan balance from loan-related entries
      const calculatedLoanBalance = ledgerEntries.reduce((sum, entry) => {
        if (entry.type === 'loan_disbursement') {
          return sum + entry.amount;
        } else if (entry.type === 'loan_repayment') {
          return sum - entry.amount;
        }
        return sum;
      }, 0);

      // Return member with calculated balances (override stored values)
      const { ledger, ...memberData } = member;
      return {
        ...memberData,
        balance: Math.round(calculatedBalance * 100) / 100,
        loanBalance: Math.round(calculatedLoanBalance * 100) / 100,
        totalContributions: Math.round(contributionTotals.totalContributions * 100) / 100,
        monthlyMinimumContribution: Math.round(contributionTotals.monthlyMinimumContribution * 100) / 100,
        shareCapitalContributions: Math.round(contributionTotals.shareCapital * 100) / 100,
        registrationFeeContributions: Math.round(contributionTotals.registrationFee * 100) / 100,
        riskFundContributions: Math.round(contributionTotals.riskFund * 100) / 100,
        totalArrears: Math.round(computedArrears * 100) / 100,
      };
    });

    return {
      data: membersWithCalculatedBalance,
      total,
      skip,
      take,
      pages: Math.ceil(total / take),
    };
  }

  async findOne(id: number) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: { 
        ledger: {
          orderBy: { date: 'asc' },
        },
      },
    });
    if (!member) throw new NotFoundException(`Member with ID ${id} not found.`);
    
    // Calculate real-time balances from ledger
    const ledgerEntries = member.ledger || [];
    
    const calculatedBalance = ledgerEntries.reduce((sum, entry) => {
      const amount = Number(entry.amount);
      const credits = ['contribution', 'deposit', 'income', 'loan_repayment', 'fine_payment'];
      const debits = ['withdrawal', 'expense', 'loan_disbursement', 'fine', 'transfer_out', 'refund'];

      if (credits.includes(entry.type)) {
        return sum + amount;
      }
      if (debits.includes(entry.type)) {
        return sum - Math.abs(amount);
      }
      return sum;
    }, 0);

    const calculatedLoanBalance = ledgerEntries.reduce((sum, entry) => {
      if (entry.type === 'loan_disbursement') {
        return sum + entry.amount;
      } else if (entry.type === 'loan_repayment') {
        return sum - entry.amount;
      }
      return sum;
    }, 0);

    return {
      ...member,
      balance: Math.round(calculatedBalance * 100) / 100,
      loanBalance: Math.round(calculatedLoanBalance * 100) / 100,
    };
  }

  async update(id: number, dto: any) {
    await this.findOne(id);

    const trimToUndefined = (value?: string | null) => {
      if (value === undefined || value === null) return undefined;
      const trimmed = String(value).trim();
      return trimmed === '' ? undefined : trimmed;
    };

    const nullIfEmpty = (value?: string | null) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      const trimmed = String(value).trim();
      return trimmed === '' ? null : trimmed;
    };

    const sanitizedPhone = trimToUndefined(dto.phone);

    // Check for duplicate phone if phone is being updated
    if (sanitizedPhone) {
      const existing = await this.prisma.member.findUnique({
        where: { phone: sanitizedPhone },
      });
      if (existing && existing.id !== id) {
        throw new BadRequestException('This phone number is already in use by another member.');
      }
    }

    const { nextOfKin, balance, loanBalance, active, ...rest } = dto;

    const dataToUpdate: any = {};

    const directStrings: Array<keyof typeof rest> = [
      'name',
      'role',
      'physicalAddress',
      'town',
      'introducerName',
      'introducerMemberNo',
    ];

    Object.keys(rest).forEach((field) => {
      if (directStrings.includes(field as any) && rest[field] !== undefined) {
        const trimmed = trimToUndefined(rest[field]);
        if (trimmed !== undefined) dataToUpdate[field] = trimmed;
      }
    });

    if (sanitizedPhone !== undefined) dataToUpdate.phone = sanitizedPhone;

    dataToUpdate.dob = nullIfEmpty(rest.dob);
    dataToUpdate.email = nullIfEmpty(rest.email);
    dataToUpdate.idNumber = nullIfEmpty(rest.idNumber);
    dataToUpdate.gender = nullIfEmpty(rest.gender);
    dataToUpdate.employmentStatus = nullIfEmpty(rest.employmentStatus);
    dataToUpdate.employerName = nullIfEmpty(rest.employerName);
    dataToUpdate.regNo = nullIfEmpty(rest.regNo);
    dataToUpdate.employerAddress = nullIfEmpty(rest.employerAddress);

    if (balance !== undefined) {
      const bal = typeof balance === 'string' ? parseFloat(balance) : balance;
      if (bal === undefined || isNaN(bal)) {
        throw new BadRequestException('Invalid balance amount');
      }
      dataToUpdate.balance = bal;
    }

    if (loanBalance !== undefined) {
      const lBal = typeof loanBalance === 'string' ? parseFloat(loanBalance) : loanBalance;
      if (lBal === undefined || isNaN(lBal)) {
        throw new BadRequestException('Invalid loan balance amount');
      }
      dataToUpdate.loanBalance = lBal;
    }

    if (active !== undefined) {
      dataToUpdate.active = Boolean(active);
    }

    if (nextOfKin !== undefined) {
      dataToUpdate.nextOfKin = nextOfKin ? JSON.parse(JSON.stringify(nextOfKin)) : null;
    }

    delete (dataToUpdate as any).customRole;

    return this.prisma.member.update({
      where: { id },
      data: dataToUpdate,
    });
  }

  async suspend(id: number) {
    await this.findOne(id);
    return this.prisma.member.update({
      where: { id },
      data: { active: false },
    });
  }

  async reactivate(id: number) {
    await this.findOne(id);
    return this.prisma.member.update({
      where: { id },
      data: { active: true },
    });
  }

  async delete(id: number) {
    await this.findOne(id);
    return this.prisma.member.delete({ where: { id } });
  }

  async ledger(id: number) {
    const member = await this.findOne(id);
    return member;
  }

  async getStats() {
    const [total, active, suspended, members] = await Promise.all([
      this.prisma.member.count(),
      this.prisma.member.count({ where: { active: true } }),
      this.prisma.member.count({ where: { active: false } }),
      this.prisma.member.findMany({
        include: {
          ledger: {
            select: {
              amount: true,
              type: true,
            },
          },
        },
      }),
    ]);

    // Calculate total balance from all members' ledgers
    const totalBalance = members.reduce((sum, member) => {
      const memberBalance = member.ledger.reduce((memberSum, entry) => {
        const amount = Number(entry.amount);
        const credits = ['contribution', 'deposit', 'income', 'loan_repayment', 'fine_payment'];
        const debits = ['withdrawal', 'expense', 'loan_disbursement', 'fine', 'transfer_out', 'refund'];

        if (credits.includes(entry.type)) {
          return memberSum + amount;
        }
        if (debits.includes(entry.type)) {
          return memberSum - Math.abs(amount);
        }
        return memberSum;
      }, 0);
      return sum + memberBalance;
    }, 0);

    return {
      total,
      active,
      suspended,
      totalBalance: Math.round(totalBalance * 100) / 100,
    };
  }
}
