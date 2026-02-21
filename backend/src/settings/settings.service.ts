import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CategoryLedgerService } from '../category-ledger/category-ledger.service';

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private categoryLedgerService: CategoryLedgerService,
  ) {}

  private toNumber(value: any, fallback?: number) {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toInteger(value: any, fallback?: number) {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toBoolean(value: any, fallback?: boolean) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
      if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    }
    return fallback;
  }

  private toDate(value: any) {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private cleanString(value: any) {
    if (value === null || value === undefined) return undefined;
    const cleaned = String(value).trim();
    return cleaned.length ? cleaned : undefined;
  }

  private sanitizeContributionType(data: any) {
    return {
      name: this.cleanString(data?.name) || 'Unnamed',
      amount: this.toNumber(data?.amount, 0),
      description: this.cleanString(data?.description),
      frequency: this.cleanString(data?.frequency),
      typeCategory: this.cleanString(data?.typeCategory),
      dayOfMonth: this.cleanString(data?.dayOfMonth),
      invoiceDate: this.toDate(data?.invoiceDate),
      dueDate: this.toDate(data?.dueDate),
      smsNotifications: this.toBoolean(data?.smsNotifications, true),
      emailNotifications: this.toBoolean(data?.emailNotifications, false),
      finesEnabled: this.toBoolean(data?.finesEnabled, false),
      lateFineEnabled: this.toBoolean(data?.lateFineEnabled, false),
      lateFineAmount: this.toNumber(data?.lateFineAmount, 0),
      lateFineGraceDays: this.toInteger(data?.lateFineGraceDays, 0),
      invoiceAllMembers: this.toBoolean(data?.invoiceAllMembers, true),
      visibleInvoicing: this.toBoolean(data?.visibleInvoicing, true),
    };
  }

  private sanitizeExpenseCategory(data: any) {
    return {
      name: this.cleanString(data?.name) || 'Unnamed',
      description: this.cleanString(data?.description),
      nature: this.cleanString(data?.nature),
    };
  }

  private sanitizeIncomeCategory(data: any) {
    return {
      name: this.cleanString(data?.name) || 'Unnamed',
      description: this.cleanString(data?.description),
    };
  }

  private sanitizeFineCategory(data: any) {
    return {
      name: this.cleanString(data?.name) || 'Unnamed',
    };
  }

  private sanitizeGroupRole(data: any) {
    return {
      name: this.cleanString(data?.name) || 'Unnamed',
      description: this.cleanString(data?.description),
      permissions: Array.isArray(data?.permissions) ? data.permissions : undefined,
    };
  }

  private sanitizeInvoiceTemplate(data: any) {
    return {
      type: this.cleanString(data?.type),
      sendTo: this.cleanString(data?.sendTo),
      amount: this.toNumber(data?.amount, 0),
      invoiceDate: this.toDate(data?.invoiceDate),
      dueDate: this.toDate(data?.dueDate),
      description: this.cleanString(data?.description),
    };
  }

  private stripUndefined<T extends Record<string, any>>(obj: T) {
    return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
  }

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
    return this.prisma.contributionType.create({ data: this.sanitizeContributionType(data) });
  }

  async updateContributionType(id: number, data: any) {
    return this.prisma.contributionType.update({
      where: { id },
      data: this.sanitizeContributionType(data),
    });
  }

  async deleteContributionType(id: number) {
    return this.prisma.contributionType.delete({ where: { id } });
  }

  // ============== EXPENSE CATEGORIES ==============
  async getExpenseCategories() {
    return this.prisma.expenseCategory.findMany({
      orderBy: { name: 'asc' },
      include: { categoryLedger: true },
    });
  }

  async createExpenseCategory(data: any) {
    const category = await this.prisma.expenseCategory.create({
      data: this.sanitizeExpenseCategory(data),
    });
    
    // Auto-create category ledger
    await this.categoryLedgerService.createCategoryLedger(
      'expense',
      category.id,
      category.name,
    );

    return this.prisma.expenseCategory.findUnique({
      where: { id: category.id },
      include: { categoryLedger: true },
    });
  }

  async updateExpenseCategory(id: number, data: any) {
    return this.prisma.expenseCategory.update({
      where: { id },
      data: this.sanitizeExpenseCategory(data),
    });
  }

  async deleteExpenseCategory(id: number) {
    return this.prisma.expenseCategory.delete({ where: { id } });
  }

  // ============== INCOME CATEGORIES ==============
  async getIncomeCategories() {
    return this.prisma.incomeCategory.findMany({
      orderBy: { name: 'asc' },
      include: { categoryLedger: true },
    });
  }

  async createIncomeCategory(data: any) {
    const category = await this.prisma.incomeCategory.create({
      data: this.sanitizeIncomeCategory(data),
    });
    
    // Auto-create category ledger
    await this.categoryLedgerService.createCategoryLedger(
      'income',
      category.id,
      category.name,
    );

    return this.prisma.incomeCategory.findUnique({
      where: { id: category.id },
      include: { categoryLedger: true },
    });
  }

  async updateIncomeCategory(id: number, data: any) {
    return this.prisma.incomeCategory.update({
      where: { id },
      data: this.sanitizeIncomeCategory(data),
    });
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
    return this.prisma.fineCategory.create({ data: this.sanitizeFineCategory(data) });
  }

  async updateFineCategory(id: number, data: any) {
    return this.prisma.fineCategory.update({
      where: { id },
      data: this.sanitizeFineCategory(data),
    });
  }

  async deleteFineCategory(id: number) {
    return this.prisma.fineCategory.delete({ where: { id } });
  }

  // ============== LOAN TYPES ==============
  async getLoanTypes() {
    return this.prisma.loanType.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createLoanType(data: any) {
    return this.prisma.loanType.create({ data });
  }

  async updateLoanType(id: number, data: any) {
    return this.prisma.loanType.update({ where: { id }, data });
  }

  async deleteLoanType(id: number) {
    return this.prisma.loanType.delete({ where: { id } });
  }

  // ============== GROUP ROLES ==============
  async getGroupRoles() {
    return this.prisma.groupRole.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createGroupRole(data: any) {
    return this.prisma.groupRole.create({ data: this.sanitizeGroupRole(data) });
  }

  async updateGroupRole(id: number, data: any) {
    return this.prisma.groupRole.update({
      where: { id },
      data: this.sanitizeGroupRole(data),
    });
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
    return this.prisma.invoiceTemplate.create({
      data: this.sanitizeInvoiceTemplate(data),
    });
  }

  async updateInvoiceTemplate(id: number, data: any) {
    return this.prisma.invoiceTemplate.update({
      where: { id },
      data: this.sanitizeInvoiceTemplate(data),
    });
  }

  // ============== SYSTEM SETTINGS ==============
  async getSystemSettings() {
    const defaults = {
      organizationName: 'SOYOSOYO MEDICARE COOPERATE SAVINGS AND CREDIT SOCIETY',
      maxLoanMultiple: 3,
      defaultLoanTermMonths: 12,
      defaultInterestRate: 10,
      enableFines: true,
      finePercentage: 2,
      currency: 'KES',
      fiscalYearStart: '01-01',
    };

    const record = await this.prisma.iFRSConfig.findUnique({ where: { key: 'system_settings' } });
    if (!record?.value) {
      return defaults;
    }

    try {
      const parsed = JSON.parse(record.value);
      return {
        ...defaults,
        ...parsed,
      };
    } catch {
      return defaults;
    }
  }

  async updateSystemSettings(data: any) {
    const payload = {
      organizationName: this.cleanString(data?.organizationName) || 'SOYOSOYO MEDICARE COOPERATE SAVINGS AND CREDIT SOCIETY',
      maxLoanMultiple: this.toNumber(data?.maxLoanMultiple, 3),
      defaultLoanTermMonths: this.toInteger(data?.defaultLoanTermMonths, 12),
      defaultInterestRate: this.toNumber(data?.defaultInterestRate, 10),
      enableFines: this.toBoolean(data?.enableFines, true),
      finePercentage: this.toNumber(data?.finePercentage, 2),
      currency: this.cleanString(data?.currency) || 'KES',
      fiscalYearStart: this.cleanString(data?.fiscalYearStart) || '01-01',
    };

    const upserted = await this.prisma.iFRSConfig.upsert({
      where: { key: 'system_settings' },
      create: {
        key: 'system_settings',
        value: JSON.stringify(payload),
        description: 'Global system configuration settings',
      },
      update: {
        value: JSON.stringify(payload),
      },
    });

    return {
      ...payload,
      updatedAt: upserted.updatedAt,
    };
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

  // ============== SHARE VALUE ==============
  async getShareValue() {
    // Return a default share value if not found in database
    // This is a simple configuration value, stored as an Asset with a special name
    try {
      const shareValueRecord = await this.prisma.asset.findFirst({
        where: { name: '__SHARE_VALUE__' },
      });
      if (shareValueRecord) {
        return { value: Number(shareValueRecord.currentValue) };
      }
    } catch (error) {
      // If Asset model doesn't have these fields, return default
    }
    return { value: 100 }; // Default share value
  }

  async updateShareValue(data: any) {
    // Update or create share value configuration
    const { value } = data;
    if (!value || isNaN(parseFloat(value))) {
      throw new Error('Invalid share value');
    }
    try {
      const existing = await this.prisma.asset.findFirst({
        where: { name: '__SHARE_VALUE__' },
      });
      if (existing) {
        return this.prisma.asset.update({
          where: { id: existing.id },
          data: { currentValue: parseFloat(value) },
        });
      } else {
        return this.prisma.asset.create({
          data: {
            name: '__SHARE_VALUE__',
            category: 'configuration',
            description: 'Share value configuration',
            purchasePrice: parseFloat(value),
            purchaseDate: new Date(),
            purchaseAccountId: 1,
            currentValue: parseFloat(value),
            status: 'active',
          },
        });
      }
    } catch (error) {
      // If Asset model doesn't support this, return the value as-is
      return { value: parseFloat(value) };
    }
  }
}
