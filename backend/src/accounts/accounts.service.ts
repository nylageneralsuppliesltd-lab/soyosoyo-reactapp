import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async getAllAccounts() {
    return this.prisma.account.findMany({
      orderBy: { type: 'asc' },
      select: {
        id: true,
        type: true,
        name: true,
        bankName: true,
        accountNumber: true,
        provider: true,
        number: true,
        balance: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async getAccountsByType(type: string) {
    return this.prisma.account.findMany({
      where: { type: type as any },
      orderBy: { name: 'asc' },
    });
  }

  async createAccount(data: any) {
    return this.prisma.account.create({
      data: {
        ...data,
        balance: data.balance || 0,
      },
    });
  }

  async updateAccount(id: number, data: any) {
    return this.prisma.account.update({
      where: { id },
      data,
    });
  }

  async deleteAccount(id: number) {
    return this.prisma.account.delete({ where: { id } });
  }

  async getAccountBalance(id: number) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      select: { balance: true, name: true },
    });
    return account;
  }

  async updateAccountBalance(id: number, amount: number) {
    return this.prisma.account.update({
      where: { id },
      data: {
        balance: {
          increment: amount,
        },
      },
    });
  }
}
