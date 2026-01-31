import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class LoanTypesService {
  constructor(private prisma: PrismaService) {}

  async create(data: any) {
    try {
      if (!data.name) {
        throw new BadRequestException('Loan type name is required');
      }

      const loanType = await this.prisma.loanType.create({
        data: {
          name: data.name?.trim(),
          description: data.description?.trim() || null,
          maxAmount: data.maxAmount !== undefined ? parseFloat(data.maxAmount) : null,
          maxMultiple: data.maxMultiple !== undefined ? parseFloat(data.maxMultiple) : null,
          periodMonths: data.periodMonths !== undefined ? parseInt(data.periodMonths) : 12,
          interestRate: data.interestRate !== undefined ? parseFloat(data.interestRate) : null,
          interestType: data.interestType || 'flat',
          interestFrequency: data.interestFrequency || null,
          periodFlexible: data.periodFlexible || null,
          gracePeriod: data.gracePeriod !== undefined ? parseInt(data.gracePeriod) : null,
          qualificationCriteria: data.qualificationCriteria || null,
          approvers: data.approvers ? (Array.isArray(data.approvers) ? data.approvers.join(',') : String(data.approvers)) : null,
          fineFrequency: data.fineFrequency || null,
          fineBase: data.fineBase || null,
          autoDisbursement: data.autoDisbursement !== undefined ? !!data.autoDisbursement : false,
          processingFee: data.processingFee !== undefined ? parseFloat(data.processingFee) : null,
          processingFeeType: data.processingFeeType || null,
          guarantorsRequired: data.guarantorsRequired !== undefined ? !!data.guarantorsRequired : false,
          guarantorName: data.guarantorName || null,
          guarantorAmount: data.guarantorAmount !== undefined ? parseFloat(data.guarantorAmount) : null,
          guarantorNotified: data.guarantorNotified !== undefined ? !!data.guarantorNotified : false,
          lateFinesEnabled: data.lateFinesEnabled !== undefined ? !!data.lateFinesEnabled : false,
          lateFinesType: data.lateFinesType || null,
          lateFinesValue: data.lateFinesValue !== undefined ? parseFloat(data.lateFinesValue) : null,
          outstandingFinesEnabled: data.outstandingFinesEnabled !== undefined ? !!data.outstandingFinesEnabled : false,
          outstandingFinesType: data.outstandingFinesType || null,
          outstandingFinesValue: data.outstandingFinesValue !== undefined ? parseFloat(data.outstandingFinesValue) : null,
        },
      });

      return {
        success: true,
        data: this.formatLoanType(loanType),
      };
    } catch (error) {
      console.error('LoanTypes creation error:', error);
      if (error.code === 'P2002') {
        throw new BadRequestException('Loan type name already exists');
      }
      throw error;
    }
  }

  async findAll() {
    try {
      const loanTypes = await this.prisma.loanType.findMany({
        orderBy: { name: 'asc' },
        include: {
          loans: {
            where: { status: { in: ['pending', 'active'] } },
          },
        },
      });

      return {
        success: true,
        data: loanTypes.map(lt => ({
          ...this.formatLoanType(lt),
          activeCount: lt.loans.length,
        })),
      };
    } catch (error) {
      console.error('LoanTypes fetch error:', error);
      throw error;
    }
  }

  async findOne(id: number) {
    try {
      const loanType = await this.prisma.loanType.findUnique({
        where: { id },
        include: {
          loans: {
            take: 10,
            orderBy: { disbursementDate: 'desc' },
          },
        },
      });

      if (!loanType) {
        throw new NotFoundException(`Loan type #${id} not found`);
      }

      return {
        success: true,
        data: this.formatLoanType(loanType),
      };
    } catch (error) {
      console.error('LoanType find error:', error);
      throw error;
    }
  }

  async update(id: number, data: any) {
    try {
      const loanType = await this.prisma.loanType.findUnique({ where: { id } });
      if (!loanType) {
        throw new NotFoundException(`Loan type #${id} not found`);
      }

      const updated = await this.prisma.loanType.update({
        where: { id },
        data: {
          name: data.name?.trim() || undefined,
          description: data.description?.trim() || undefined,
          maxAmount: data.maxAmount !== undefined ? parseFloat(data.maxAmount) : undefined,
          maxMultiple: data.maxMultiple !== undefined ? parseFloat(data.maxMultiple) : undefined,
          periodMonths: data.periodMonths !== undefined ? parseInt(data.periodMonths) : undefined,
          interestRate: data.interestRate !== undefined ? parseFloat(data.interestRate) : undefined,
          interestType: data.interestType || undefined,
          lateFinesEnabled: data.lateFineEnabled !== undefined ? data.lateFineEnabled : undefined,
          lateFinesType: data.lateFineType || undefined,
          lateFinesValue: data.lateFineValue !== undefined ? parseFloat(data.lateFineValue) : undefined,
          outstandingFinesEnabled: data.outstandingFineEnabled !== undefined ? data.outstandingFineEnabled : undefined,
          outstandingFinesType: data.outstandingFineType || undefined,
          outstandingFinesValue: data.outstandingFineValue !== undefined ? parseFloat(data.outstandingFineValue) : undefined,
          qualificationCriteria: data.qualificationCriteria?.trim() ?? undefined,
          interestFrequency: data.interestFrequency?.trim() ?? undefined,
          periodFlexible: data.periodFlexible !== undefined ? String(!!data.periodFlexible) : undefined,
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
        },
      });

      return {
        success: true,
        data: this.formatLoanType(updated),
      };
    } catch (error) {
      console.error('LoanType update error:', error);
      if (error.code === 'P2002') {
        throw new BadRequestException('Loan type name already exists');
      }
      throw error;
    }
  }

  async remove(id: number) {
    try {
      const loanType = await this.prisma.loanType.findUnique({ where: { id } });
      if (!loanType) {
        throw new NotFoundException(`Loan type #${id} not found`);
      }

      // Check if there are active loans of this type
      const activeLoans = await this.prisma.loan.count({
        where: {
          loanTypeId: id,
          status: { in: ['pending', 'active'] },
        },
      });

      if (activeLoans > 0) {
        throw new BadRequestException(
          `Cannot delete loan type with ${activeLoans} active loan(s). Please close them first.`,
        );
      }

      const deleted = await this.prisma.loanType.delete({ where: { id } });

      return {
        success: true,
        message: 'Loan type deleted successfully',
        data: this.formatLoanType(deleted),
      };
    } catch (error) {
      console.error('LoanType delete error:', error);
      throw error;
    }
  }

  private formatLoanType(loanType: any) {
    return {
      id: loanType.id,
      name: loanType.name,
      description: loanType.description,
      maxAmount: loanType.maxAmount ? parseFloat(loanType.maxAmount.toString()) : null,
      maxMultiple: loanType.maxMultiple ? parseFloat(loanType.maxMultiple.toString()) : null,
      periodMonths: loanType.periodMonths,
      interestRate: parseFloat(loanType.interestRate.toString()),
      interestType: loanType.interestType,
      lateFineEnabled: loanType.lateFinesEnabled,
      lateFineType: loanType.lateFinesType,
      lateFineValue: loanType.lateFinesValue ? parseFloat(loanType.lateFinesValue.toString()) : null,
      outstandingFineEnabled: loanType.outstandingFinesEnabled,
      outstandingFineType: loanType.outstandingFinesType,
      outstandingFineValue: loanType.outstandingFinesValue ? parseFloat(loanType.outstandingFinesValue.toString()) : null,
      createdAt: loanType.createdAt,
      updatedAt: loanType.updatedAt,
    };
  }
}
