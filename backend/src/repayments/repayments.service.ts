import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma, PaymentMethod } from '@prisma/client';

@Injectable()
export class RepaymentsService {
  constructor(private prisma: PrismaService) {}

  private normalizePaymentMethod(method?: string): string {
    const value = (method || 'cash').toLowerCase();

    if (value === 'cash') return 'cash';
    if (value === 'bank_transfer' || value === 'bank') return 'bank';
    if (value === 'mobile_money' || value === 'mpesa') return 'mpesa';
    if (value === 'cheque' || value === 'check_off') return 'check_off';
    if (value === 'bank_deposit') return 'bank_deposit';

    return 'other';
  }

  private getRequiredAccountTypes(method: string): string[] {
    switch (method) {
      case 'cash':
        return ['cash', 'pettyCash'];
      case 'bank':
      case 'bank_deposit':
      case 'check_off':
        return ['bank'];
      case 'mpesa':
        return ['mobileMoney'];
      default:
        return [];
    }
  }

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

  async create(data: any) {
    try {
      // Transform and validate incoming data
      const repaymentData = {
        loanId: data.loanId ? parseInt(data.loanId) : null,
        memberId: data.memberId ? parseInt(data.memberId) : null,
        accountId: data.accountId ? parseInt(data.accountId) : null,
        amount: data.amount ? parseFloat(data.amount) : 0,
        date: data.date ? new Date(data.date) : new Date(),
        method: this.normalizePaymentMethod(data.method || data.paymentMethod),
        notes: data.notes?.trim() || null,
      };

      // Validate required fields
      if (!repaymentData.loanId || !repaymentData.amount || repaymentData.amount <= 0) {
        throw new BadRequestException('Loan ID and valid amount are required');
      }
      if (data.accountId && isNaN(repaymentData.accountId as any)) {
        throw new BadRequestException('Invalid account ID');
      }

      const amountDecimal = new Prisma.Decimal(repaymentData.amount);

      // Get the loan to update balance and calculate interest/fines
      const loan = await this.prisma.loan.findUnique({ 
        where: { id: repaymentData.loanId },
        include: { 
          member: true,
          loanType: true,
          fines: true,
        }
      });

      if (!loan) {
        throw new NotFoundException(`Loan #${repaymentData.loanId} not found`);
      }

      // Calculate outstanding fines (include partials)
      const fineRecords = await this.prisma.fine.findMany({
        where: {
          loanId: repaymentData.loanId,
          status: { in: ['unpaid', 'partial'] },
        },
        orderBy: { createdAt: 'asc' },
      });

      const totalOutstandingFines = fineRecords.reduce((sum, fine) => {
        const outstanding = Number(fine.amount) - Number(fine.paidAmount || 0);
        return sum + Math.max(0, outstanding);
      }, 0);

      // Get total interest for the loan
      const totalInterest = this.calculateTotalInterest(loan);
      
      // Get paid interest so far
      const paidRepayments = await this.prisma.repayment.findMany({
        where: { loanId: repaymentData.loanId }
      });
      const totalPaidAmount = paidRepayments.reduce((sum, r) => sum + Number(r.amount), 0);

      // Calculate how much of previous payments went to interest vs principal
      // Simple allocation: interest is paid first, then fines, then principal
      const paidToInterest = Math.min(totalPaidAmount, totalInterest);
      const remainingInterest = Math.max(0, totalInterest - paidToInterest);

      // Allocate the current payment: Fines → Interest → Principal (waterfall method)
      let remainingPayment = repaymentData.amount;
      let finePayment = 0;
      let interestPayment = 0;
      let principalPayment = 0;

      // 1. Pay fines first
      if (totalOutstandingFines > 0 && remainingPayment > 0) {
        finePayment = Math.min(remainingPayment, totalOutstandingFines);
        remainingPayment -= finePayment;
      }

      // 2. Pay interest second
      if (remainingInterest > 0 && remainingPayment > 0) {
        interestPayment = Math.min(remainingPayment, remainingInterest);
        remainingPayment -= interestPayment;
      }

      // 3. Pay principal last
      if (remainingPayment > 0) {
        principalPayment = remainingPayment;
      }

      // Create the repayment record with allocation details
      const repaymentCreateData: Prisma.RepaymentUncheckedCreateInput = {
        loanId: repaymentData.loanId,
        memberId: repaymentData.memberId ?? undefined,
        accountId: repaymentData.accountId ?? undefined,
        amount: amountDecimal,
        date: repaymentData.date,
        method: repaymentData.method as PaymentMethod,
        notes: repaymentData.notes,
        principal: principalPayment,
        interest: interestPayment,
      };

      const repayment = await this.prisma.repayment.create({
        data: repaymentCreateData,
      });

      // Update loan balance (only principal reduces the balance)
      const newLoanBalance = Math.max(0, Number(loan.balance) - principalPayment);
      const updatedLoan = await this.prisma.loan.update({
        where: { id: repaymentData.loanId },
        data: { balance: new Prisma.Decimal(newLoanBalance) },
        include: { loanType: true }
      });

      // Apply fine payments (supports partials)
      if (finePayment > 0) {
        let finePaymentRemaining = finePayment;
        for (const fine of fineRecords) {
          if (finePaymentRemaining <= 0) break;
          const fineAmount = Number(fine.amount);
          const alreadyPaid = Number(fine.paidAmount || 0);
          const outstanding = Math.max(0, fineAmount - alreadyPaid);
          if (outstanding <= 0) continue;

          const payAmount = Math.min(finePaymentRemaining, outstanding);
          const newPaidAmount = alreadyPaid + payAmount;
          const newStatus = newPaidAmount >= fineAmount ? 'paid' : 'partial';

          await this.prisma.fine.update({
            where: { id: fine.id },
            data: {
              status: newStatus,
              paidAmount: new Prisma.Decimal(newPaidAmount),
              paidDate: newStatus === 'paid' ? repaymentData.date : fine.paidDate,
            },
          });

          finePaymentRemaining -= payAmount;
        }
      }

      // Get necessary accounts
      const requiredTypes = this.getRequiredAccountTypes(repaymentData.method);
      let cashAccount = await this.ensureAccountByName(
        'Cashbox',
        'cash',
        'Default cash account'
      );

      if (repaymentData.accountId) {
        const selectedAccount = await this.prisma.account.findUnique({
          where: { id: repaymentData.accountId },
        });
        if (!selectedAccount) {
          throw new BadRequestException(`Account #${repaymentData.accountId} not found`);
        }
        if (requiredTypes.length > 0 && !requiredTypes.includes(selectedAccount.type)) {
          throw new BadRequestException(
            `Payment method ${repaymentData.method} requires account type ${requiredTypes.join(', ')}`
          );
        }
        cashAccount = selectedAccount;
      } else if (requiredTypes.length > 0 && repaymentData.method !== 'cash') {
        throw new BadRequestException(
          `Payment method ${repaymentData.method} requires a paying account`
        );
      }

      const loansReceivableAccount = await this.ensureAccountByName(
        'Loans Receivable',
        'gl',
        'Loans disbursed to members (Asset account)'
      );

      const interestReceivableAccount = await this.ensureAccountByName(
        'Interest Receivable',
        'gl',
        'Accrued interest on loans'
      );

      const interestIncomeAccount = await this.ensureAccountByName(
        'Interest Income',
        'gl',
        'Interest income earned (Revenue account)'
      );

      const finesReceivableAccount = await this.ensureAccountByName(
        'Fines Receivable',
        'gl',
        'Outstanding fines owed by members (Asset account)'
      );

      // Create journal entries for each component

      // 1. Principal payment: DR Cash, CR Loans Receivable
      if (principalPayment > 0) {
        const principalDecimal = new Prisma.Decimal(principalPayment);
        const principalNarration = [
          `RepaymentId:${repayment.id}`,
          `LoanId:${loan.id}`,
          `MemberId:${loan.memberId ?? 'n/a'}`,
          `Method:${repaymentData.method}`,
          `Principal:${principalPayment.toFixed(2)}`,
        ].join(' | ');
        
        await this.prisma.journalEntry.create({
          data: {
            date: repaymentData.date,
            reference: `REPAY-${repayment.id}-P`,
            description: `Loan principal repayment - ${loan.memberName} (loanId:${loan.id})`,
            narration: principalNarration,
            debitAccountId: cashAccount.id,
            debitAmount: principalDecimal,
            creditAccountId: loansReceivableAccount.id,
            creditAmount: principalDecimal,
            category: 'loan_repayment_principal',
          },
        });

        await this.prisma.account.update({
          where: { id: loansReceivableAccount.id },
          data: { balance: { decrement: principalDecimal } },
        });
      }

      // 2. Interest payment: DR Cash, CR Interest Receivable & CR Interest Income
      if (interestPayment > 0) {
        const interestDecimal = new Prisma.Decimal(interestPayment);
        const interestNarration = [
          `RepaymentId:${repayment.id}`,
          `LoanId:${loan.id}`,
          `MemberId:${loan.memberId ?? 'n/a'}`,
          `Method:${repaymentData.method}`,
          `Interest:${interestPayment.toFixed(2)}`,
        ].join(' | ');
        
        // Reduce Interest Receivable (accrued interest asset)
        await this.prisma.journalEntry.create({
          data: {
            date: repaymentData.date,
            reference: `REPAY-${repayment.id}-I`,
            description: `Interest payment - ${loan.memberName} (loanId:${loan.id})`,
            narration: interestNarration,
            debitAccountId: cashAccount.id,
            debitAmount: interestDecimal,
            creditAccountId: interestReceivableAccount.id,
            creditAmount: interestDecimal,
            category: 'loan_repayment_interest',
          },
        });

        await this.prisma.account.update({
          where: { id: interestReceivableAccount.id },
          data: { balance: { decrement: interestDecimal } },
        });

        // Recognize interest income (IFRS 9: Revenue recognition)
        await this.prisma.account.update({
          where: { id: interestIncomeAccount.id },
          data: { balance: { increment: interestDecimal } },
        });
      }

      // 3. Fine payment: DR Cash, CR Fines Receivable
      if (finePayment > 0) {
        const fineDecimal = new Prisma.Decimal(finePayment);
        const fineNarration = [
          `RepaymentId:${repayment.id}`,
          `LoanId:${loan.id}`,
          `MemberId:${loan.memberId ?? 'n/a'}`,
          `Method:${repaymentData.method}`,
          `Fines:${finePayment.toFixed(2)}`,
        ].join(' | ');
        
        await this.prisma.journalEntry.create({
          data: {
            date: repaymentData.date,
            reference: `REPAY-${repayment.id}-F`,
            description: `Fine payment - ${loan.memberName} (loanId:${loan.id})`,
            narration: fineNarration,
            debitAccountId: cashAccount.id,
            debitAmount: fineDecimal,
            creditAccountId: finesReceivableAccount.id,
            creditAmount: fineDecimal,
            category: 'fine_payment',
          },
        });

        await this.prisma.account.update({
          where: { id: finesReceivableAccount.id },
          data: { balance: { decrement: fineDecimal } },
        });
      }

      // Update cash account balance (total payment received)
      await this.prisma.account.update({
        where: { id: cashAccount.id },
        data: { balance: { increment: amountDecimal } },
      });

      // Update member balance and create detailed ledger entries
      if (loan.memberId) {
        const updatedMember = await this.prisma.member.update({
          where: { id: loan.memberId },
          data: { balance: { increment: repaymentData.amount } }, // Member's debt reduces
        });

        // Create ledger entries for each component
        if (principalPayment > 0) {
          await this.prisma.ledger.create({
            data: {
              memberId: loan.memberId,
              type: 'loan_repayment',
              amount: principalPayment,
              description: `Loan principal payment - ${updatedLoan.loanType?.name || 'Loan'}`,
              reference: `REPAY-${repayment.id}-P`,
              balanceAfter: updatedMember.balance,
              date: repaymentData.date,
            },
          });
        }

        if (interestPayment > 0) {
          await this.prisma.ledger.create({
            data: {
              memberId: loan.memberId,
              type: 'interest_payment',
              amount: interestPayment,
              description: `Interest payment - ${updatedLoan.loanType?.name || 'Loan'}`,
              reference: `REPAY-${repayment.id}-I`,
              balanceAfter: updatedMember.balance,
              date: repaymentData.date,
            },
          });
        }

        if (finePayment > 0) {
          await this.prisma.ledger.create({
            data: {
              memberId: loan.memberId,
              type: 'fine_payment',
              amount: finePayment,
              description: `Fine payment - ${updatedLoan.loanType?.name || 'Loan'}`,
              reference: `REPAY-${repayment.id}-F`,
              balanceAfter: updatedMember.balance,
              date: repaymentData.date,
            },
          });
        }
      }

      return {
        ...repayment,
        allocation: {
          principal: principalPayment,
          interest: interestPayment,
          fines: finePayment,
          total: repaymentData.amount,
        }
      };
    } catch (error) {
      console.error('Repayment creation error:', error);
      throw error;
    }
  }

  /**
   * Calculate total interest for a loan
   */
  private calculateTotalInterest(loan: any): number {
    const principal = Number(loan.amount || 0);
    const interestRate = Number(loan.interestRate || 0);
    const periodMonths = Number(loan.periodMonths || 12);
    const interestType = loan.interestType || 'flat';

    if (interestType === 'flat') {
      return principal * (interestRate / 100) * (periodMonths / 12);
    } else if (interestType === 'reducing' || interestType === 'reducing_balance') {
      const monthlyRate = (interestRate / 100) / 12;
      return (principal * (periodMonths + 1) * monthlyRate) / 2;
    }
    
    return 0;
  }

  async findAll(take = 100, skip = 0) {
    return this.prisma.repayment.findMany({
      take,
      skip,
      orderBy: { date: 'desc' },
      include: { loan: true, account: true },
    });
  }

  async findOne(id: number) {
    return this.prisma.repayment.findUnique({
      where: { id },
      include: { loan: true, account: true },
    });
  }

  async update(id: number, data: any) {
    const repayment = await this.prisma.repayment.findUnique({ 
      where: { id },
      include: { loan: true }
    });

    if (!repayment) {
      throw new NotFoundException(`Repayment #${id} not found`);
    }

    return this.prisma.repayment.update({
      where: { id },
      data: {
        amount: data.amount ? parseFloat(data.amount) : repayment.amount,
        method: data.method || repayment.method,
        notes: data.notes || repayment.notes,
        accountId: data.accountId !== undefined ? data.accountId : repayment.accountId,
        date: data.date ? new Date(data.date) : repayment.date,
      },
      include: { loan: true },
    });
  }

  async remove(id: number) {
    return this.prisma.repayment.delete({ where: { id } });
  }

  async findByLoan(loanId: number) {
    return this.prisma.repayment.findMany({
      where: { loanId },
      orderBy: { date: 'desc' },
      include: { account: true },
    });
  }
}
