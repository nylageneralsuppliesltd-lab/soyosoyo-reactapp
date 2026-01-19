import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class DepositsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    try {
      // Transform and validate incoming data
      const depositData = {
        memberName: data.memberName?.trim() || 'Unspecified',
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

      // Validate required fields
      if (!depositData.memberName || !depositData.amount || depositData.amount <= 0) {
        throw new BadRequestException('Member name and valid amount are required');
      }

      return this.prisma.deposit.create({ data: depositData });
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
}
