import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CategoryLedgerService } from '../category-ledger/category-ledger.service';
import { ReportsService } from '../reports/reports.service';

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private categoryLedgerService: CategoryLedgerService,
    private reportsService: ReportsService,
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

  private resolveDeclarationRange(declarationDate: string, fiscalYearStart?: string | null) {
    let endDate = new Date(declarationDate);
    if (Number.isNaN(endDate.getTime())) {
      endDate = new Date();
    }

    const fiscalParts = (fiscalYearStart || '01-01').split('-').map((part) => parseInt(part, 10));
    const fiscalMonth = Number.isFinite(fiscalParts[0]) ? Math.min(Math.max(fiscalParts[0], 1), 12) : 1;
    const fiscalDay = Number.isFinite(fiscalParts[1]) ? Math.min(Math.max(fiscalParts[1], 1), 28) : 1;

    let year = endDate.getFullYear();
    const fiscalStartThisYear = new Date(year, fiscalMonth - 1, fiscalDay);
    if (endDate < fiscalStartThisYear) {
      year -= 1;
    }

    const startDate = new Date(year, fiscalMonth - 1, fiscalDay);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    return { start: startDate, end: endDate };
  }

  private sanitizeContributionType(data: any) {
    const name = this.cleanString(data?.name);
    const amount = this.toNumber(data?.amount);
    
    // Validate required fields
    if (!name) throw new Error('Contribution type name is required');
    if (!Number.isFinite(amount) || amount === 0) throw new Error('Contribution type amount is required and must be greater than 0');
    
    // Return object with all fields - undefined optional fields will be filtered by Prisma
    return {
      name,
      amount,
      description: this.cleanString(data?.description),
      frequency: this.cleanString(data?.frequency),
      typeCategory: this.cleanString(data?.typeCategory),
      accountingGroup: this.cleanString(data?.accountingGroup) || 'member_savings',
      payoutMode: this.cleanString(data?.payoutMode) || 'dividend',
      eligibleForDividend: this.toBoolean(data?.eligibleForDividend, true),
      countsForLoanQualification: this.toBoolean(data?.countsForLoanQualification, true),
      annualReturnRate: this.toNumber(data?.annualReturnRate, 0),
      useDateWeightedEarnings: this.toBoolean(data?.useDateWeightedEarnings, true),
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
    const name = this.cleanString(data?.name);
    
    if (!name) throw new Error('Expense category name is required');
    
    return {
      name,
      description: this.cleanString(data?.description),
      nature: this.cleanString(data?.nature),
    };
  }

  private sanitizeIncomeCategory(data: any) {
    const name = this.cleanString(data?.name);
    
    if (!name) throw new Error('Income category name is required');
    
    return {
      name,
      description: this.cleanString(data?.description),
      isExternalInterest: this.toBoolean(data?.isExternalInterest, false),
    };
  }

  private sanitizeFineCategory(data: any) {
    const name = this.cleanString(data?.name);
    
    if (!name) throw new Error('Fine category name is required');
    
    return {
      name,
    };
  }

  private sanitizeGroupRole(data: any) {
    const name = this.cleanString(data?.name);
    
    if (!name) throw new Error('Group role name is required');
    
    return {
      name,
      description: this.cleanString(data?.description),
      permissions: Array.isArray(data?.permissions) ? data.permissions : undefined,
    };
  }

  private sanitizeInvoiceTemplate(data: any) {
    const type = this.cleanString(data?.type);
    const sendTo = this.cleanString(data?.sendTo);
    const invoiceDate = this.toDate(data?.invoiceDate);
    const dueDate = this.toDate(data?.dueDate);
    
    if (!type) throw new Error('Invoice template type is required');
    if (!sendTo) throw new Error('Invoice recipient (sendTo) is required');
    if (!invoiceDate) throw new Error('Invoice date is required');
    if (!dueDate) throw new Error('Due date is required');
    
    return {
      type,
      sendTo,
      amount: this.toNumber(data?.amount, 0),
      invoiceDate,
      dueDate,
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
      disqualifyInactiveMembers: true,
      maxConsecutiveMissedContributionMonths: 3,
      disqualifyGuarantorOfDelinquentLoan: true,
      requireFullShareCapitalForDividends: false,
      minimumShareCapitalForDividends: 0,
      allowDividendReinstatementAfterConsecutivePayments: true,
      reinstatementConsecutivePaymentMonths: 3,
      dividendAllocationMode: 'weighted',
      shareCapitalDividendPercent: 50,
      memberSavingsDividendPercent: 50,
      dividendIndicativePrudencePercent: 90,
      dividendWithholdingResidentPercent: 0,
      dividendWithholdingNonResidentPercent: 0,
      interestWithholdingResidentPercent: 0,
      interestWithholdingNonResidentPercent: 0,
      externalInterestTaxablePercent: 50,
      externalInterestTaxRatePercent: 30,
      dividendDeclarationLocked: false,
      dividendDeclarationDate: null,
      dividendDeclaredAt: null,
      dividendDeclaredBy: null,
      dividendDeclarationNotes: null,
      dividendDeclarationSnapshot: null,
      dividendUnlockedAt: null,
      dividendUnlockedBy: null,
      dividendUnlockReason: null,
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
    const current = await this.getSystemSettings();

    const payload = {
      organizationName: this.cleanString(data?.organizationName) || 'SOYOSOYO MEDICARE COOPERATE SAVINGS AND CREDIT SOCIETY',
      maxLoanMultiple: this.toNumber(data?.maxLoanMultiple, 3),
      defaultLoanTermMonths: this.toInteger(data?.defaultLoanTermMonths, 12),
      defaultInterestRate: this.toNumber(data?.defaultInterestRate, 10),
      enableFines: this.toBoolean(data?.enableFines, true),
      finePercentage: this.toNumber(data?.finePercentage, 2),
      currency: this.cleanString(data?.currency) || 'KES',
      fiscalYearStart: this.cleanString(data?.fiscalYearStart) || '01-01',
      disqualifyInactiveMembers: this.toBoolean(data?.disqualifyInactiveMembers, true),
      maxConsecutiveMissedContributionMonths: this.toInteger(data?.maxConsecutiveMissedContributionMonths, 3),
      disqualifyGuarantorOfDelinquentLoan: this.toBoolean(data?.disqualifyGuarantorOfDelinquentLoan, true),
      requireFullShareCapitalForDividends: this.toBoolean(data?.requireFullShareCapitalForDividends, false),
      minimumShareCapitalForDividends: this.toNumber(data?.minimumShareCapitalForDividends, 0),
      allowDividendReinstatementAfterConsecutivePayments: this.toBoolean(data?.allowDividendReinstatementAfterConsecutivePayments, true),
      reinstatementConsecutivePaymentMonths: this.toInteger(data?.reinstatementConsecutivePaymentMonths, 3),
      dividendAllocationMode: this.cleanString(data?.dividendAllocationMode) || 'weighted',
      shareCapitalDividendPercent: this.toNumber(data?.shareCapitalDividendPercent, 50),
      memberSavingsDividendPercent: this.toNumber(data?.memberSavingsDividendPercent, 50),
      dividendIndicativePrudencePercent: this.toNumber(data?.dividendIndicativePrudencePercent, 90),
      dividendWithholdingResidentPercent: this.toNumber(data?.dividendWithholdingResidentPercent, 0),
      dividendWithholdingNonResidentPercent: this.toNumber(data?.dividendWithholdingNonResidentPercent, 0),
      interestWithholdingResidentPercent: this.toNumber(data?.interestWithholdingResidentPercent, 0),
      interestWithholdingNonResidentPercent: this.toNumber(data?.interestWithholdingNonResidentPercent, 0),
      externalInterestTaxablePercent: this.toNumber(data?.externalInterestTaxablePercent, 50),
      externalInterestTaxRatePercent: this.toNumber(data?.externalInterestTaxRatePercent, 30),
      dividendDeclarationLocked: this.toBoolean(data?.dividendDeclarationLocked, current.dividendDeclarationLocked ?? false),
      dividendDeclarationDate: this.cleanString(data?.dividendDeclarationDate) || current.dividendDeclarationDate || null,
      dividendDeclaredAt: this.cleanString(data?.dividendDeclaredAt) || current.dividendDeclaredAt || null,
      dividendDeclaredBy: this.cleanString(data?.dividendDeclaredBy) || current.dividendDeclaredBy || null,
      dividendDeclarationNotes: this.cleanString(data?.dividendDeclarationNotes) || current.dividendDeclarationNotes || null,
      dividendDeclarationSnapshot: data?.dividendDeclarationSnapshot ?? current.dividendDeclarationSnapshot ?? null,
      dividendUnlockedAt: this.cleanString(data?.dividendUnlockedAt) || current.dividendUnlockedAt || null,
      dividendUnlockedBy: this.cleanString(data?.dividendUnlockedBy) || current.dividendUnlockedBy || null,
      dividendUnlockReason: this.cleanString(data?.dividendUnlockReason) || current.dividendUnlockReason || null,
    };

    // Freeze declaration-critical settings while declaration is locked.
    if (current.dividendDeclarationLocked) {
      payload.disqualifyInactiveMembers = current.disqualifyInactiveMembers;
      payload.maxConsecutiveMissedContributionMonths = current.maxConsecutiveMissedContributionMonths;
      payload.disqualifyGuarantorOfDelinquentLoan = current.disqualifyGuarantorOfDelinquentLoan;
      payload.requireFullShareCapitalForDividends = current.requireFullShareCapitalForDividends;
      payload.minimumShareCapitalForDividends = current.minimumShareCapitalForDividends;
      payload.allowDividendReinstatementAfterConsecutivePayments = current.allowDividendReinstatementAfterConsecutivePayments;
      payload.reinstatementConsecutivePaymentMonths = current.reinstatementConsecutivePaymentMonths;
      payload.dividendAllocationMode = current.dividendAllocationMode;
      payload.shareCapitalDividendPercent = current.shareCapitalDividendPercent;
      payload.memberSavingsDividendPercent = current.memberSavingsDividendPercent;
      payload.dividendIndicativePrudencePercent = current.dividendIndicativePrudencePercent;
      payload.dividendWithholdingResidentPercent = current.dividendWithholdingResidentPercent;
      payload.dividendWithholdingNonResidentPercent = current.dividendWithholdingNonResidentPercent;
      payload.interestWithholdingResidentPercent = current.interestWithholdingResidentPercent;
      payload.interestWithholdingNonResidentPercent = current.interestWithholdingNonResidentPercent;
      payload.externalInterestTaxablePercent = current.externalInterestTaxablePercent;
      payload.externalInterestTaxRatePercent = current.externalInterestTaxRatePercent;
      payload.dividendDeclarationLocked = true;
      payload.dividendDeclarationDate = current.dividendDeclarationDate;
      payload.dividendDeclaredAt = current.dividendDeclaredAt;
      payload.dividendDeclaredBy = current.dividendDeclaredBy;
      payload.dividendDeclarationNotes = current.dividendDeclarationNotes;
      payload.dividendDeclarationSnapshot = current.dividendDeclarationSnapshot;
    }

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

  async getDividendDeclaration() {
    const settings = await this.getSystemSettings();
    return {
      dividendDeclarationLocked: settings.dividendDeclarationLocked,
      dividendDeclarationDate: settings.dividendDeclarationDate,
      dividendDeclaredAt: settings.dividendDeclaredAt,
      dividendDeclaredBy: settings.dividendDeclaredBy,
      dividendDeclarationNotes: settings.dividendDeclarationNotes,
      dividendDeclarationSnapshot: settings.dividendDeclarationSnapshot,
      dividendUnlockedAt: settings.dividendUnlockedAt,
      dividendUnlockedBy: settings.dividendUnlockedBy,
      dividendUnlockReason: settings.dividendUnlockReason,
    };
  }

  async lockDividendDeclaration(data: any) {
    const current = await this.getSystemSettings();
    if (current.dividendDeclarationLocked) {
      return {
        ...current,
        message: 'Dividend declaration is already locked.',
      };
    }

    const now = new Date().toISOString();
    const declarationDate = this.cleanString(data?.dividendDeclarationDate) || new Date().toISOString().split('T')[0];
    const declaredBy = this.cleanString(data?.declaredBy) || 'Admin';
    const notes = this.cleanString(data?.notes) || null;

    const declarationRange = this.resolveDeclarationRange(declarationDate, current.fiscalYearStart);
    const recommendation = await this.reportsService.dividendRecommendation(declarationRange);

    const snapshot = {
      declarationDate,
      periodStart: declarationRange.start.toISOString().split('T')[0],
      periodEnd: declarationRange.end.toISOString().split('T')[0],
      dividendAllocationMode: current.dividendAllocationMode,
      shareCapitalDividendPercent: current.shareCapitalDividendPercent,
      memberSavingsDividendPercent: current.memberSavingsDividendPercent,
      disqualifyInactiveMembers: current.disqualifyInactiveMembers,
      maxConsecutiveMissedContributionMonths: current.maxConsecutiveMissedContributionMonths,
      disqualifyGuarantorOfDelinquentLoan: current.disqualifyGuarantorOfDelinquentLoan,
      requireFullShareCapitalForDividends: current.requireFullShareCapitalForDividends,
      minimumShareCapitalForDividends: current.minimumShareCapitalForDividends,
      allowDividendReinstatementAfterConsecutivePayments: current.allowDividendReinstatementAfterConsecutivePayments,
      reinstatementConsecutivePaymentMonths: current.reinstatementConsecutivePaymentMonths,
      capturedAt: now,
      capturedBy: declaredBy,
      notes,
      totals: {
        totalOperatingIncome: recommendation?.meta?.totalOperatingIncome ?? 0,
        operatingExpenses: recommendation?.meta?.operatingExpenses ?? 0,
        totalProvisions: recommendation?.meta?.totalProvisions ?? 0,
        netOperatingSurplus: recommendation?.meta?.netOperatingSurplus ?? 0,
        capitalReserveAllocation: recommendation?.meta?.capitalReserveAllocation ?? 0,
        distributableSurplus: recommendation?.meta?.distributableSurplus ?? 0,
        totalInterestPayout: recommendation?.meta?.totalInterestPayout ?? 0,
        dividendPoolAvailable: recommendation?.meta?.dividendPoolAvailable ?? 0,
        shareCapitalPool: recommendation?.dividends?.shareCapitalPool ?? 0,
        memberSavingsPool: recommendation?.dividends?.memberSavingsPool ?? 0,
        totalWeightedDividendBase: recommendation?.dividends?.totalWeightedDividendBase ?? 0,
      },
    };

    const payload = {
      ...current,
      dividendDeclarationLocked: true,
      dividendDeclarationDate: declarationDate,
      dividendDeclaredAt: now,
      dividendDeclaredBy: declaredBy,
      dividendDeclarationNotes: notes,
      dividendDeclarationSnapshot: snapshot,
      dividendUnlockedAt: null,
      dividendUnlockedBy: null,
      dividendUnlockReason: null,
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
      message: 'Dividend declaration locked. Snapshot captured for this cycle.',
    };
  }

  async unlockDividendDeclaration(data: any) {
    const current = await this.getSystemSettings();
    if (!current.dividendDeclarationLocked) {
      return {
        ...current,
        message: 'Dividend declaration is already unlocked.',
      };
    }

    const now = new Date().toISOString();
    const unlockedBy = this.cleanString(data?.unlockedBy) || 'Admin';
    const reason = this.cleanString(data?.reason) || null;

    const payload = {
      ...current,
      dividendDeclarationLocked: false,
      dividendUnlockedAt: now,
      dividendUnlockedBy: unlockedBy,
      dividendUnlockReason: reason,
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
      message: 'Dividend declaration unlocked. Management can edit cycle settings again.',
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
