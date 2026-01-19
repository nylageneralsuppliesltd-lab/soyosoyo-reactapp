import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class WithdrawalsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    try {
      // Transform and validate incoming data
      const withdrawalData = {
        memberName: data.memberName?.trim() || 'Unspecified',
        memberId: data.memberId ? parseInt(data.memberId) : null,
        amount: data.amount ? parseFloat(data.amount) : 0,
        method: data.method || 'cash',
        purpose: data.purpose?.trim() || null,
        date: data.date ? new Date(data.date) : new Date(),
        notes: data.notes?.trim() || null,
        type: data.type || 'refund',
        category: data.category?.trim() || null,
        description: data.description?.trim() || null,
        narration: data.narration?.trim() || null,
        accountId: data.accountId ? parseInt(data.accountId) : null,
      };

      // Validate required fields
      if (!withdrawalData.memberName || !withdrawalData.amount || withdrawalData.amount <= 0) {
        throw new BadRequestException('Member name and valid amount are required');
      }

      return this.prisma.withdrawal.create({ data: withdrawalData });
    } catch (error) {
      console.error('Withdrawal creation error:', error);
      throw error;
    }
  }

  async findAll(take = 100, skip = 0) {
    return this.prisma.withdrawal.findMany({
      take,
      skip,
      orderBy: { date: 'desc' },
      include: { member: true },
    });
  }

  async findOne(id: number) {
    return this.prisma.withdrawal.findUnique({
      where: { id },
      include: { member: true },
    });
  }

  async update(id: number, data: any) {
    return this.prisma.withdrawal.update({
      where: { id },
      data,
      include: { member: true },
    });
  }

  async remove(id: number) {
    return this.prisma.withdrawal.delete({ where: { id } });
  }

  async findByMember(memberId: number) {
    return this.prisma.withdrawal.findMany({
      where: { memberId },
      orderBy: { date: 'desc' },
    });
  }
}
