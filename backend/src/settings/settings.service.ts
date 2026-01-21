import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  // ============== ACCOUNTS ==============
  async getAccounts() {
    return this.prisma.account.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAccount(data: any) {
    return this.prisma.account.create({ data });
  }

  async updateAccount(id: number, data: any) {
    return this.prisma.account.update({ where: { id }, data });
  }

  async deleteAccount(id: number) {
    return this.prisma.account.delete({ where: { id } });
  }

  // ============== CONTRIBUTION TYPES ==============
  async getContributionTypes() {
    return this.prisma.contributionType.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createContributionType(data: any) {
    return this.prisma.contributionType.create({ data });
  }

  async updateContributionType(id: number, data: any) {
    return this.prisma.contributionType.update({ where: { id }, data });
  }

  async deleteContributionType(id: number) {
    return this.prisma.contributionType.delete({ where: { id } });
  }

  // ============== EXPENSE CATEGORIES ==============
  async getExpenseCategories() {
    return this.prisma.expenseCategory.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createExpenseCategory(data: any) {
    return this.prisma.expenseCategory.create({ data });
  }

  async updateExpenseCategory(id: number, data: any) {
    return this.prisma.expenseCategory.update({ where: { id }, data });
  }

  async deleteExpenseCategory(id: number) {
    return this.prisma.expenseCategory.delete({ where: { id } });
  }

  // ============== INCOME CATEGORIES ==============
  async getIncomeCategories() {
    return this.prisma.incomeCategory.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createIncomeCategory(data: any) {
    return this.prisma.incomeCategory.create({ data });
  }

  async updateIncomeCategory(id: number, data: any) {
    return this.prisma.incomeCategory.update({ where: { id }, data });
  }

  async deleteIncomeCategory(id: number) {
    return this.prisma.incomeCategory.delete({ where: { id } });
  }

  // ============== FINE CATEGORIES ==============
  async getFineCategories() {
    return this.prisma.fineCategory.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createFineCategory(data: any) {
    return this.prisma.fineCategory.create({ data });
  }

  async updateFineCategory(id: number, data: any) {
    return this.prisma.fineCategory.update({ where: { id }, data });
  }

  async deleteFineCategory(id: number) {
    return this.prisma.fineCategory.delete({ where: { id } });
  }

  // ============== GROUP ROLES ==============
  async getGroupRoles() {
    return this.prisma.groupRole.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createGroupRole(data: any) {
    return this.prisma.groupRole.create({ data });
  }

  async updateGroupRole(id: number, data: any) {
    return this.prisma.groupRole.update({ where: { id }, data });
  }

  async deleteGroupRole(id: number) {
    return this.prisma.groupRole.delete({ where: { id } });
  }

  // ============== INVOICE TEMPLATES ==============
  async getInvoiceTemplates() {
    return this.prisma.invoiceTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInvoiceTemplate(data: any) {
    return this.prisma.invoiceTemplate.create({ data });
  }

  async updateInvoiceTemplate(id: number, data: any) {
    return this.prisma.invoiceTemplate.update({ where: { id }, data });
  }

  async deleteInvoiceTemplate(id: number) {
    return this.prisma.invoiceTemplate.delete({ where: { id } });
  }

  // ============== ASSETS ==============
  async getAssets() {
    return this.prisma.asset.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAsset(data: any) {
    return this.prisma.asset.create({ data });
  }

  async updateAsset(id: number, data: any) {
    return this.prisma.asset.update({ where: { id }, data });
  }

  async deleteAsset(id: number) {
    return this.prisma.asset.delete({ where: { id } });
  }
}
