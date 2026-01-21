import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';

@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Run daily at 2:00 AM to check for invoices that need to be generated and sent.
   * Triggered by invoiceDate on ContributionType.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async generateAndSendInvoices(): Promise<void> {
    this.logger.log('🔔 Starting invoice generation and sending process...');
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find all contribution types with active invoicing and invoiceDate = today
      const activeContributions = await this.prisma.contributionType.findMany({
        where: {
          visibleInvoicing: true,
          invoiceDate: {
            equals: today,
          },
        },
      });

      this.logger.log(`Found ${activeContributions.length} active contribution type(s) with invoicing scheduled for today`);

      for (const contribution of activeContributions) {
        await this.processContributionInvoicing(contribution);
      }

      this.logger.log('✅ Invoice generation process completed');
    } catch (error) {
      this.logger.error('❌ Error in invoice generation process:', error);
    }
  }

  /**
   * Process invoicing for a specific contribution type.
   * Generate invoices for all members (or filtered), post ledger entries, send notifications.
   */
  private async processContributionInvoicing(contribution: any): Promise<void> {
    this.logger.log(`📄 Processing invoicing for contribution type: ${contribution.name}`);

    try {
      // Fetch target members
      let members;
      if (contribution.invoiceAllMembers) {
        members = await this.prisma.member.findMany({
          where: { active: true },
        });
      } else {
        // Future: implement segmented member filtering
        members = await this.prisma.member.findMany({
          where: { active: true },
        });
      }

      this.logger.log(`Generating invoices for ${members.length} member(s)`);

      for (const member of members) {
        try {
          await this.createAndPostInvoice(member, contribution);
        } catch (error) {
          this.logger.error(`Error processing invoice for member ${member.id} (${member.name}):`, error);
          // Continue to next member
        }
      }

      this.logger.log(`✅ Completed invoicing for contribution type: ${contribution.name}`);
    } catch (error) {
      this.logger.error(`Error processing contribution invoicing for ${contribution.name}:`, error);
    }
  }

  /**
   * Create a MemberInvoice and post a ledger entry (debit) for the member.
   * Optionally send SMS/Email notifications.
   */
  private async createAndPostInvoice(member: any, contribution: any): Promise<void> {
    const invoiceNumber = this.generateInvoiceNumber(member.id, contribution.id);

    // Create MemberInvoice
    const invoice = await this.prisma.memberInvoice.create({
      data: {
        invoiceNumber,
        memberId: member.id,
        contributionTypeId: contribution.id,
        amount: contribution.amount,
        invoiceDate: new Date(),
        dueDate: contribution.dueDate || new Date(),
        status: 'sent',
        description: `Invoice for ${contribution.name}`,
      },
    });

    this.logger.log(`Created invoice #${invoiceNumber} for member ${member.name}`);

    // Post ledger entry (debit to member account)
    const currentBalance = await this.getMemberBalance(member.id);
    const newBalance = currentBalance - parseFloat(contribution.amount.toString());

    await this.prisma.ledger.create({
      data: {
        memberId: member.id,
        type: 'contribution_invoice',
        amount: parseFloat(contribution.amount.toString()),
        description: `Invoice debit: ${contribution.name}`,
        reference: invoiceNumber,
        balanceAfter: newBalance,
        memberInvoiceId: invoice.id,
      },
    });

    this.logger.log(`Posted ledger entry for invoice #${invoiceNumber}`);

    // Send notifications if enabled
    if (contribution.smsNotifications) {
      await this.sendSmsNotification(member, invoice, contribution);
    }

    if (contribution.emailNotifications) {
      await this.sendEmailNotification(member, invoice, contribution);
    }

    // Log invoice generation
    await this.logInvoiceAction(invoice.id, 'generated', 'success');
  }

  /**
   * Get current balance of a member from their latest ledger entry.
   */
  private async getMemberBalance(memberId: number): Promise<number> {
    const latest = await this.prisma.ledger.findFirst({
      where: { memberId },
      orderBy: { date: 'desc' },
    });
    return latest ? latest.balanceAfter : 0;
  }

  /**
   * Send SMS notification (placeholder - integrate with actual SMS service).
   */
  private async sendSmsNotification(member: any, invoice: any, contribution: any): Promise<void> {
    try {
      // TODO: Integrate with Twilio, Africa's Talking, or other SMS provider
      this.logger.log(`📱 SMS notification scheduled for member ${member.phone}: Invoice #${invoice.invoiceNumber}`);

      await this.logInvoiceAction(invoice.id, 'sent_sms', 'success', {
        phone: member.phone,
        message: `You have a new invoice for ${contribution.name}: KES ${contribution.amount}. Due by ${invoice.dueDate}`,
      });

      // Mark as sent
      await this.prisma.memberInvoice.update({
        where: { id: invoice.id },
        data: { smsNotificationSent: true, notificationSentAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`Failed to send SMS to member ${member.id}:`, error);
      await this.logInvoiceAction(invoice.id, 'sent_sms', 'failed', { error: error.message });
    }
  }

  /**
   * Send Email notification (placeholder - integrate with actual Email service).
   */
  private async sendEmailNotification(member: any, invoice: any, contribution: any): Promise<void> {
    try {
      // TODO: Integrate with SendGrid, AWS SES, Nodemailer, or other email service
      if (!member.email) {
        this.logger.warn(`No email found for member ${member.id}`);
        return;
      }

      this.logger.log(`📧 Email notification scheduled for member ${member.email}: Invoice #${invoice.invoiceNumber}`);

      await this.logInvoiceAction(invoice.id, 'sent_email', 'success', {
        email: member.email,
        subject: `Invoice #${invoice.invoiceNumber} - ${contribution.name}`,
        body: `You have a new invoice for ${contribution.name}: KES ${contribution.amount}. Due by ${invoice.dueDate}`,
      });

      // Mark as sent
      await this.prisma.memberInvoice.update({
        where: { id: invoice.id },
        data: { emailNotificationSent: true, notificationSentAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`Failed to send email to member ${member.id}:`, error);
      await this.logInvoiceAction(invoice.id, 'sent_email', 'failed', { error: error.message });
    }
  }

  /**
   * Log invoice action to InvoiceLog for audit trail.
   */
  private async logInvoiceAction(invoiceId: number, action: string, status: string, details?: any): Promise<void> {
    try {
      await this.prisma.invoiceLog.create({
        data: {
          memberInvoiceId: invoiceId,
          action,
          status,
          details: details || {},
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log invoice action: ${action}`, error);
    }
  }

  /**
   * Generate unique invoice number: INVYMMDD-MEMBERID-CONTRIBID
   */
  private generateInvoiceNumber(memberId: number, contributionTypeId: number): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `INV${yyyy}${mm}${dd}-${memberId}-${contributionTypeId}`;
  }

  /**
   * Check for overdue invoices and send reminders (optional - can be a separate cron).
   */
  @Cron('0 9 * * 1') // Every Monday at 9 AM
  async checkOverdueAndRemind(): Promise<void> {
    this.logger.log('⏰ Checking for overdue invoices...');
    try {
      const overdueInvoices = await this.prisma.memberInvoice.findMany({
        where: {
          status: { in: ['sent', 'viewed'] },
          dueDate: {
            lt: new Date(),
          },
        },
        include: { member: true, contributionType: true },
      });

      this.logger.log(`Found ${overdueInvoices.length} overdue invoice(s)`);

      for (const invoice of overdueInvoices) {
        // Update status to overdue
        await this.prisma.memberInvoice.update({
          where: { id: invoice.id },
          data: { status: 'overdue' },
        });

        // Send overdue reminder SMS/Email
        if (invoice.contributionType?.smsNotifications) {
          this.logger.log(`📱 Overdue reminder SMS for member ${invoice.member.phone}: Invoice #${invoice.invoiceNumber}`);
          await this.logInvoiceAction(invoice.id, 'overdue_reminder', 'success');
        }

        // Auto-create and post late contribution fine if configured
        if (
          invoice.contributionType?.lateFineEnabled &&
          Number(invoice.contributionType.lateFineAmount || 0) > 0 &&
          this.hasPassedGracePeriod(invoice)
        ) {
          const existingFine = await this.prisma.fine.findFirst({
            where: {
              memberInvoiceId: invoice.id,
              memberId: invoice.memberId,
              type: 'late_payment',
            },
          });

          if (!existingFine) {
            try {
              await this.createLateFineForInvoice(invoice);
            } catch (error) {
              this.logger.error(`Failed to create late fine for invoice ${invoice.invoiceNumber}`, error);
              await this.logInvoiceAction(invoice.id, 'late_fine', 'failed', { error: error?.message });
            }
          }
        }
      }

      this.logger.log('✅ Overdue check completed');
    } catch (error) {
      this.logger.error('Error in overdue check:', error);
    }
  }

  /**
   * Create a late payment fine tied to an overdue invoice and post it to the member ledger.
   */
  private async createLateFineForInvoice(invoice: any): Promise<void> {
    const fineAmountNum = Number(invoice.contributionType?.lateFineAmount || 0);
    if (fineAmountNum <= 0) return;

    const fine = await this.prisma.fine.create({
      data: {
        memberId: invoice.memberId,
        type: 'late_payment',
        reason: `Late contribution payment - ${invoice.contributionType?.name || 'Contribution'}`,
        amount: fineAmountNum,
        status: 'unpaid',
        dueDate: new Date(),
        memberInvoiceId: invoice.id,
        notes: `Auto-generated for overdue invoice ${invoice.invoiceNumber}`,
      },
    });

    // Post member ledger debit for the fine
    const currentBalance = await this.getMemberBalance(invoice.memberId);
    const newBalance = currentBalance - fineAmountNum;

    await this.prisma.ledger.create({
      data: {
        memberId: invoice.memberId,
        type: 'fine',
        amount: fineAmountNum,
        description: `Late fine: ${invoice.contributionType?.name || 'Contribution'}`,
        reference: `FINE-${invoice.invoiceNumber}`,
        balanceAfter: newBalance,
        memberInvoiceId: invoice.id,
      },
    });

    await this.logInvoiceAction(invoice.id, 'late_fine', 'success', { fineId: fine.id, amount: fineAmountNum });
  }

  /**
   * Respect grace period before applying fines.
   */
  private hasPassedGracePeriod(invoice: any): boolean {
    const graceDays = invoice.contributionType?.lateFineGraceDays || 0;
    const graceDate = new Date(invoice.dueDate);
    graceDate.setDate(graceDate.getDate() + graceDays);
    return new Date() > graceDate;
  }
}
