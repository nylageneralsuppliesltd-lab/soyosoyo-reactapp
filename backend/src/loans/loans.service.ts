import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class LoansService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    try {
      // Transform and validate incoming data
      const amount = data.amount ? parseFloat(data.amount) : 0;
      const loanData = {
        memberName: data.borrower?.trim() || data.memberName?.trim() || 'Unspecified',
        memberId: data.borrowerId ? parseInt(data.borrowerId) : (data.memberId ? parseInt(data.memberId) : null),
        amount: amount,
        balance: amount, // Initial balance equals amount
        interestRate: data.rate ? parseFloat(data.rate) : 0,
        interestType: data.interestType || 'flat',
        periodMonths: data.termMonths ? parseInt(data.termMonths) : 0,
        status: data.status || 'pending',
        loanDirection: data.loanDirection || 'outward',
        purpose: data.purpose?.trim() || null,
        disbursementDate: data.startDate ? new Date(data.startDate) : new Date(),
        typeName: data.typeName?.trim() || null,
        bankName: data.bankName?.trim() || null,
      };

      // Validate required fields
      if (!loanData.memberName || !loanData.amount || loanData.amount <= 0) {
        throw new BadRequestException('Borrower name and valid amount are required');
      }

      return this.prisma.loan.create({ data: loanData });
    } catch (error) {
      console.error('Loan creation error:', error);
      throw error;
    }
  }

  async findAll(take = 100, skip = 0) {
    return this.prisma.loan.findMany({
      take,
      skip,
      orderBy: { disbursementDate: 'desc' },
      include: { member: true, repayments: true },
    });
  }

  async findOne(id: number) {
    return this.prisma.loan.findUnique({
      where: { id },
      include: { member: true, repayments: { orderBy: { date: 'desc' } } },
    });
  }

  async update(id: number, data: any) {
    return this.prisma.loan.update({
      where: { id },
      data,
      include: { member: true, repayments: true },
    });
  }

  async remove(id: number) {
    return this.prisma.loan.delete({ where: { id } });
  }

  async findByMember(memberId: number) {
    return this.prisma.loan.findMany({
      where: { memberId },
      orderBy: { disbursementDate: 'desc' },
      include: { repayments: true },
    });
  }

  async findByStatus(status: string) {
    return this.prisma.loan.findMany({
      where: { status: status as any },
      orderBy: { disbursementDate: 'desc' },
      include: { member: true, repayments: true },
    });
  }
}

