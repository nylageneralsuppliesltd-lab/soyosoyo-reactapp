    // Calculate and impose fines for overdue installments and outstanding balances
    private async imposeFinesIfNeeded(loan: any) {
      if (!loan || !loan.loanType) return;
      const now = new Date();
      const schedule = Array.isArray(loan.schedule) ? loan.schedule : [];
      const loanType = loan.loanType;
      const fines: any[] = [];

      // Fine config
      const fineEnabled = loanType.lateFinesEnabled || loanType.lateFineEnabled;
      const fineType = loanType.lateFinesType || loanType.lateFineType;
      const fineValue = Number(loanType.lateFinesValue || 0);
      const fineFrequency = loanType.fineFrequency || 'monthly';
      const fineBase = loanType.fineBase || 'installment-balance';
      const gracePeriod = Number(loanType.gracePeriod || 0);

      // 1. Overdue installments
      for (const inst of schedule) {
        if (inst.paid) continue;
        // Assume dueDate is set or calculate from disbursementDate
        let dueDate = inst.dueDate ? new Date(inst.dueDate) : null;
        if (!dueDate && loan.disbursementDate) {
          dueDate = new Date(loan.disbursementDate);
          dueDate.setMonth(dueDate.getMonth() + (inst.installment - 1) + gracePeriod);
        }
        if (dueDate && now > dueDate) {
          // Calculate fine amount
          let baseAmount = 0;
          if (fineBase === 'installment-balance') baseAmount = inst.total;
          else if (fineBase === 'loan-amount') baseAmount = Number(loan.amount);
          else if (fineBase === 'total-unpaid') baseAmount = Number(loan.balance);
          else if (fineBase === 'installment-interest') baseAmount = inst.interest;
          else baseAmount = inst.total;
          let fineAmt = 0;
          if (fineType === 'percentage') fineAmt = baseAmount * (fineValue / 100);
          else fineAmt = fineValue;
          // Check if fine already imposed for this installment
          const existingFine = await this.prisma.fine.findFirst({ where: { loanId: loan.id, reason: { contains: `Installment ${inst.installment}` } } });
          if (!existingFine && fineAmt > 0) {
            // Create fine
            await this.prisma.fine.create({
              data: {
                loanId: loan.id,
                memberId: loan.memberId,
                amount: fineAmt,
                type: 'late_payment',
                reason: `Installment ${inst.installment} overdue`,
                dueDate: dueDate,
                status: 'unpaid',
              },
            });
          }
        }
      }

      // 2. Outstanding after loan period
      if (loan.dueDate && now > new Date(loan.dueDate) && Number(loan.balance) > 0) {
        // Only one fine for outstanding after maturity
        const existingFine = await this.prisma.fine.findFirst({ where: { loanId: loan.id, reason: { contains: 'Outstanding after maturity' } } });
        let baseAmount = 0;
        if (fineBase === 'total-unpaid') baseAmount = Number(loan.balance);
        else if (fineBase === 'loan-amount') baseAmount = Number(loan.amount);
        else baseAmount = Number(loan.balance);
        let fineAmt = 0;
        if (fineType === 'percentage') fineAmt = baseAmount * (fineValue / 100);
        else fineAmt = fineValue;
        if (!existingFine && fineAmt > 0) {
          await this.prisma.fine.create({
            data: {
              loanId: loan.id,
              memberId: loan.memberId,
              amount: fineAmt,
              type: 'late_payment',
              reason: 'Outstanding after maturity',
              dueDate: loan.dueDate,
              status: 'unpaid',
            },
          });
        }
      }
    }
  // Generate amortization schedule (flat or reducing)
  private generateSchedule(amount: number, rate: number, months: number, interestType: string, gracePeriod: number = 0, interestFrequency: string = 'monthly'): any[] {
    const schedule = [];
    if (!amount || !rate || !months) return schedule;
    if (interestType === 'flat') {
      const totalInterest = amount * (rate / 100) * (months / 12);
      const monthly = (amount + totalInterest) / months;
      for (let i = 1; i <= months; i++) {
        schedule.push({
          installment: i,
          principal: amount / months,
          interest: totalInterest / months,
          total: monthly,
          dueDate: null, // can be set if needed
          paid: false
        });
      }
    } else { // reducing
      const r = rate / 100 / 12;
      const emi = amount * (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
      let balance = amount;
      for (let i = 1; i <= months; i++) {
        const interest = balance * r;
        const principal = emi - interest;
        balance -= principal;
        schedule.push({
          installment: i,
          principal,
          interest,
          total: emi,
          dueDate: null, // can be set if needed
          paid: false
        });
      }
    }
    return schedule;
  }
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class LoansService {
  constructor(private prisma: PrismaService) {}

  private async ensureAccountByName(
    name: string,
    type: string,
    description?: string,
  ): Promise<{ id: number; name: string }> {
    const existing = await this.prisma.account.findFirst({ where: { name } });
    if (existing) return existing;

    return this.prisma.account.create({
      data: {
        name,
        type: type as any,
        description: description ?? null,
        currency: 'KES',
        balance: new Prisma.Decimal(0),
      },
    });
  }

  private normalizeStatus(status?: string) {
    const value = (status || '').toString().toLowerCase();
    if (['active', 'pending', 'closed', 'defaulted'].includes(value)) return value;
    if (value === 'repaid') return 'closed';
    return 'pending';
  }

  async create(data: any) {
    try {
      const amount = data.amount ? parseFloat(data.amount) : 0;
      const loanData: any = {
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
        typeName: data.typeName?.trim() || null,
        qualificationCriteria: data.qualificationCriteria?.trim() || null,
        interestFrequency: data.interestFrequency?.trim() || null,
        periodFlexible: data.periodFlexible !== undefined ? !!data.periodFlexible : false,
        gracePeriod: data.gracePeriod !== undefined ? parseInt(data.gracePeriod) : null,
        approvers: data.approvers ? (Array.isArray(data.approvers) ? data.approvers.join(',') : String(data.approvers)) : null,
        fineFrequency: data.fineFrequency?.trim() || null,
        fineBase: data.fineBase?.trim() || null,
        autoDisbursement: data.autoDisbursement !== undefined ? !!data.autoDisbursement : false,
        processingFee: data.processingFee !== undefined ? parseFloat(data.processingFee) : null,
        processingFeeType: data.processingFeeType?.trim() || null,
        guarantorsRequired: data.guarantorsRequired !== undefined ? !!data.guarantorsRequired : false,
        guarantorName: data.guarantorName?.trim() || null,
        guarantorAmount: data.guarantorAmount !== undefined ? parseFloat(data.guarantorAmount) : null,
        guarantorNotified: data.guarantorNotified !== undefined ? !!data.guarantorNotified : false,
      };

      // Set memberName from memberId if not provided
      const memberId = data.memberId ? parseInt(data.memberId) : null;
      if (memberId) {
        loanData.member = { connect: { id: memberId } };
        if (!data.memberName) {
          const member = await this.prisma.member.findUnique({ where: { id: memberId } });
          loanData.memberName = member ? (member.name || `Member ${member.id}`) : 'Unspecified';
        } else {
          loanData.memberName = data.memberName?.trim();
        }
      } else {
        loanData.memberName = data.memberName?.trim() || data.borrower?.trim() || 'Unspecified';
      }

      // Set disbursementAccount from disbursementAccountId if not provided
      const disbursementAccountId = data.disbursementAccountId ? parseInt(data.disbursementAccountId) : null;
      if (disbursementAccountId) {
        if (!data.disbursementAccount) {
          const account = await this.prisma.account.findUnique({ where: { id: disbursementAccountId } });
          loanData.disbursementAccount = account ? account.name : null;
        } else {
          loanData.disbursementAccount = data.disbursementAccount?.trim();
        }
      } else {
        loanData.disbursementAccount = data.disbursementAccount?.trim() || null;
      }

      // Attach relations with nested connect to satisfy Prisma create input
      const loanTypeId = data.typeId ? parseInt(data.typeId) : null;
      if (loanTypeId) {
        loanData.loanType = { connect: { id: loanTypeId } };
      }

      // Remove forbidden relation IDs from loanData before Prisma create
      delete loanData.memberId;
      delete loanData.loanTypeId;

      if (!loanData.amount || loanData.amount <= 0) {
        throw new BadRequestException('Valid loan amount is required');
      }

      if (!loanData.memberName && !loanData.bankName && !loanData.externalName) {
        throw new BadRequestException('Member name, bank name, or external borrower name is required');
      }

      // Require a real, existing bank account for disbursement
      if (!disbursementAccountId || isNaN(disbursementAccountId)) {
        throw new BadRequestException('A valid disbursement bank account ID is required');
      }
      const disbursementAccount = await this.prisma.account.findUnique({ where: { id: disbursementAccountId } });
      if (!disbursementAccount || disbursementAccount.type !== 'bank') {
        throw new BadRequestException('Disbursement account must be an existing bank account');
      }

      // Use or create a dedicated loan ledger account (self-healing)
      const loanLedgerAccount = await this.ensureAccountByName('Loans Ledger', 'gl', 'System GL account for loans');

      const amountDecimal = new Prisma.Decimal(amount);

      // Generate amortization schedule and store in schedule field
      const schedule = this.generateSchedule(
        amount,
        loanData.interestRate,
        loanData.periodMonths,
        loanData.interestType,
        loanData.gracePeriod,
        loanData.interestFrequency
      );
      loanData.schedule = schedule;

      // Create the loan record
      const loan = await this.prisma.loan.create({ 
        data: loanData as any,
        include: { member: true, loanType: true },
      });

      // Sync to journal and account (only for outward loans when disbursed)
      if (loanData.loanDirection === 'outward' && loan.status !== 'pending') {
        // Create journal entry: Debit Loans Ledger, Credit Disbursement Bank Account
        await this.prisma.journalEntry.create({
          data: {
            date: loanData.disbursementDate,
            reference: `LOAN-${loan.id}`,
            description: `Loan disbursement - ${loanData.memberName}`,
            narration: loanData.purpose || null,
            debitAccountId: loanLedgerAccount.id,
            debitAmount: amountDecimal,
            creditAccountId: disbursementAccount.id,
            creditAmount: amountDecimal,
            category: 'loan_disbursement',
          },
        });

        // Update disbursement bank account balance (decrement)
        await this.prisma.account.update({
          where: { id: disbursementAccount.id },
          data: { balance: { decrement: amountDecimal } },
        });
      }

      // Update member loan balance if applicable
      if (memberId) {
        await this.prisma.member.update({
          where: { id: memberId },
          data: { loanBalance: { increment: amount } },
        });
      }

      return loan;
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
      qualificationCriteria: data.qualificationCriteria?.trim() ?? undefined,
      interestFrequency: data.interestFrequency?.trim() ?? undefined,
      periodFlexible: data.periodFlexible !== undefined ? !!data.periodFlexible : undefined,
      gracePeriod: data.gracePeriod !== undefined ? parseInt(data.gracePeriod) : undefined,
      approvers: data.approvers ? (Array.isArray(data.approvers) ? data.approvers.join(',') : String(data.approvers)) : undefined,
      fineFrequency: data.fineFrequency?.trim() ?? undefined,
      fineBase: data.fineBase?.trim() ?? undefined,
      autoDisbursement: data.autoDisbursement !== undefined ? !!data.autoDisbursement : undefined,
      processingFee: data.processingFee !== undefined ? parseFloat(data.processingFee) : undefined,
      processingFeeType: data.processingFeeType?.trim() ?? undefined,
      guarantorsRequired: data.guarantorsRequired !== undefined ? !!data.guarantorsRequired : undefined,
      guarantorName: data.guarantorName?.trim() ?? undefined,
      guarantorAmount: data.guarantorAmount !== undefined ? parseFloat(data.guarantorAmount) : undefined,
      guarantorNotified: data.guarantorNotified !== undefined ? !!data.guarantorNotified : undefined,
    };

    const cleanedUpdate = Object.fromEntries(
      Object.entries(updateData).filter(([, value]) => value !== undefined),
    );

    // Handle balance changes (if status changed or amount changed)
    if (data.status && data.status !== loan.status) {
      const newStatus = this.normalizeStatus(data.status);
      const amountDecimal = new Prisma.Decimal(loan.amount);

      // If transitioning to active/disbursed, sync to accounts
      if ((newStatus === 'active' || newStatus === 'closed') && loan.status === 'pending') {
        const loanAccount = await this.ensureAccountByName(
          'Loans Disbursed',
          'bank',
          'GL account for loan disbursements'
        );

        const cashAccount = await this.ensureAccountByName(
          'Cashbox',
          'cash',
          'Default cash account'
        );

        // Create journal entry
        await this.prisma.journalEntry.create({
          data: {
            date: loan.disbursementDate || new Date(),
            reference: `LOAN-${loan.id}`,
            description: `Loan disbursement - ${loan.memberName}`,
            narration: loan.purpose || null,
            debitAccountId: loanAccount.id,
            debitAmount: amountDecimal,
            creditAccountId: cashAccount.id,
            creditAmount: amountDecimal,
            category: 'loan_disbursement',
          },
        });

        // Update cash account
        await this.prisma.account.update({
          where: { id: cashAccount.id },
          data: { balance: { decrement: amountDecimal } },
        });
      }
    }

    // If any core schedule fields changed, regenerate schedule
    let schedule = undefined;
    if (
      (data.amount !== undefined || data.interestRate !== undefined || data.periodMonths !== undefined || data.interestType !== undefined)
    ) {
      const amount = cleanedUpdate.amount !== undefined ? cleanedUpdate.amount : loan.amount;
      const rate = cleanedUpdate.interestRate !== undefined ? cleanedUpdate.interestRate : loan.interestRate;
      const months = cleanedUpdate.periodMonths !== undefined ? cleanedUpdate.periodMonths : loan.periodMonths;
      const interestType = cleanedUpdate.interestType !== undefined ? cleanedUpdate.interestType : loan.interestType;
      const gracePeriod = cleanedUpdate.gracePeriod !== undefined ? cleanedUpdate.gracePeriod : loan.gracePeriod || 0;
      const interestFrequency = cleanedUpdate.interestFrequency !== undefined ? cleanedUpdate.interestFrequency : loan.interestFrequency || 'monthly';
      schedule = this.generateSchedule(amount, rate, months, interestType, gracePeriod, interestFrequency);
      cleanedUpdate.schedule = schedule;
    }
    const updatedLoan = await this.prisma.loan.update({
      where: { id },
      data: cleanedUpdate,
      include: { member: true, repayments: true, loanType: true },
    });
    // After update, check and impose fines if needed
    await this.imposeFinesIfNeeded(updatedLoan);
    return updatedLoan;
  }

  async remove(id: number) {
    const loan = await this.prisma.loan.findUnique({ where: { id } });
    if (!loan) {
      throw new NotFoundException(`Loan #${id} not found`);
    }

    // TEMPORARY: Allow deleting any loan regardless of status for cleanup
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

    // Perform disbursement, journal, and account updates on approval (if not already done)
    // Only for outward loans
    if (loan.loanDirection === 'outward') {
      // Use disbursementAccount as the ID (string or number)
      let disbursementAccountId = loan.disbursementAccount ? Number(loan.disbursementAccount) : undefined;
      let disbursementAccount = disbursementAccountId
        ? await this.prisma.account.findUnique({ where: { id: disbursementAccountId } })
        : null;
      // If missing or invalid, auto-assign the first available bank account
      if (!disbursementAccount || disbursementAccount.type !== 'bank') {
        const firstBankAccount = await this.prisma.account.findFirst({ where: { type: 'bank' } });
        if (!firstBankAccount) {
          throw new BadRequestException('No valid bank account available for disbursement.');
        }
        disbursementAccount = firstBankAccount;
        disbursementAccountId = firstBankAccount.id;
        // Optionally update the loan record to store the assigned account
        await this.prisma.loan.update({ where: { id: loan.id }, data: { disbursementAccount: String(disbursementAccountId) } });
      }
      // Use or create the correct enum for account type: 'gl' for general ledger
      const loanLedgerAccount = await this.ensureAccountByName('Loans Ledger', 'gl', 'System GL account for loans');
      // Check if a journal entry for this loan already exists
      const existingJournal = await this.prisma.journalEntry.findFirst({ where: { reference: `LOAN-${loan.id}` } });
      if (!existingJournal) {
        const amountDecimal = new Prisma.Decimal(loan.amount);
        await this.prisma.journalEntry.create({
          data: {
            date: loan.disbursementDate || new Date(),
            reference: `LOAN-${loan.id}`,
            description: `Loan disbursement - ${loan.memberName}`,
            narration: loan.purpose || null,
            debitAccountId: loanLedgerAccount.id,
            debitAmount: amountDecimal,
            creditAccountId: disbursementAccount.id,
            creditAmount: amountDecimal,
            category: 'loan_disbursement',
          },
        });
        // Update disbursement account balance
        await this.prisma.account.update({
          where: { id: disbursementAccount.id },
          data: { balance: { decrement: amountDecimal } },
        });
        // Update member loan balance if applicable
        if (loan.memberId) {
          await this.prisma.member.update({
            where: { id: loan.memberId },
            data: { loanBalance: { increment: typeof loan.amount === 'object' && 'toNumber' in loan.amount ? loan.amount.toNumber() : Number(loan.amount) } },
          });
        }
      }
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

