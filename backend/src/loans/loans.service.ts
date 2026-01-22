import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class LoansService {
  constructor(private prisma: PrismaService) {}

  private normalizeStatus(status?: string) {
    const value = (status || '').toString().toLowerCase();
    if (['active', 'pending', 'closed', 'defaulted'].includes(value)) return value;
    if (value === 'repaid') return 'closed';
    return 'pending';
  }

  async create(data: any) {
    try {
      const amount = data.amount ? parseFloat(data.amount) : 0;
      const loanData = {
        memberName: data.memberName?.trim() || data.borrower?.trim() || 'Unspecified',
        memberId: data.memberId ? parseInt(data.memberId) : null,
        externalName: data.externalName?.trim() || null,
        bankName: data.bankName?.trim() || null,
        contactPerson: data.contactPerson?.trim() || null,
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        idNumber: data.idNumber?.trim() || null,
        accountNumber: data.accountNumber?.trim() || null,
        amount: amount,
        balance: amount,
        interestRate: data.interestRate ? parseFloat(data.interestRate) : (data.rate ? parseFloat(data.rate) : 0),
        interestType: data.interestType || 'flat',
        periodMonths: data.periodMonths ? parseInt(data.periodMonths) : (data.termMonths ? parseInt(data.termMonths) : 12),
        status: this.normalizeStatus(data.status),
        loanDirection: data.loanDirection || 'outward',
        purpose: data.purpose?.trim() || null,
        terms: data.terms?.trim() || null,
        collateral: data.collateral?.trim() || null,
        disbursementDate: data.disbursementDate ? new Date(data.disbursementDate) : (data.startDate ? new Date(data.startDate) : new Date()),
        loanTypeId: data.typeId ? parseInt(data.typeId) : null,
        typeName: data.typeName?.trim() || null,
        disbursementAccount: data.disbursementAccount?.trim() || null,
      };

      if (!loanData.amount || loanData.amount <= 0) {
        throw new BadRequestException('Valid loan amount is required');
      }

      if (!loanData.memberName && !loanData.bankName && !loanData.externalName) {
        throw new BadRequestException('Member name, bank name, or external borrower name is required');
      }

      return this.prisma.loan.create({ 
        data: loanData as any,
        include: { member: true, loanType: true },
      });
    } catch (error) {
      console.error('Loan creation error:', error);
      throw error;
    }
  }

  async findAll(take = 100, skip = 0, filters: any = {}) {
    const where: any = {};

    if (filters.status) {
      where.status = this.normalizeStatus(filters.status);
    }

    if (filters.direction) {
      where.loanDirection = filters.direction;
    }

    if (filters.external === 'true') {
      where.externalName = { not: null };
    }

    if (filters.memberId) {
      where.memberId = parseInt(filters.memberId);
    }

    return {
      data: await this.prisma.loan.findMany({
        where,
        take,
        skip,
        orderBy: { disbursementDate: 'desc' },
        include: { member: true, repayments: true, loanType: true },
      }),
      total: await this.prisma.loan.count({ where }),
    };
  }

  async findOne(id: number) {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: { 
        member: true, 
        repayments: { orderBy: { date: 'desc' } },
        loanType: true,
      },
    });

    if (!loan) {
      throw new NotFoundException(`Loan #${id} not found`);
    }

    return loan;
  }

  async update(id: number, data: any) {
    const loan = await this.prisma.loan.findUnique({ where: { id } });
    if (!loan) {
      throw new NotFoundException(`Loan #${id} not found`);
    }

    const updateData: any = {
      memberName: data.memberName?.trim() ?? data.borrower?.trim(),
      memberId: data.memberId !== undefined ? (data.memberId ? parseInt(data.memberId) : null) : undefined,
      externalName: data.externalName?.trim() ?? undefined,
      bankName: data.bankName?.trim() ?? undefined,
      contactPerson: data.contactPerson?.trim() ?? undefined,
      email: data.email?.trim() ?? undefined,
      phone: data.phone?.trim() ?? undefined,
      idNumber: data.idNumber?.trim() ?? undefined,
      accountNumber: data.accountNumber?.trim() ?? undefined,
      amount: data.amount !== undefined ? parseFloat(data.amount) : undefined,
      balance: data.balance !== undefined ? parseFloat(data.balance) : undefined,
      interestRate: data.interestRate !== undefined ? parseFloat(data.interestRate) : (data.rate !== undefined ? parseFloat(data.rate) : undefined),
      interestType: data.interestType ?? undefined,
      periodMonths: data.periodMonths !== undefined ? parseInt(data.periodMonths) : (data.termMonths !== undefined ? parseInt(data.termMonths) : undefined),
      status: data.status ? this.normalizeStatus(data.status) : undefined,
      loanDirection: data.loanDirection ?? undefined,
      purpose: data.purpose?.trim() ?? undefined,
      terms: data.terms?.trim() ?? undefined,
      collateral: data.collateral?.trim() ?? undefined,
      disbursementDate: data.disbursementDate ? new Date(data.disbursementDate) : (data.startDate ? new Date(data.startDate) : undefined),
      loanTypeId: data.typeId !== undefined ? (data.typeId ? parseInt(data.typeId) : null) : undefined,
      typeName: data.typeName?.trim() ?? undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      disbursementAccount: data.disbursementAccount?.trim() ?? undefined,
    };

    const cleanedUpdate = Object.fromEntries(
      Object.entries(updateData).filter(([, value]) => value !== undefined),
    );

    return this.prisma.loan.update({
      where: { id },
      data: cleanedUpdate,
      include: { member: true, repayments: true, loanType: true },
    });
  }

  async remove(id: number) {
    const loan = await this.prisma.loan.findUnique({ where: { id } });
    if (!loan) {
      throw new NotFoundException(`Loan #${id} not found`);
    }

    if (loan.status === 'active' || loan.status === 'defaulted') {
      throw new BadRequestException('Cannot delete active or defaulted loans');
    }

    return this.prisma.loan.delete({ where: { id } });
  }

  async findByMember(memberId: number) {
    return this.prisma.loan.findMany({
      where: { memberId },
      orderBy: { disbursementDate: 'desc' },
      include: { repayments: true, loanType: true },
    });
  }

  async findByStatus(status: string) {
    return this.prisma.loan.findMany({
      where: { status: this.normalizeStatus(status) as any },
      orderBy: { disbursementDate: 'desc' },
      include: { member: true, repayments: true, loanType: true },
    });
  }

  async approveLoan(id: number) {
    const loan = await this.prisma.loan.findUnique({ where: { id } });
    if (!loan) {
      throw new NotFoundException(`Loan #${id} not found`);
    }

    if (loan.status !== 'pending') {
      throw new BadRequestException('Only pending loans can be approved');
    }

    return this.prisma.loan.update({
      where: { id },
      data: { status: 'active' },
      include: { member: true, repayments: true, loanType: true },
    });
  }

  async getLoanStatistics(direction?: string) {
    const where = direction ? { loanDirection: direction as any } : {};

    const [total, active, pending, closed, defaulted, totalAmount, outstandingBalance] = await Promise.all([
      this.prisma.loan.count({ where }),
      this.prisma.loan.count({ where: { ...where, status: 'active' } }),
      this.prisma.loan.count({ where: { ...where, status: 'pending' } }),
      this.prisma.loan.count({ where: { ...where, status: 'closed' } }),
      this.prisma.loan.count({ where: { ...where, status: 'defaulted' } }),
      this.prisma.loan.aggregate({
        where,
        _sum: { amount: true },
      }),
      this.prisma.loan.aggregate({
        where,
        _sum: { balance: true },
      }),
    ]);

    return {
      total,
      active,
      pending,
      closed,
      defaulted,
      totalAmount: parseFloat((totalAmount._sum.amount || 0).toString()),
      outstandingBalance: parseFloat((outstandingBalance._sum.balance || 0).toString()),
    };
  }
}

