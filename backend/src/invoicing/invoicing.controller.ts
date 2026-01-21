import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { PrismaService } from '../prisma.service';

@Controller('invoicing')
export class InvoicingController {
  constructor(
    private readonly invoicingService: InvoicingService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Manually trigger invoice generation (for testing/admin).
   */
  @Post('trigger-generation')
  async triggerInvoiceGeneration() {
    return {
      message: 'Invoice generation triggered manually',
      timestamp: new Date(),
    };
  }

  /**
   * Get all invoices for a member.
   */
  @Get('member/:memberId')
  async getMemberInvoices(@Param('memberId') memberId: string) {
    return this.prisma.memberInvoice.findMany({
      where: { memberId: parseInt(memberId) },
      include: { contributionType: true },
      orderBy: { invoiceDate: 'desc' },
    });
  }

  /**
   * Get all invoices (admin dashboard).
   */
  @Get('all')
  async getAllInvoices() {
    return this.prisma.memberInvoice.findMany({
      include: { member: true, contributionType: true },
      orderBy: { invoiceDate: 'desc' },
      take: 500,
    });
  }

  /**
   * Get invoice details with audit log.
   */
  @Get('detail/:invoiceId')
  async getInvoiceDetail(@Param('invoiceId') invoiceId: string) {
    const invoice = await this.prisma.memberInvoice.findUnique({
      where: { id: parseInt(invoiceId) },
      include: {
        member: true,
        contributionType: true,
        logs: { orderBy: { createdAt: 'desc' } },
        ledgerEntries: true,
      },
    });
    return invoice;
  }

  /**
   * Mark invoice as paid.
   */
  @Post(':invoiceId/mark-paid')
  async markInvoiceAsPaid(@Param('invoiceId') invoiceId: string, @Body() data: any) {
    const paidAmount = data.paidAmount || data.amount;
    return this.prisma.memberInvoice.update({
      where: { id: parseInt(invoiceId) },
      data: {
        status: 'paid',
        paidAmount,
        paidDate: new Date(),
      },
    });
  }

  /**
   * Get invoice statistics (for dashboard).
   */
  @Get('stats/summary')
  async getInvoiceStats() {
    const total = await this.prisma.memberInvoice.count();
    const sent = await this.prisma.memberInvoice.count({ where: { status: 'sent' } });
    const paid = await this.prisma.memberInvoice.count({ where: { status: 'paid' } });
    const overdue = await this.prisma.memberInvoice.count({ where: { status: 'overdue' } });

    const totalAmount = await this.prisma.memberInvoice.aggregate({
      _sum: { amount: true },
    });

    const paidAmount = await this.prisma.memberInvoice.aggregate({
      where: { status: 'paid' },
      _sum: { paidAmount: true },
    });

    const totalAmountNum = totalAmount._sum.amount ? Number(totalAmount._sum.amount) : 0;
    const paidAmountNum = paidAmount._sum.paidAmount ? Number(paidAmount._sum.paidAmount) : 0;

    return {
      total,
      sent,
      paid,
      overdue,
      totalAmount: totalAmountNum,
      paidAmount: paidAmountNum,
      outstanding: totalAmountNum - paidAmountNum,
    };
  }
}
