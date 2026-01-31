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
          nature: data.nature || null,
          qualificationBasis: data.qualificationBasis || null,
          maxAmount: data.maxAmount !== undefined ? parseFloat(data.maxAmount) : null,
          maxMultiple: data.maxMultiple !== undefined ? parseFloat(data.maxMultiple) : null,
          minQualificationAmount: data.minQualificationAmount !== undefined ? parseFloat(data.minQualificationAmount) : null,
          maxQualificationAmount: data.maxQualificationAmount !== undefined ? parseFloat(data.maxQualificationAmount) : null,
          periodMonths: data.periodMonths !== undefined ? parseInt(data.periodMonths) : 12,
          periodType: data.periodType || null,
          interestRate: data.interestRate !== undefined ? parseFloat(data.interestRate) : null,
          interestType: data.interestType || 'flat',
          interestRatePeriod: data.interestRatePeriod || null,
          interestFrequency: data.interestFrequency || null,
          periodFlexible: data.periodFlexible || null,
          gracePeriod: data.gracePeriod !== undefined ? parseInt(data.gracePeriod) : null,
          principalGrace: data.principalGrace !== undefined ? parseInt(data.principalGrace) : null,
          interestGrace: data.interestGrace !== undefined ? parseInt(data.interestGrace) : null,
          amortizationMethod: data.amortizationMethod || null,
          repaymentFrequency: data.repaymentFrequency || null,
          repaymentSequence: data.repaymentSequence || null,
          reconciliationCriteria: data.reconciliationCriteria || null,
          approvalOfficials: data.approvalOfficials || null,
          approvalWorkflow: data.approvalWorkflow || null,
          minApprovals: data.minApprovals !== undefined ? parseInt(data.minApprovals) : null,
          approvers: data.approvers ? (Array.isArray(data.approvers) ? data.approvers.join(',') : String(data.approvers)) : null,
          fineFrequency: data.fineFrequency || null,
          fineBase: data.fineBase || null,
          lateFineEnabled: data.lateFineEnabled !== undefined ? !!data.lateFineEnabled : false,
          lateFineType: data.lateFineType || null,
          lateFineValue: data.lateFineValue !== undefined ? parseFloat(data.lateFineValue) : null,
          lateFineFrequency: data.lateFineFrequency || null,
          lateFineChargeOn: data.lateFineChargeOn || null,
          outstandingFineEnabled: data.outstandingFineEnabled !== undefined ? !!data.outstandingFineEnabled : false,
          outstandingFineType: data.outstandingFineType || null,
          outstandingFineValue: data.outstandingFineValue !== undefined ? parseFloat(data.outstandingFineValue) : null,
          outstandingFineFrequency: data.outstandingFineFrequency || null,
          outstandingFineChargeOn: data.outstandingFineChargeOn || null,
          autoDisburse: data.autoDisburse !== undefined ? !!data.autoDisburse : false,
          disburseAccount: data.disburseAccount || null,
          autoDisbursement: data.autoDisbursement !== undefined ? !!data.autoDisbursement : false,
          processingFeeEnabled: data.processingFeeEnabled !== undefined ? !!data.processingFeeEnabled : false,
          processingFee: data.processingFee !== undefined ? parseFloat(data.processingFee) : null,
          processingFeeType: data.processingFeeType || null,
          processingFeeValue: data.processingFeeValue !== undefined ? parseFloat(data.processingFeeValue) : null,
          disableProcessingIncome: data.disableProcessingIncome !== undefined ? !!data.disableProcessingIncome : false,
          glAccount: data.glAccount || null,
          requireGuarantors: data.requireGuarantors || null,
          whenGuarantorsRequired: data.whenGuarantorsRequired || null,
          minGuarantors: data.minGuarantors !== undefined ? parseInt(data.minGuarantors) : null,
          maxGuarantors: data.maxGuarantors !== undefined ? parseInt(data.maxGuarantors) : null,
          guarantorType: data.guarantorType || null,
          guarantorsRequired: data.guarantorsRequired !== undefined ? !!data.guarantorsRequired : false,
          guarantorName: data.guarantorName || null,
          guarantorAmount: data.guarantorAmount !== undefined ? parseFloat(data.guarantorAmount) : null,
          guarantorNotified: data.guarantorNotified !== undefined ? !!data.guarantorNotified : false,
          requireCollateral: data.requireCollateral || null,
          requireInsurance: data.requireInsurance || null,
          customFields: data.customFields || null,
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
          nature: data.nature || undefined,
          qualificationBasis: data.qualificationBasis || undefined,
          maxAmount: data.maxAmount !== undefined ? parseFloat(data.maxAmount) : undefined,
          maxMultiple: data.maxMultiple !== undefined ? parseFloat(data.maxMultiple) : undefined,
          minQualificationAmount: data.minQualificationAmount !== undefined ? parseFloat(data.minQualificationAmount) : undefined,
          maxQualificationAmount: data.maxQualificationAmount !== undefined ? parseFloat(data.maxQualificationAmount) : undefined,
          periodMonths: data.periodMonths !== undefined ? parseInt(data.periodMonths) : undefined,
          periodType: data.periodType || undefined,
          interestRate: data.interestRate !== undefined ? parseFloat(data.interestRate) : undefined,
          interestType: data.interestType || undefined,
          interestRatePeriod: data.interestRatePeriod || undefined,
          interestFrequency: data.interestFrequency || undefined,
          periodFlexible: data.periodFlexible !== undefined ? String(!!data.periodFlexible) : undefined,
          gracePeriod: data.gracePeriod !== undefined ? parseInt(data.gracePeriod) : undefined,
          principalGrace: data.principalGrace !== undefined ? parseInt(data.principalGrace) : undefined,
          interestGrace: data.interestGrace !== undefined ? parseInt(data.interestGrace) : undefined,
          amortizationMethod: data.amortizationMethod || undefined,
          repaymentFrequency: data.repaymentFrequency || undefined,
          repaymentSequence: data.repaymentSequence || undefined,
          reconciliationCriteria: data.reconciliationCriteria || undefined,
          approvalOfficials: data.approvalOfficials || undefined,
          approvalWorkflow: data.approvalWorkflow || undefined,
          minApprovals: data.minApprovals !== undefined ? parseInt(data.minApprovals) : undefined,
          approvers: data.approvers ? (Array.isArray(data.approvers) ? data.approvers.join(',') : String(data.approvers)) : undefined,
          fineFrequency: data.fineFrequency || undefined,
          fineBase: data.fineBase || undefined,
          lateFineEnabled: data.lateFineEnabled !== undefined ? !!data.lateFineEnabled : undefined,
          lateFineType: data.lateFineType || undefined,
          lateFineValue: data.lateFineValue !== undefined ? parseFloat(data.lateFineValue) : undefined,
          lateFineFrequency: data.lateFineFrequency || undefined,
          lateFineChargeOn: data.lateFineChargeOn || undefined,
          outstandingFineEnabled: data.outstandingFineEnabled !== undefined ? !!data.outstandingFineEnabled : undefined,
          outstandingFineType: data.outstandingFineType || undefined,
          outstandingFineValue: data.outstandingFineValue !== undefined ? parseFloat(data.outstandingFineValue) : undefined,
          outstandingFineFrequency: data.outstandingFineFrequency || undefined,
          outstandingFineChargeOn: data.outstandingFineChargeOn || undefined,
          autoDisburse: data.autoDisburse !== undefined ? !!data.autoDisburse : undefined,
          disburseAccount: data.disburseAccount || undefined,
          autoDisbursement: data.autoDisbursement !== undefined ? !!data.autoDisbursement : undefined,
          processingFeeEnabled: data.processingFeeEnabled !== undefined ? !!data.processingFeeEnabled : undefined,
          processingFee: data.processingFee !== undefined ? parseFloat(data.processingFee) : undefined,
          processingFeeType: data.processingFeeType || undefined,
          processingFeeValue: data.processingFeeValue !== undefined ? parseFloat(data.processingFeeValue) : undefined,
          disableProcessingIncome: data.disableProcessingIncome !== undefined ? !!data.disableProcessingIncome : undefined,
          glAccount: data.glAccount || undefined,
          requireGuarantors: data.requireGuarantors || undefined,
          whenGuarantorsRequired: data.whenGuarantorsRequired || undefined,
          minGuarantors: data.minGuarantors !== undefined ? parseInt(data.minGuarantors) : undefined,
          maxGuarantors: data.maxGuarantors !== undefined ? parseInt(data.maxGuarantors) : undefined,
          guarantorType: data.guarantorType || undefined,
          guarantorsRequired: data.guarantorsRequired !== undefined ? !!data.guarantorsRequired : undefined,
          guarantorName: data.guarantorName || undefined,
          guarantorAmount: data.guarantorAmount !== undefined ? parseFloat(data.guarantorAmount) : undefined,
          guarantorNotified: data.guarantorNotified !== undefined ? !!data.guarantorNotified : undefined,
          requireCollateral: data.requireCollateral || undefined,
          requireInsurance: data.requireInsurance || undefined,
          customFields: data.customFields || undefined,
          lateFinesEnabled: data.lateFinesEnabled !== undefined ? !!data.lateFinesEnabled : undefined,
          lateFinesType: data.lateFinesType || undefined,
          lateFinesValue: data.lateFinesValue !== undefined ? parseFloat(data.lateFinesValue) : undefined,
          outstandingFinesEnabled: data.outstandingFinesEnabled !== undefined ? !!data.outstandingFinesEnabled : undefined,
          outstandingFinesType: data.outstandingFinesType || undefined,
          outstandingFinesValue: data.outstandingFinesValue !== undefined ? parseFloat(data.outstandingFinesValue) : undefined,
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
      nature: loanType.nature,
      qualificationBasis: loanType.qualificationBasis,
      maxAmount: loanType.maxAmount ? parseFloat(loanType.maxAmount.toString()) : null,
      maxMultiple: loanType.maxMultiple ? parseFloat(loanType.maxMultiple.toString()) : null,
      minQualificationAmount: loanType.minQualificationAmount ? parseFloat(loanType.minQualificationAmount.toString()) : null,
      maxQualificationAmount: loanType.maxQualificationAmount ? parseFloat(loanType.maxQualificationAmount.toString()) : null,
      periodMonths: loanType.periodMonths,
      periodType: loanType.periodType,
      interestRate: loanType.interestRate ? parseFloat(loanType.interestRate.toString()) : null,
      interestType: loanType.interestType,
      interestRatePeriod: loanType.interestRatePeriod,
      interestFrequency: loanType.interestFrequency,
      periodFlexible: loanType.periodFlexible,
      gracePeriod: loanType.gracePeriod,
      principalGrace: loanType.principalGrace,
      interestGrace: loanType.interestGrace,
      amortizationMethod: loanType.amortizationMethod,
      repaymentFrequency: loanType.repaymentFrequency,
      repaymentSequence: loanType.repaymentSequence,
      reconciliationCriteria: loanType.reconciliationCriteria,
      approvalOfficials: loanType.approvalOfficials,
      approvalWorkflow: loanType.approvalWorkflow,
      minApprovals: loanType.minApprovals,
      approvers: loanType.approvers,
      fineFrequency: loanType.fineFrequency,
      fineBase: loanType.fineBase,
      lateFineEnabled: loanType.lateFineEnabled,
      lateFineType: loanType.lateFineType,
      lateFineValue: loanType.lateFineValue ? parseFloat(loanType.lateFineValue.toString()) : null,
      lateFineFrequency: loanType.lateFineFrequency,
      lateFineChargeOn: loanType.lateFineChargeOn,
      outstandingFineEnabled: loanType.outstandingFineEnabled,
      outstandingFineType: loanType.outstandingFineType,
      outstandingFineValue: loanType.outstandingFineValue ? parseFloat(loanType.outstandingFineValue.toString()) : null,
      outstandingFineFrequency: loanType.outstandingFineFrequency,
      outstandingFineChargeOn: loanType.outstandingFineChargeOn,
      autoDisburse: loanType.autoDisburse,
      disburseAccount: loanType.disburseAccount,
      autoDisbursement: loanType.autoDisbursement,
      processingFeeEnabled: loanType.processingFeeEnabled,
      processingFee: loanType.processingFee ? parseFloat(loanType.processingFee.toString()) : null,
      processingFeeType: loanType.processingFeeType,
      processingFeeValue: loanType.processingFeeValue ? parseFloat(loanType.processingFeeValue.toString()) : null,
      disableProcessingIncome: loanType.disableProcessingIncome,
      glAccount: loanType.glAccount,
      requireGuarantors: loanType.requireGuarantors,
      whenGuarantorsRequired: loanType.whenGuarantorsRequired,
      minGuarantors: loanType.minGuarantors,
      maxGuarantors: loanType.maxGuarantors,
      guarantorType: loanType.guarantorType,
      guarantorsRequired: loanType.guarantorsRequired,
      guarantorName: loanType.guarantorName,
      guarantorAmount: loanType.guarantorAmount ? parseFloat(loanType.guarantorAmount.toString()) : null,
      guarantorNotified: loanType.guarantorNotified,
      requireCollateral: loanType.requireCollateral,
      requireInsurance: loanType.requireInsurance,
      customFields: loanType.customFields,
      lateFinesEnabled: loanType.lateFinesEnabled,
      lateFinesType: loanType.lateFinesType,
      lateFinesValue: loanType.lateFinesValue ? parseFloat(loanType.lateFinesValue.toString()) : null,
      outstandingFinesEnabled: loanType.outstandingFinesEnabled,
      outstandingFinesType: loanType.outstandingFinesType,
      outstandingFinesValue: loanType.outstandingFinesValue ? parseFloat(loanType.outstandingFinesValue.toString()) : null,
      createdAt: loanType.createdAt,
      updatedAt: loanType.updatedAt,
    };
  }
}
