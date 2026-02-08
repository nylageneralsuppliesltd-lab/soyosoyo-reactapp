import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class LoansService {
  constructor(private prisma: PrismaService) {}

  /**
   * Impose late payment fines for loans with overdue installments.
   * This should be called periodically (e.g., daily cron job) to check all active loans
   * and create fine records for missed payments based on loan type configuration.
   *
   * LOGIC:
   * - Charges per overdue installment (or per cycle when frequency is set).
   * - Supports loan-level cycle fines when configured for total outstanding.
   */
  async imposeFinesIfNeeded(loan: any): Promise<void> {
    if (loan.status !== 'active') {
      return; // Only impose fines on active loans
    }

    // Get loan type configuration for fine settings
    const loanType = await this.prisma.loanType.findUnique({
      where: { id: loan.loanTypeId },
    });

    if (!loanType || !loanType.lateFineEnabled) {
      return; // No fines configured for this loan type
    }

    // Generate amortization schedule to determine which installments are due
    const scheduleData = await this.getAmortizationTable(loan.id);
    const schedule = scheduleData.schedule;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all repayments made so far
    const repayments = await this.prisma.repayment.findMany({
      where: { loanId: loan.id },
      orderBy: { date: 'asc' },
    });

    // Calculate total paid towards principal and interest
    const totalPaidPrincipal = repayments.reduce((sum, r) => sum + Number(r.principal || 0), 0);
    const totalPaidInterest = repayments.reduce((sum, r) => sum + Number(r.interest || 0), 0);

    // Get existing fines to avoid duplicates
    const existingFines = await this.prisma.fine.findMany({
      where: { loanId: loan.id },
    });

    let accumulatedPrincipal = 0;
    let accumulatedInterest = 0;
    const overduePeriods: Array<{ period: any; principalShortfall: number; interestShortfall: number; dueDate: Date }> = [];

    // Check each installment period - track overdue periods and shortfalls
    for (const period of schedule) {
      if (period.isGrace) continue; // Skip grace periods

      accumulatedPrincipal += period.principal;
      accumulatedInterest += period.interest;

      const dueDate = new Date(period.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      // Check if this installment is overdue
      if (dueDate < today) {
        // Check if enough has been paid to cover this installment
        const principalShortfall = Math.max(0, accumulatedPrincipal - totalPaidPrincipal);
        const interestShortfall = Math.max(0, accumulatedInterest - totalPaidInterest);

        // Only fine if there's an actual shortfall for THIS period
        if (principalShortfall > 0.01 || interestShortfall > 0.01) {
          overduePeriods.push({ period, principalShortfall, interestShortfall, dueDate });
        }
      }
    }

    if (overduePeriods.length === 0) {
      return;
    }

    const fineFrequency = (loanType.lateFineFrequency || 'once_off').toLowerCase();
    const fineChargeOn = loanType.lateFineChargeOn || 'per_installment';
    const cycleKey = this.getFineCycleKey(today, fineFrequency);

    // Loan-level cycle fine for overdue outstanding (principal + interest due to date)
    if (fineChargeOn === 'total_unpaid' && ['monthly', 'weekly', 'daily'].includes(fineFrequency)) {
      const overdueScheduledPrincipal = overduePeriods.reduce(
        (sum, item) => sum + Number(item.period.principal || 0),
        0
      );
      const overdueScheduledInterest = overduePeriods.reduce(
        (sum, item) => sum + Number(item.period.interest || 0),
        0
      );
      const overduePrincipal = Math.max(0, overdueScheduledPrincipal - totalPaidPrincipal);
      const overdueInterest = Math.max(0, overdueScheduledInterest - totalPaidInterest);
      const totalOutstanding = overduePrincipal + overdueInterest;

      if (totalOutstanding > 0) {
        const cycleNoteKey = `LateFineCycle:${cycleKey}`;
        const cycleFineExists = existingFines.some(
          (f) => f.notes && f.notes.includes(cycleNoteKey)
        );

        if (!cycleFineExists) {
          const rate = Number(loanType.lateFineValue || 0) / 100;
          const fineAmount = totalOutstanding * rate;

          if (fineAmount > 0) {
            await this.prisma.fine.create({
              data: {
                memberId: loan.memberId,
                loanId: loan.id,
                amount: new Prisma.Decimal(fineAmount),
                reason: `Late payment fine (${fineFrequency}) on total outstanding balance`,
                status: 'unpaid',
                type: 'late_payment',
                notes: `${cycleNoteKey}|Overdue: ${totalOutstanding.toFixed(2)}|Frequency: ${fineFrequency}`,
              },
            });
          }
        }
      }

      return;
    }

    // Per-installment fines (once off or per cycle)
    for (const overdue of overduePeriods) {
      const { period, principalShortfall, interestShortfall, dueDate } = overdue;
      const fineKey = `Period-${period.period}`;
      const fineCycleKey = fineFrequency === 'once_off'
        ? fineKey
        : `${fineKey}|Cycle:${cycleKey}`;

      const fineExists = existingFines.some(
        (f) => f.notes && f.notes.includes(fineCycleKey)
      );

      if (fineExists) continue;

      // Calculate fine amount based on loan type settings
      let fineAmount = 0;

      if (loanType.lateFineType === 'fixed') {
        fineAmount = Number(loanType.lateFineValue || 0);
      } else if (loanType.lateFineType === 'percentage') {
        const baseAmount = this.calculateFineBase(
          fineChargeOn,
          period,
          loan,
          principalShortfall + interestShortfall
        );
        fineAmount = baseAmount * (Number(loanType.lateFineValue || 0) / 100);
      }

      if (fineAmount > 0) {
        const overdueDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        await this.prisma.fine.create({
          data: {
            memberId: loan.memberId,
            loanId: loan.id,
            amount: new Prisma.Decimal(fineAmount),
            reason: `Late payment fine for installment ${period.period} (${overdueDays} days overdue)`,
            status: 'unpaid',
            type: 'late_payment',
            notes: `${fineCycleKey}|Overdue Days: ${overdueDays}|Due: ${dueDate.toISOString()}`,
          },
        });
      }
    }

    return;
  }

  private getFineCycleKey(date: Date, frequency: string): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    if (frequency === 'daily') {
      return `${year}-${month}-${day}`;
    }

    if (frequency === 'weekly') {
      const firstDay = new Date(date.getFullYear(), 0, 1);
      const days = Math.floor((date.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000));
      const week = Math.ceil((days + firstDay.getDay() + 1) / 7);
      return `${year}-W${String(week).padStart(2, '0')}`;
    }

    if (frequency === 'monthly') {
      return `${year}-${month}`;
    }

    return 'once_off';
  }

  /**
   * Calculate the base amount for percentage-based fines
   */
  private calculateFineBase(
    chargeOn: string,
    period: any,
    loan: any,
    unpaidAmount: number
  ): number {
    switch (chargeOn) {
      case 'per_installment':
        return period.principal + period.interest;
      case 'installment_balance':
        return period.principal + period.interest;
      case 'installment_interest':
        return period.interest;
      case 'total_unpaid':
        return unpaidAmount;
      case 'loan_amount':
        return Number(loan.amount);
      default:
        return period.principal + period.interest;
    }
  }


  async create(data: any): Promise<any> {
    // Map frontend keys to backend keys for compatibility
    const loanTypeIdRaw = data.loanTypeId ?? data.typeId;
    const loanTypeId = loanTypeIdRaw ? Number(loanTypeIdRaw) : undefined;
    const memberId = data.memberId ? Number(data.memberId) : undefined;
    const disbursementAccountRaw = data.disbursementAccount ?? data.disbursementAccountId;
    const disbursementAccount = disbursementAccountRaw != null ? String(disbursementAccountRaw) : undefined;

    const loanType = loanTypeId ? await this.prisma.loanType.findUnique({ where: { id: loanTypeId } }) : null;
    const member = memberId ? await this.prisma.member.findUnique({ where: { id: memberId } }) : null;

    const resolvedInterestRate = data.interestRate ?? loanType?.interestRate ?? new Prisma.Decimal(0);
    const resolvedInterestType = data.interestType ?? loanType?.interestType ?? 'flat';
    const resolvedPeriodMonths = data.periodMonths ?? loanType?.periodMonths ?? 12;
    const resolvedMemberName = data.memberName ?? member?.name;
    const resolvedAmount = data.amount ?? 0;
    const resolvedBalance = data.balance ?? resolvedAmount;

    const loan = await this.prisma.loan.create({
      data: {
        memberId: memberId,
        memberName: resolvedMemberName,
        amount: resolvedAmount,
        balance: resolvedBalance,
        interestRate: resolvedInterestRate,
        interestType: resolvedInterestType,
        interestFrequency: data.interestFrequency ?? loanType?.interestFrequency,
        periodFlexible: data.periodFlexible,
        gracePeriod: data.gracePeriod,
        qualificationCriteria: data.qualificationCriteria,
        approvers: data.approvers,
        fineFrequency: data.fineFrequency,
        fineBase: data.fineBase,
        autoDisbursement: data.autoDisbursement ?? loanType?.autoDisburse ?? false,
        processingFee: data.processingFee,
        processingFeeType: data.processingFeeType,
        guarantorsRequired: data.guarantorsRequired ?? loanType?.guarantorsRequired ?? false,
        guarantorName: data.guarantorName,
        guarantorAmount: data.guarantorAmount,
        guarantorNotified: data.guarantorNotified,
        periodMonths: resolvedPeriodMonths,
        status: data.status ?? 'pending',
        loanDirection: data.loanDirection ?? 'outward',
        schedule: data.schedule ? JSON.stringify(data.schedule) : undefined,
        disbursementDate: data.disbursementDate ? new Date(data.disbursementDate) : undefined,
        disbursementAccount: disbursementAccount,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        purpose: data.purpose,
        terms: data.terms,
        collateral: data.collateral,
        classification: data.classification,
        impairment: data.impairment,
        ecl: data.ecl,
        notes: data.notes,
        loanTypeId: loanTypeId,
      },
      include: {
        member: true,
        loanType: true,
      },
    });

    // Create accounting entries when loan is active (disbursed)
    if (loan.status === 'active') {
      await this.createLoanDisbursementEntries(loan);
    }
    
    // Add typeName and memberName for frontend compatibility
    return {
      ...loan,
      typeName: loan.loanType?.name || '',
      memberName: loan.member?.name || loan.memberName || '',
    };
  }

  /**
   * Create proper double-entry accounting records when a loan is disbursed
   * Includes IFRS 9 compliant recognition of interest income and ECL provisioning
   */
  private async createLoanDisbursementEntries(loan: any): Promise<void> {
    const amountDecimal = new Prisma.Decimal(loan.amount);
    const disbursementDate = loan.disbursementDate || loan.startDate || new Date();

    // Get or create the cash/bank account from which loan is disbursed
    const disbursementAccountId = loan.disbursementAccount != null ? Number(loan.disbursementAccount) : undefined;
    const cashAccount = disbursementAccountId
      ? await this.prisma.account.findUnique({ where: { id: disbursementAccountId } })
      : await this.prisma.account.findFirst({ 
          where: { 
            OR: [
              { name: 'Cashbox' },
              { type: 'cash' }
            ]
          } 
        });

    if (!cashAccount) {
      console.warn(`No cash account found for loan disbursement (Loan ID: ${loan.id})`);
      return;
    }

    // Get or create Loans Receivable GL account (IFRS 9: Financial Asset at Amortized Cost)
    const loansReceivableAccount = await this.prisma.account.upsert({
      where: { name: 'Loans Receivable' },
      update: {},
      create: {
        name: 'Loans Receivable',
        type: 'gl',
        description: 'Loans disbursed to members (Asset account - IFRS 9 Financial Asset)',
        currency: 'KES',
        balance: new Prisma.Decimal(0),
      },
    });

    // Get or create Interest Receivable account (for accrued interest tracking)
    const interestReceivableAccount = await this.prisma.account.upsert({
      where: { name: 'Interest Receivable' },
      update: {},
      create: {
        name: 'Interest Receivable',
        type: 'gl',
        description: 'Accrued interest on loans (Asset account)',
        currency: 'KES',
        balance: new Prisma.Decimal(0),
      },
    });

    // Calculate total interest based on loan terms (IFRS 9: Effective Interest Method)
    const totalInterest = this.calculateTotalInterest(loan);
    const totalInterestDecimal = new Prisma.Decimal(totalInterest);

    // Update account balances
    // Cash decreases (credit in accounting terms, but we track as decrease in asset)
    await this.prisma.account.update({
      where: { id: cashAccount.id },
      data: { balance: { decrement: amountDecimal } },
    });

    // Loans Receivable increases (debit - asset increases) - Principal only
    await this.prisma.account.update({
      where: { id: loansReceivableAccount.id },
      data: { balance: { increment: amountDecimal } },
    });

    // Interest Receivable increases (debit - future interest to be earned)
    await this.prisma.account.update({
      where: { id: interestReceivableAccount.id },
      data: { balance: { increment: totalInterestDecimal } },
    });

    // Create journal entry for loan disbursement (Principal)
    // Debit: Loans Receivable (asset increases)
    // Credit: Cash/Bank (asset decreases)
    await this.prisma.journalEntry.create({
      data: {
        date: disbursementDate,
        reference: `LOAN-${loan.id}`,
        description: `Loan disbursed to ${loan.memberName}`,
        narration: loan.purpose || `Loan principal of ${loan.amount} disbursed`,
        debitAccountId: loansReceivableAccount.id,
        debitAmount: amountDecimal,
        creditAccountId: cashAccount.id,
        creditAmount: amountDecimal,
        category: 'loan_disbursement',
      },
    });

    // Create journal entry for interest recognition (IFRS 9 requirement)
    // At disbursement, we recognize the total interest receivable as an asset
    // This will be amortized to income over the loan term using effective interest method
    if (totalInterest > 0) {
      const interestIncomeAccount = await this.prisma.account.upsert({
        where: { name: 'Unearned Interest Income' },
        update: {},
        create: {
          name: 'Unearned Interest Income',
          type: 'gl',
          description: 'Interest income to be recognized over loan term (Liability account)',
          currency: 'KES',
          balance: new Prisma.Decimal(0),
        },
      });

      // Debit: Interest Receivable (asset)
      // Credit: Unearned Interest Income (liability - will be moved to income as earned)
      await this.prisma.journalEntry.create({
        data: {
          date: disbursementDate,
          reference: `LOAN-INT-${loan.id}`,
          description: `Interest on loan to ${loan.memberName}`,
          narration: `Total interest: ${totalInterest} to be recognized over ${loan.periodMonths} months`,
          debitAccountId: interestReceivableAccount.id,
          debitAmount: totalInterestDecimal,
          creditAccountId: interestIncomeAccount.id,
          creditAmount: totalInterestDecimal,
          category: 'interest_accrual',
        },
      });

      await this.prisma.account.update({
        where: { id: interestIncomeAccount.id },
        data: { balance: { increment: totalInterestDecimal } },
      });
    }

    // IFRS 9 ECL Provisioning at initial recognition (Stage 1 - 12-month expected credit loss)
    await this.calculateAndRecordECL(loan, disbursementDate);

    // Update member ledger for their personal statement
    if (loan.memberId) {
      const updatedMember = await this.prisma.member.update({
        where: { id: loan.memberId },
        data: { balance: { decrement: loan.amount } }, // Member owes money, so balance decreases
      });

      // Create ledger entry for principal
      await this.prisma.ledger.create({
        data: {
          memberId: loan.memberId,
          type: 'loan_disbursement',
          amount: -loan.amount, // Negative because it's money out
          description: `Loan disbursed - ${loan.loanType?.name || 'Loan'}`,
          reference: `LOAN-${loan.id}`,
          balanceAfter: updatedMember.balance,
          date: disbursementDate,
        },
      });

      // Create separate ledger entry for interest obligation
      if (totalInterest > 0) {
        await this.prisma.ledger.create({
          data: {
            memberId: loan.memberId,
            type: 'interest_charge',
            amount: -totalInterest, // Negative because it's an obligation
            description: `Interest on loan - ${loan.loanType?.name || 'Loan'}`,
            reference: `LOAN-INT-${loan.id}`,
            balanceAfter: updatedMember.balance - totalInterest,
            date: disbursementDate,
          },
        });
      }
    }
  }

  /**
   * Calculate total interest for the loan based on interest type and terms
   */
  private calculateTotalInterest(loan: any): number {
    const principal = Number(loan.amount || 0);
    const interestRate = Number(loan.interestRate || 0);
    const periodMonths = Number(loan.periodMonths || 12);
    const interestType = loan.interestType || 'flat';

    if (interestType === 'flat') {
      // Flat interest: Total = Principal × Rate × Time
      return principal * (interestRate / 100) * (periodMonths / 12);
    } else if (interestType === 'reducing' || interestType === 'reducing_balance') {
      // Reducing balance: approximate total interest
      // For simplicity, use average balance method: (P × (n+1) × r) / 2n
      const monthlyRate = (interestRate / 100) / 12;
      return (principal * (periodMonths + 1) * monthlyRate) / 2;
    }
    
    return 0;
  }

  /**
   * Calculate and record Expected Credit Loss (ECL) per IFRS 9
   * Stage 1: 12-month ECL at origination
   */
  private async calculateAndRecordECL(loan: any, date: Date): Promise<void> {
    // Skip ECL for FVPL-classified loans (measured at fair value, not amortized cost)
    if (loan.classification && loan.classification.toLowerCase() === 'fvpl') {
      return;
    }

    // Get default PD/LGD from IFRS config
    const config = await this.prisma.iFRSConfig.findUnique({ 
      where: { key: 'defaults' } 
    }).catch(() => null) as any;

    let pdStage1 = 0.01; // Default 1% 12-month PD
    let lgd = 0.6; // Default 60% Loss Given Default

    if (config && config.value) {
      try {
        const defaults = JSON.parse(config.value);
        pdStage1 = defaults.pdStage1 || pdStage1;
        lgd = defaults.lgd || lgd;
      } catch (e) {
        // Use defaults
      }
    }

    // Calculate ECL: EAD × PD × LGD
    const ead = Number(loan.amount || 0); // Exposure at Default = loan amount
    const eclValue = ead * pdStage1 * lgd;
    const eclDecimal = new Prisma.Decimal(eclValue);

    // Update loan with ECL and impairment
    await this.prisma.loan.update({
      where: { id: loan.id },
      data: { 
        ecl: eclDecimal,
        impairment: eclDecimal,
        classification: loan.classification || 'amortized_cost', // Default IFRS 9 classification
      },
    });

    // Create ECL provision account entry (IFRS 9 requirement)
    const eclProvisionAccount = await this.prisma.account.upsert({
      where: { name: 'ECL Provision on Loans' },
      update: {},
      create: {
        name: 'ECL Provision on Loans',
        type: 'gl',
        description: 'Expected Credit Loss provision (Contra-asset account - IFRS 9)',
        currency: 'KES',
        balance: new Prisma.Decimal(0),
      },
    });

    const eclExpenseAccount = await this.prisma.account.upsert({
      where: { name: 'Credit Loss Expense' },
      update: {},
      create: {
        name: 'Credit Loss Expense',
        type: 'gl',
        description: 'ECL expense recognized (P&L account)',
        currency: 'KES',
        balance: new Prisma.Decimal(0),
      },
    });

    // Journal entry for ECL recognition:
    // Debit: Credit Loss Expense (P&L impact)
    // Credit: ECL Provision on Loans (reduces net carrying amount of loan)
    await this.prisma.journalEntry.create({
      data: {
        date: date,
        reference: `ECL-${loan.id}`,
        description: `ECL provision for loan to ${loan.memberName}`,
        narration: `IFRS 9 Stage 1 ECL: ${eclValue.toFixed(2)} (PD=${pdStage1}, LGD=${lgd})`,
        debitAccountId: eclExpenseAccount.id,
        debitAmount: eclDecimal,
        creditAccountId: eclProvisionAccount.id,
        creditAmount: eclDecimal,
        category: 'ecl_provision',
      },
    });

    await this.prisma.account.update({
      where: { id: eclExpenseAccount.id },
      data: { balance: { increment: eclDecimal } },
    });

    await this.prisma.account.update({
      where: { id: eclProvisionAccount.id },
      data: { balance: { increment: eclDecimal } },
    });
  }


  async update(id: number, data: any): Promise<any> {
    // Update a loan and include member and loanType for frontend compatibility
    const loan = await this.prisma.loan.update({
      where: { id },
      data: {
        memberId: data.memberId,
        memberName: data.memberName,
        amount: data.amount,
        balance: data.balance,
        interestRate: data.interestRate,
        interestType: data.interestType,
        interestFrequency: data.interestFrequency,
        periodFlexible: data.periodFlexible,
        gracePeriod: data.gracePeriod,
        qualificationCriteria: data.qualificationCriteria,
        approvers: data.approvers,
        fineFrequency: data.fineFrequency,
        fineBase: data.fineBase,
        autoDisbursement: data.autoDisbursement,
        processingFee: data.processingFee,
        processingFeeType: data.processingFeeType,
        guarantorsRequired: data.guarantorsRequired,
        guarantorName: data.guarantorName,
        guarantorAmount: data.guarantorAmount,
        guarantorNotified: data.guarantorNotified,
        periodMonths: data.periodMonths,
        status: data.status,
        loanDirection: data.loanDirection,
        schedule: data.schedule ? JSON.stringify(data.schedule) : undefined,
        disbursementDate: data.disbursementDate ? new Date(data.disbursementDate) : undefined,
        disbursementAccount: data.disbursementAccount,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        purpose: data.purpose,
        terms: data.terms,
        collateral: data.collateral,
        classification: data.classification,
        impairment: data.impairment,
        ecl: data.ecl,
        notes: data.notes,
        loanTypeId: data.loanTypeId,
      },
      include: {
        member: true,
        loanType: true,
      },
    });
    // Add typeName and memberName for frontend compatibility
    return {
      ...loan,
      typeName: loan.loanType?.name || '',
      memberName: loan.member?.name || loan.memberName || '',
    };
  }


  async findOne(id: number): Promise<any> {
    // Find a loan by id, include member and loanType
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: {
        member: true,
        loanType: true,
        repayments: true,
        fines: true,
      },
    });
    return loan ? {
      ...loan,
      typeName: loan.loanType?.name || '',
      memberName: loan.member?.name || loan.memberName || '',
    } : null;
  }


  async findAll(take?: number, skip?: number, filters?: any): Promise<any[]> {
    // Find all loans, optionally with pagination and filters
    const where: any = {};
    if (filters) {
      if (filters.memberId) where.memberId = filters.memberId;
      if (filters.status) where.status = filters.status;
      if (filters.loanTypeId) where.loanTypeId = filters.loanTypeId;
    }
    const loans = await this.prisma.loan.findMany({
      where,
      take,
      skip,
      include: {
        member: true,
        loanType: true,
        repayments: true,
        fines: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    // Add typeName and memberName for frontend compatibility
    return loans.map(loan => ({
      ...loan,
      typeName: loan.loanType?.name || '',
      memberName: loan.member?.name || loan.memberName || '',
    }));
  }

  async approveLoan(id: number): Promise<any> {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: { member: true, loanType: true },
    });
    if (!loan) {
      throw new Error('Loan not found');
    }

    if (loan.status === 'active') {
      return {
        ...loan,
        typeName: loan.loanType?.name || '',
        memberName: loan.member?.name || loan.memberName || '',
      };
    }

    const updated = await this.prisma.loan.update({
      where: { id },
      data: { status: 'active' },
      include: { member: true, loanType: true },
    });

    await this.createLoanDisbursementEntries(updated);

    return {
      ...updated,
      typeName: updated.loanType?.name || '',
      memberName: updated.member?.name || updated.memberName || '',
    };
  }

  /**
   * Process all active loans to check for overdue payments and impose fines
   * This should be called daily via cron job or manually triggered
   */
  async processAllOverdueLoans(): Promise<any> {
    const activeLoans = await this.prisma.loan.findMany({
      where: { status: 'active' },
      include: { loanType: true, member: true },
    });

    let processed = 0;
    let finesCreated = 0;
    const errors = [];

    for (const loan of activeLoans) {
      try {
        const existingFineCount = await this.prisma.fine.count({
          where: { loanId: loan.id },
        });

        await this.imposeFinesIfNeeded(loan);

        const newFineCount = await this.prisma.fine.count({
          where: { loanId: loan.id },
        });

        finesCreated += (newFineCount - existingFineCount);
        processed++;
      } catch (error) {
        errors.push({
          loanId: loan.id,
          error: error.message,
        });
      }
    }

    return {
      success: true,
      processed,
      finesCreated,
      errors: errors.length > 0 ? errors : undefined,
      message: `Processed ${processed} active loans, created ${finesCreated} new fines`,
    };
  }

  async findByMember(memberId: number): Promise<any[]> {
    return [];
  }

  async findByStatus(status: string): Promise<any[]> {
    return [];
  }


  async remove(id: number): Promise<void> {
    await this.prisma.loan.delete({ where: { id } });
  }

  async getLoanStatistics(direction?: string): Promise<any> {
    return {};
  }
  // Dynamic loan schedule generator with full scenario support
  public generateDynamicSchedule(params: {
    principal: number;
    interestRate: number;
    termMonths: number;
    amortizationMethod: 'equal_installment' | 'equal_principal' | 'bullet';
    repaymentFrequency: 'monthly' | 'quarterly' | 'yearly' | 'biweekly' | 'weekly';
    gracePeriods?: number;
    interestType?: 'flat' | 'reducing'; // flat or reducing balance
    interestRatePeriod?: 'month' | 'year'; // whether rate is per month or per year
    repaymentSequence?: 'principal_first' | 'interest_first' | 'both'; // order of repayment
    qualification?: { min: number; max: number };
    startDate?: Date;
    lateFineEnabled?: boolean;
    lateFineType?: string;
    lateFineValue?: number;
    lateFineFrequency?: string;
    lateFineChargeOn?: string; // per_installment, total_unpaid, installment_balance, installment_interest, loan_amount
  }): any[] {
    const {
      principal,
      interestRate,
      termMonths,
      amortizationMethod,
      repaymentFrequency,
      gracePeriods = 0,
      interestType = 'reducing',
      interestRatePeriod = 'year',
      repaymentSequence = 'both',
      qualification,
      startDate = new Date(),
      lateFineEnabled = false,
      lateFineType = 'fixed',
      lateFineValue = 0,
      lateFineFrequency = 'once_off',
      lateFineChargeOn = 'per_installment',
    } = params;

    // Qualification check
    if (qualification) {
      if (principal < qualification.min || principal > qualification.max) {
        throw new Error('Principal does not meet qualification criteria');
      }
    }

    const schedule = [];

    // Calculate periods and period length based on frequency
    let periods: number;
    let periodLength: number;
    let periodDays: number;

    switch (repaymentFrequency) {
      case 'weekly':
        periodLength = 0.25; // weeks in months
        periodDays = 7;
        periods = Math.ceil((termMonths * 4.33) / 1); // weeks in term
        break;
      case 'biweekly':
        periodLength = 0.5; // biweeks in months
        periodDays = 14;
        periods = Math.ceil((termMonths * 4.33) / 2); // biweeks in term
        break;
      case 'monthly':
        periodLength = 1;
        periodDays = 30;
        periods = termMonths;
        break;
      case 'quarterly':
        periodLength = 3;
        periodDays = 90;
        periods = Math.ceil(termMonths / 3);
        break;
      case 'yearly':
        periodLength = 12;
        periodDays = 365;
        periods = Math.ceil(termMonths / 12);
        break;
      default:
        periodLength = 1;
        periodDays = 30;
        periods = termMonths;
    }

    let remainingPrincipal = principal;
    let totalFlatInterest = 0;

    // For flat interest, calculate total interest upfront
    if (interestType === 'flat') {
      const annualRate = interestRatePeriod === 'month' 
        ? interestRate * 12 
        : interestRate;
      totalFlatInterest = principal * (annualRate / 100) * (termMonths / 12);
    }

    for (let i = 1; i <= periods; i++) {
      const isGrace = i <= gracePeriods;
      let interest = 0;
      let principalPayment = 0;
      let fine = 0;

      // Calculate interest based on type
      if (interestType === 'flat') {
        // Flat: divide total interest equally across non-grace periods
        if (!isGrace) {
          interest = totalFlatInterest / (periods - gracePeriods);
        }
      } else {
        // Reducing balance: interest on remaining principal
        const monthlyRate = interestRatePeriod === 'month'
          ? interestRate / 100
          : (interestRate / 100) / 12;
        interest = remainingPrincipal * monthlyRate * (periodLength);
      }

      // Calculate principal payment based on amortization method
      if (!isGrace) {
        if (amortizationMethod === 'equal_installment') {
          const monthlyRate = interestRatePeriod === 'month'
            ? interestRate / 100
            : (interestRate / 100) / 12;
          const rPeriodic = monthlyRate * periodLength;
          const n = periods - gracePeriods;
          
          let totalPayment: number;
          if (interestType === 'flat') {
            // For flat interest: equal installment on principal only
            totalPayment = (principal / (periods - gracePeriods)) + interest;
            principalPayment = principal / (periods - gracePeriods);
          } else {
            // For reducing: use annuity formula
            if (rPeriodic > 0) {
              totalPayment = principal * rPeriodic / (1 - Math.pow(1 + rPeriodic, -n));
              principalPayment = totalPayment - interest;
            } else {
              principalPayment = principal / (periods - gracePeriods);
            }
          }
        } else if (amortizationMethod === 'equal_principal') {
          principalPayment = principal / (periods - gracePeriods);
        } else if (amortizationMethod === 'bullet') {
          principalPayment = (i === periods) ? principal : 0;
        }
      }

      // Apply repayment sequence (order in which principal and interest are paid)
      let principalDue = principalPayment;
      let interestDue = interest;
      if (repaymentSequence === 'principal_first') {
        // Show principal first, then interest
        interestDue = interest;
        principalDue = principalPayment;
      } else if (repaymentSequence === 'interest_first') {
        // Interest priority (shown first)
        interestDue = interest;
        principalDue = principalPayment;
      }

      // NOTE: Fines are NOT included in the amortization schedule
      // They are calculated and applied separately when payments are late
      // The schedule only shows expected principal + interest payments
      fine = 0; // Always 0 in schedule - fines are imposed later if payment is late

      // Add period to schedule
      schedule.push({
        period: i,
        dueDate: new Date(startDate.getTime() + (i * periodDays * 24 * 60 * 60 * 1000)),
        principal: Number(principalDue.toFixed(2)),
        interest: Number(interestDue.toFixed(2)),
        fine: 0, // Always 0 - fines are calculated separately when payments are missed
        total: Number((principalDue + interestDue).toFixed(2)), // FIXED: Removed fine from total
        isGrace,
        repaymentSequence,
        balanceAfter: Number(Math.max(0, remainingPrincipal - principalPayment).toFixed(2)),
        paid: false, // Will be updated with repayment data below
        paidAmount: 0, // Will be updated with repayment data below
      });

      remainingPrincipal -= principalPayment;
      if (remainingPrincipal < 0) remainingPrincipal = 0;
    }

    return schedule;
  }

  async getAmortizationTable(loanId: number): Promise<any> {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        loanType: true,
        member: true,
        repayments: {
          orderBy: { date: 'asc' },
          include: { account: true },
        },
      },
    });

    if (!loan) {
      throw new Error('Loan not found');
    }

    // Prepare parameters from loan and loanType with fallbacks
    const loanType = loan.loanType;
    const principal = Number(loan.amount);
    const interestRate = Number(loan.interestRate || loanType?.interestRate || 0);
    const termMonths = loan.periodMonths || loanType?.periodMonths || 12;
    const amortizationMethod = (loan.loanType?.amortizationMethod as any) || 'equal_installment';
    const repaymentFrequency = (loan.loanType?.repaymentFrequency as any) || 'monthly';
    const gracePeriods = loan.gracePeriod || loanType?.gracePeriod || 0;
    const startDate = loan.startDate || loan.disbursementDate || new Date();

    // Generate amortization schedule with all parameters
    const schedule = this.generateDynamicSchedule({
      principal,
      interestRate,
      termMonths,
      amortizationMethod,
      repaymentFrequency,
      gracePeriods,
      interestType: (loanType?.interestType as any) || 'reducing',
      interestRatePeriod: (loanType?.interestRatePeriod as any) || 'year',
      repaymentSequence: (loanType?.repaymentSequence as any) || 'both',
      startDate,
      lateFineEnabled: loanType?.lateFineEnabled || false,
      lateFineType: loanType?.lateFineType || 'fixed',
      lateFineValue: Number(loanType?.lateFineValue || 0),
      lateFineFrequency: loanType?.lateFineFrequency || 'once_off',
      lateFineChargeOn: loanType?.lateFineChargeOn || 'per_installment',
    });

    // Fetch fines for this loan and integrate into schedule periods
    const fines = await this.prisma.fine.findMany({
      where: { loanId: loan.id },
      orderBy: { createdAt: 'asc' },
    });

    // Match fines to schedule periods and update fine amounts
    for (const fine of fines) {
      // Extract period number from fine notes (format: "Period-X")
      const periodMatch = fine.notes?.match(/Period-(\d+)/);
      if (periodMatch) {
        const periodNumber = parseInt(periodMatch[1], 10);
        const scheduleRow = schedule.find(row => row.period === periodNumber);
        if (scheduleRow) {
          scheduleRow.fine += Number(fine.amount || 0);
          scheduleRow.total = Number((scheduleRow.principal + scheduleRow.interest + scheduleRow.fine).toFixed(2));
        }
      } else {
        // If no period is specified, add to the first unpaid period
        const firstUnpaidPeriod = schedule.find(row => !row.paid);
        if (firstUnpaidPeriod) {
          firstUnpaidPeriod.fine += Number(fine.amount || 0);
          firstUnpaidPeriod.total = Number((firstUnpaidPeriod.principal + firstUnpaidPeriod.interest + firstUnpaidPeriod.fine).toFixed(2));
        }
      }
    }

    // Add repayment data to schedule using chronological allocation
    let cumulativeBalance = principal;
    let repaymentIndex = 0;
    let remainingAmount = 0;
    const sortedRepayments = [...loan.repayments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    schedule.forEach((schedRow, idx) => {
      let totalPaidThisPeriod = 0;
      
      // Allocate repayments chronologically to this period
      while (repaymentIndex < sortedRepayments.length && remainingAmount === 0) {
        remainingAmount = Number(sortedRepayments[repaymentIndex].amount);
        repaymentIndex++;
      }
      
      // Use whatever remaining amount we have from current repayment
      if (remainingAmount > 0) {
        const amountToAllocate = Math.min(remainingAmount, schedRow.total);
        totalPaidThisPeriod = amountToAllocate;
        remainingAmount -= amountToAllocate;
      }
      
      schedRow.paid = totalPaidThisPeriod >= schedRow.total;
      schedRow.paidAmount = totalPaidThisPeriod;
      
      // Calculate running balance (principal remaining after scheduled principal for this period)
      cumulativeBalance = Math.max(0, cumulativeBalance - schedRow.principal);
      schedRow.balance = cumulativeBalance;
    });

    // Calculate summary statistics
    const totalPrincipal = schedule.reduce((sum, row) => sum + row.principal, 0);
    const totalInterest = schedule.reduce((sum, row) => sum + row.interest, 0);
    const totalFines = schedule.reduce((sum, row) => sum + row.fine, 0);
    const totalPayment = schedule.reduce((sum, row) => sum + row.total, 0);

    return {
      success: true,
      loan: {
        id: loan.id,
        memberName: loan.member?.name || loan.memberName,
        amount: Number(loan.amount),
        interestRate,
        interestType: loanType?.interestType || 'reducing',
        interestRatePeriod: loanType?.interestRatePeriod || 'year',
        periodMonths: termMonths,
        amortizationMethod,
        repaymentFrequency,
        repaymentSequence: loanType?.repaymentSequence || 'both',
        gracePeriod: gracePeriods,
        startDate,
        status: loan.status,
      },
      summary: {
        totalPrincipal: Number(totalPrincipal.toFixed(2)),
        totalInterest: Number(totalInterest.toFixed(2)),
        totalFines: Number(totalFines.toFixed(2)),
        totalPayment: Number(totalPayment.toFixed(2)),
        numberOfPeriods: schedule.length,
      },
      schedule,
    };
  }

  async getLoanStatement(loanId: number): Promise<any> {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        loanType: true,
        member: true,
        repayments: {
          orderBy: { date: 'asc' },
          include: { account: true },
        },
        fines: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!loan) {
      throw new Error('Loan not found');
    }

    // Calculate totals
    const totalRepaid = loan.repayments.reduce((sum, rep) => sum + Number(rep.amount), 0);
    const principalRepaid = loan.repayments.reduce((sum, rep) => sum + Number(rep.principal || 0), 0);
    const interestPaid = loan.repayments.reduce((sum, rep) => sum + Number(rep.interest || 0), 0);
    
    // Calculate fines
    const totalFinesImposed = loan.fines.reduce((sum, fine) => sum + Number(fine.amount), 0);
    const finesPaid = loan.fines
      .filter(f => f.status === 'paid')
      .reduce((sum, fine) => sum + Number(fine.paidAmount || fine.amount), 0);
    const outstandingFines = totalFinesImposed - finesPaid;

    // Generate statement transactions chronologically
    const transactions = [];

    // Add disbursement
    if (loan.disbursementDate) {
      transactions.push({
        date: loan.disbursementDate,
        type: 'Disbursement',
        description: 'Loan disbursed',
        debit: Number(loan.amount),
        credit: 0,
        balance: Number(loan.amount),
        reference: `LOAN-${loan.id}`,
      });
    }

    let runningBalance = Number(loan.amount);

    // Collect all transactions (repayments and fines) and sort by date
    const allTransactions: Array<{date: Date, type: string, data: any}> = [];

    loan.repayments.forEach((repayment) => {
      allTransactions.push({
        date: repayment.date,
        type: 'repayment',
        data: repayment,
      });
    });

    loan.fines.forEach((fine) => {
      allTransactions.push({
        date: fine.createdAt,
        type: 'fine',
        data: fine,
      });
    });

    // Sort all transactions by date
    allTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Process transactions in chronological order
    allTransactions.forEach((transaction) => {
      if (transaction.type === 'repayment') {
        const repayment = transaction.data;
        runningBalance -= Number(repayment.amount);
        transactions.push({
          date: repayment.date,
          type: 'Repayment',
          description: `Payment - Principal: ${Number(repayment.principal || 0).toLocaleString()}, Interest: ${Number(repayment.interest || 0).toLocaleString()}`,
          debit: 0,
          credit: Number(repayment.amount),
          balance: Math.max(0, runningBalance),
          reference: `REPAY-${repayment.id}`,
        });
      } else if (transaction.type === 'fine') {
        const fine = transaction.data;
        // Only add unpaid fines to the balance
        if (fine.status !== 'paid') {
          runningBalance += Number(fine.amount);
        }
        transactions.push({
          date: fine.createdAt,
          type: 'Fine',
          description: fine.reason || 'Late payment fine',
          debit: Number(fine.amount),
          credit: 0,
          balance: runningBalance,
          reference: `FINE-${fine.id}`,
          status: fine.status,
        });
      }
    });

    // Calculate expected total based on amortization schedule
    const amortizationData = await this.getAmortizationTable(loan.id);
    const expectedTotalInterest = amortizationData.summary.totalInterest;
    const expectedTotalFines = amortizationData.summary.totalFines;

    const loanPayload = {
      id: loan.id,
      memberName: loan.member?.name || loan.memberName,
      loanType: loan.loanType?.name || 'N/A',
      amount: loan.amount,
      balance: loan.balance,
      interestRate: loan.interestRate || loan.loanType?.interestRate,
      status: loan.status,
      disbursementDate: loan.disbursementDate,
      startDate: loan.startDate,
      dueDate: loan.dueDate,
    };

    const summaryPayload = {
      originalAmount: Number(loan.amount),
      principalRepaid,
      interestPaid,
      finesPaid,
      totalRepaid,
      outstandingPrincipal: Number(loan.balance),
      outstandingFines,
      currentBalance: Number(loan.balance) + outstandingFines,
      expectedTotalInterest,
      expectedTotalFines,
      remainingInterest: Math.max(0, expectedTotalInterest - interestPaid),
    };

    const repayments = loan.repayments.map((repayment) => ({
      id: repayment.id,
      amount: Number(repayment.amount),
      principal: Number(repayment.principal || 0),
      interest: Number(repayment.interest || 0),
      method: repayment.method,
      accountId: repayment.accountId || null,
      accountName: repayment.account?.name || null,
      reference: repayment.reference,
      notes: repayment.notes,
      date: repayment.date,
    }));

    const fines = loan.fines.map((fine) => ({
      id: fine.id,
      amount: Number(fine.amount),
      status: fine.status,
      reason: fine.reason,
      paidAmount: fine.paidAmount ? Number(fine.paidAmount) : null,
      paidDate: fine.paidDate || null,
      date: fine.createdAt,
    }));

    const statementPayload = {
      loan: loanPayload,
      summary: summaryPayload,
      transactions,
      repayments,
      fines,
      currentBalance: summaryPayload.currentBalance,
      outstandingBalance: summaryPayload.currentBalance,
    };

    return {
      success: true,
      ...statementPayload,
      data: statementPayload,
    };
  }

  async getComprehensiveLoanStatement(loanId: number): Promise<any> {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        loanType: true,
        member: true,
        repayments: {
          orderBy: { date: 'asc' },
          include: { account: true },
        },
        fines: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!loan) {
      throw new Error('Loan not found');
    }

    const loanType = loan.loanType;
    const principal = Number(loan.amount);
    const interestRate = Number(loan.interestRate || loanType?.interestRate || 0);
    const termMonths = loan.periodMonths || loanType?.periodMonths || 12;
    const amortizationMethod = (loan.loanType?.amortizationMethod as any) || 'equal_installment';
    const repaymentFrequency = (loan.loanType?.repaymentFrequency as any) || 'monthly';
    const gracePeriods = loan.gracePeriod || loanType?.gracePeriod || 0;
    const startDate = loan.startDate || loan.disbursementDate || new Date();

    // Generate amortization schedule
    const amortizationSchedule = this.generateDynamicSchedule({
      principal,
      interestRate,
      termMonths,
      amortizationMethod,
      repaymentFrequency,
      gracePeriods,
      interestType: (loanType?.interestType as any) || 'reducing',
      interestRatePeriod: (loanType?.interestRatePeriod as any) || 'year',
      repaymentSequence: (loanType?.repaymentSequence as any) || 'both',
      startDate,
      lateFineEnabled: loanType?.lateFineEnabled || false,
      lateFineType: loanType?.lateFineType || 'fixed',
      lateFineValue: Number(loanType?.lateFineValue || 0),
      lateFineFrequency: loanType?.lateFineFrequency || 'once_off',
      lateFineChargeOn: loanType?.lateFineChargeOn || 'per_installment',
    });

    // Fetch fines for this loan and integrate into schedule periods
    const fines = await this.prisma.fine.findMany({
      where: { loanId: loan.id },
      orderBy: { createdAt: 'asc' },
    });

    // Match fines to schedule periods and update fine amounts
    for (const fine of fines) {
      // Extract period number from fine notes (format: "Period-X")
      const periodMatch = fine.notes?.match(/Period-(\d+)/);
      if (periodMatch) {
        const periodNumber = parseInt(periodMatch[1], 10);
        const scheduleRow = amortizationSchedule.find(row => row.period === periodNumber);
        if (scheduleRow) {
          scheduleRow.fine += Number(fine.amount || 0);
          scheduleRow.total = Number((scheduleRow.principal + scheduleRow.interest + scheduleRow.fine).toFixed(2));
        }
      } else {
        // If no period is specified, add to the first unpaid period
        const firstUnpaidPeriod = amortizationSchedule.find(row => !row.paid);
        if (firstUnpaidPeriod) {
          firstUnpaidPeriod.fine += Number(fine.amount || 0);
          firstUnpaidPeriod.total = Number((firstUnpaidPeriod.principal + firstUnpaidPeriod.interest + firstUnpaidPeriod.fine).toFixed(2));
        }
      }
    }

    // Combine amortization with actual payments using chronological allocation
    const consolidatedStatement = [];
    let runningPrincipalBalance = Number(loan.amount);

    // Add disbursement as first entry
    consolidatedStatement.push({
      date: loan.disbursementDate || startDate,
      period: 0,
      type: 'Disbursement',
      scheduled: null,
      actualPayment: {
        principal: 0,
        interest: 0,
        fine: 0,
        amount: 0,
      },
      outstanding: 0,
      balance: Number(loan.amount),
      note: 'Loan disbursed',
    });

    // Sort repayments chronologically for sequential allocation
    const sortedRepayments = [...loan.repayments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let repaymentIndex = 0;
    let remainingRepaymentAmount = 0;
    let allocatedRepayment: any = null;

    // Process each amortization period
    for (const scheduleRow of amortizationSchedule) {
      let totalPaymentThisPeriod = 0;
      let allocatedRepaymentDate = null;
      
      // Allocate repayments chronologically to this period
      while (repaymentIndex < sortedRepayments.length && remainingRepaymentAmount === 0) {
        const rep = sortedRepayments[repaymentIndex];
        remainingRepaymentAmount = Number(rep.amount);
        allocatedRepaymentDate = new Date(rep.date);
        allocatedRepayment = rep;
        repaymentIndex++;
      }
      
      // Use whatever remaining amount we have from current repayment
      if (remainingRepaymentAmount > 0) {
        const amountToAllocate = Math.min(remainingRepaymentAmount, scheduleRow.total);
        totalPaymentThisPeriod = amountToAllocate;
        remainingRepaymentAmount -= amountToAllocate;
      }

      // Calculate actual payment breakdown proportionally (avoid division by zero)
      let actualPrincipal = 0;
      let actualInterest = 0;
      let actualFine = 0;
      
      if (scheduleRow.total > 0 && totalPaymentThisPeriod > 0) {
        actualPrincipal = Number((totalPaymentThisPeriod * (scheduleRow.principal / scheduleRow.total)).toFixed(2));
        actualInterest = Number((totalPaymentThisPeriod * (scheduleRow.interest / scheduleRow.total)).toFixed(2));
        actualFine = Number((totalPaymentThisPeriod * (scheduleRow.fine / scheduleRow.total)).toFixed(2));
        
        // Ensure total matches due to rounding
        const total = actualPrincipal + actualInterest + actualFine;
        if (total !== totalPaymentThisPeriod && totalPaymentThisPeriod > 0) {
          actualPrincipal += (totalPaymentThisPeriod - total);
          actualPrincipal = Number(actualPrincipal.toFixed(2));
        }
      }
      
      // Update running principal balance (only scheduled principal reduces balance)
      runningPrincipalBalance = Math.max(0, runningPrincipalBalance - scheduleRow.principal);
      
      // Calculate outstanding (scheduled - actual)
      const outstanding = Math.max(0, scheduleRow.total - totalPaymentThisPeriod);

      consolidatedStatement.push({
        date: scheduleRow.dueDate,
        period: scheduleRow.period,
        type: 'Loan Payment',
        scheduled: {
          principal: scheduleRow.principal,
          interest: scheduleRow.interest,
          fine: scheduleRow.fine,
          total: scheduleRow.total,
          isGrace: scheduleRow.isGrace,
        },
        actualPayment: {
          principal: actualPrincipal,
          interest: actualInterest,
          fine: actualFine,
          amount: Number(totalPaymentThisPeriod.toFixed(2)),
          paymentDate: allocatedRepaymentDate ? new Date(allocatedRepaymentDate).toLocaleDateString() : null,
          method: allocatedRepayment?.method || null,
          accountId: allocatedRepayment?.accountId || null,
          accountName: allocatedRepayment?.account?.name || null,
        },
        outstanding: Number(outstanding.toFixed(2)),
        balance: Number(runningPrincipalBalance.toFixed(2)),
        note: this.generateStatementNote(scheduleRow, totalPaymentThisPeriod, scheduleRow.fine),
      });
    }

    // Note: Any remaining repayments after schedule completion are already accounted for
    // since we allocate sequentially

    // Calculate totals
    const totalScheduledPrincipal = amortizationSchedule.reduce((sum, row) => sum + row.principal, 0);
    const totalScheduledInterest = amortizationSchedule.reduce((sum, row) => sum + row.interest, 0);
    const totalScheduledFines = amortizationSchedule.reduce((sum, row) => sum + row.fine, 0);
    const totalScheduled = amortizationSchedule.reduce((sum, row) => sum + row.total, 0);
    const totalRepaid = loan.repayments.reduce((sum, rep) => sum + Number(rep.amount), 0);
    const totalFinesImposed = loan.fines.reduce((sum, fine) => sum + Number(fine.amount), 0);
    const totalOutstanding = Math.max(0, totalScheduled - totalRepaid);
    
    // Calculate actual paid amounts from statement
    const totalActualPrincipal = consolidatedStatement.slice(1).reduce((sum, row) => sum + Number(row.actualPayment?.principal || 0), 0);
    const totalActualInterest = consolidatedStatement.slice(1).reduce((sum, row) => sum + Number(row.actualPayment?.interest || 0), 0);
    const totalActualFine = consolidatedStatement.slice(1).reduce((sum, row) => sum + Number(row.actualPayment?.fine || 0), 0);

    return {
      success: true,
      loan: {
        id: loan.id,
        memberName: loan.member?.name || loan.memberName,
        loanType: loan.loanType?.name || 'N/A',
        amount: Number(loan.amount),
        interestRate,
        interestType: loanType?.interestType || 'reducing',
        periodMonths: termMonths,
        amortizationMethod,
        repaymentFrequency,
        status: loan.status,
        disbursementDate: loan.disbursementDate,
        startDate: loan.startDate,
      },
      summary: {
        scheduledPrincipal: Number(totalScheduledPrincipal.toFixed(2)),
        scheduledInterest: Number(totalScheduledInterest.toFixed(2)),
        scheduledFines: Number(totalScheduledFines.toFixed(2)),
        scheduledPayments: Number(totalScheduled.toFixed(2)),
        actualPrincipal: Number(totalActualPrincipal.toFixed(2)),
        actualInterest: Number(totalActualInterest.toFixed(2)),
        actualFines: Number(totalActualFine.toFixed(2)),
        totalPaid: Number(totalRepaid.toFixed(2)),
        totalFinesImposed: Number(totalFinesImposed.toFixed(2)),
        outstandingBalance: Number(totalOutstanding.toFixed(2)),
        currentBalance: Number(loan.balance),
        numberOfPeriods: amortizationSchedule.length,
        completionPercentage: totalScheduled > 0 ? Math.round((totalRepaid / totalScheduled) * 100) : 0,
      },
      statement: consolidatedStatement,
    };
  }

  private generateStatementNote(scheduleRow: any, actualPayment: number, fines: number): string {
    const scheduled = scheduleRow.total;
    
    if (scheduleRow.isGrace) {
      return 'Grace period - no payment due';
    }
    
    if (actualPayment === 0 && fines === 0) {
      return 'Not yet paid';
    }
    
    if (actualPayment >= scheduled) {
      if (actualPayment > scheduled) {
        const overpayment = (actualPayment - scheduled).toFixed(2);
        return `Paid in full + overpayment of ${overpayment}`;
      }
      return 'Paid in full';
    }
    
    if (actualPayment > 0) {
      const shortfall = (scheduled - actualPayment).toFixed(2);
      return `Partial payment - shortfall of ${shortfall}`;
    }
    
    if (fines > 0) {
      return `Overdue with fines charged`;
    }
    
    return 'Overdue';
  }
}
