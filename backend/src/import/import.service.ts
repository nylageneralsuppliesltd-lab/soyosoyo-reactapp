import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';

export interface ImportResult {
  members: { succeeded: number; failed: number; errors: string[] };
  accounts: { succeeded: number; failed: number; errors: string[] };
  loans: { succeeded: number; failed: number; errors: string[] };
  deposits: { succeeded: number; failed: number; errors: string[] };
  withdrawals: { succeeded: number; failed: number; errors: string[] };
  summary: { totalRecords: number; totalSucceeded: number; totalFailed: number };
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Process an Excel file and import all data
   */
  async importFromExcel(fileBuffer: any): Promise<ImportResult> {
    let workbook: ExcelJS.Workbook;
    try {
      workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileBuffer);
    } catch (error) {
      throw new BadRequestException('Invalid Excel file format');
    }

    const result: ImportResult = {
      members: { succeeded: 0, failed: 0, errors: [] },
      accounts: { succeeded: 0, failed: 0, errors: [] },
      loans: { succeeded: 0, failed: 0, errors: [] },
      deposits: { succeeded: 0, failed: 0, errors: [] },
      withdrawals: { succeeded: 0, failed: 0, errors: [] },
      summary: { totalRecords: 0, totalSucceeded: 0, totalFailed: 0 },
    };

    // Import order matters: Members → Accounts → Loans → Deposits → Withdrawals
    if (workbook.getWorksheet('Members')) {
      await this.importMembers(workbook.getWorksheet('Members'), result);
    }

    if (workbook.getWorksheet('Accounts')) {
      await this.importAccounts(workbook.getWorksheet('Accounts'), result);
    }

    if (workbook.getWorksheet('LoanTypes')) {
      await this.importLoanTypes(workbook.getWorksheet('LoanTypes'), result);
    }

    if (workbook.getWorksheet('Loans')) {
      await this.importLoans(workbook.getWorksheet('Loans'), result);
    }

    if (workbook.getWorksheet('Deposits')) {
      await this.importDeposits(workbook.getWorksheet('Deposits'), result);
    }

    if (workbook.getWorksheet('Withdrawals')) {
      await this.importWithdrawals(workbook.getWorksheet('Withdrawals'), result);
    }

    // Calculate summary
    result.summary.totalRecords = 
      (result.members.succeeded + result.members.failed) +
      (result.accounts.succeeded + result.accounts.failed) +
      (result.loans.succeeded + result.loans.failed) +
      (result.deposits.succeeded + result.deposits.failed) +
      (result.withdrawals.succeeded + result.withdrawals.failed);

    result.summary.totalSucceeded =
      result.members.succeeded +
      result.accounts.succeeded +
      result.loans.succeeded +
      result.deposits.succeeded +
      result.withdrawals.succeeded;

    result.summary.totalFailed =
      result.members.failed +
      result.accounts.failed +
      result.loans.failed +
      result.deposits.failed +
      result.withdrawals.failed;

    return result;
  }

  /**
   * Import members from Excel worksheet
   */
  private async importMembers(
    worksheet: ExcelJS.Worksheet,
    result: ImportResult,
  ): Promise<void> {
    const rows: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) rows.push(row);
    });

    for (const [index, row] of rows.entries()) {
      try {
        const email = row.getCell(1).value?.toString().trim();
        const phone = row.getCell(2).value?.toString().trim();
        const name = row.getCell(3).value?.toString().trim();
        const joiningDate = row.getCell(4).value;

        if (!email && !phone) {
          throw new Error('Email or phone required');
        }
        if (!name) {
          throw new Error('Full name required');
        }

        // Check if member already exists
        const existing = await this.prisma.member.findFirst({
          where: { OR: [{ email }, { phone }] },
        });

        if (existing) {
          this.logger.warn(`Member ${email || phone} already exists, skipping`);
          result.members.failed++;
          result.members.errors.push(`Row ${index + 2}: Member already exists`);
          continue;
        }

        // Hash password for direct member record
        const hashedPassword = await bcrypt.hash('DefaultPass#2026', 10);

        // Create member directly
        await this.prisma.member.create({
          data: {
            email,
            phone,
            name,
            active: true,
            canLogin: true,
            passwordHash: hashedPassword,
          },
        });

        result.members.succeeded++;
      } catch (error) {
        this.logger.error(`Failed to import member row ${index + 2}:`, error);
        result.members.failed++;
        result.members.errors.push(`Row ${index + 2}: ${error.message}`);
      }
    }

    this.logger.log(`Imported members: ${result.members.succeeded} succeeded, ${result.members.failed} failed`);
  }

  /**
   * Import accounts (cashbox, savings, etc.)
   */
  private async importAccounts(
    worksheet: ExcelJS.Worksheet,
    result: ImportResult,
  ): Promise<void> {
    const rows: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) rows.push(row);
    });

    for (const [index, row] of rows.entries()) {
      try {
        const name = row.getCell(1).value?.toString().trim();
        const type = row.getCell(2).value?.toString().trim();
        const initialBalance = parseFloat(row.getCell(3).value?.toString() || '0');

        if (!name) throw new Error('Account name required');
        if (!type) throw new Error('Account type required');

        // Check if account exists
        const existing = await this.prisma.account.findFirst({
          where: { name },
        });

        if (existing) {
          this.logger.warn(`Account ${name} already exists, skipping`);
          result.accounts.failed++;
          result.accounts.errors.push(`Row ${index + 2}: Account already exists`);
          continue;
        }

        await this.prisma.account.create({
          data: {
            name,
            type: type as any,
            balance: new Prisma.Decimal(initialBalance),
          },
        });

        result.accounts.succeeded++;
      } catch (error) {
        this.logger.error(`Failed to import account row ${index + 2}:`, error);
        result.accounts.failed++;
        result.accounts.errors.push(`Row ${index + 2}: ${error.message}`);
      }
    }

    this.logger.log(`Imported accounts: ${result.accounts.succeeded} succeeded, ${result.accounts.failed} failed`);
  }

  /**
   * Import loan types
   */
  private async importLoanTypes(
    worksheet: ExcelJS.Worksheet,
    result: ImportResult,
  ): Promise<void> {
    const rows: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) rows.push(row);
    });

    for (const [index, row] of rows.entries()) {
      try {
        const name = row.getCell(1).value?.toString().trim();
        const interestRate = parseFloat(row.getCell(2).value?.toString() || '0');
        const periodMonths = parseInt(row.getCell(3).value?.toString() || '12');
        const maxAmount = parseFloat(row.getCell(4).value?.toString() || '100000');

        if (!name) throw new Error('Loan type name required');

        // Skip if already exists
        const existing = await this.prisma.loanType.findFirst({
          where: { name },
        });

        if (existing) {
          result.loans.failed++;
          result.loans.errors.push(`Row ${index + 2}: Loan type ${name} already exists`);
          continue;
        }

        await this.prisma.loanType.create({
          data: {
            name,
            interestRate: new Prisma.Decimal(interestRate),
            periodMonths,
            maxAmount: new Prisma.Decimal(maxAmount),
            interestType: 'flat',
          },
        });

        result.loans.succeeded++;
      } catch (error) {
        this.logger.error(`Failed to import loan type row ${index + 2}:`, error);
        result.loans.failed++;
        result.loans.errors.push(`Row ${index + 2}: ${error.message}`);
      }
    }
  }

  /**
   * Import loans
   */
  private async importLoans(
    worksheet: ExcelJS.Worksheet,
    result: ImportResult,
  ): Promise<void> {
    const rows: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) rows.push(row);
    });

    for (const [index, row] of rows.entries()) {
      try {
        const memberIdentifier = row.getCell(1).value?.toString().trim();
        const loanTypeName = row.getCell(2).value?.toString().trim();
        const amount = parseFloat(row.getCell(3).value?.toString() || '0');
        const balance = parseFloat(row.getCell(4).value?.toString() || amount.toString());
        const disbursementDate = row.getCell(5).value;
        const interestRate = parseFloat(row.getCell(6).value?.toString() || '0');

        if (!memberIdentifier || !loanTypeName || !amount) {
          throw new Error('Member, loan type, and amount required');
        }

        // Find member
        const member = await this.prisma.member.findFirst({
          where: { OR: [{ email: memberIdentifier }, { phone: memberIdentifier }, { name: memberIdentifier }] },
        });

        if (!member) {
          throw new Error(`Member ${memberIdentifier} not found`);
        }

        // Find loan type
        const loanType = await this.prisma.loanType.findFirst({
          where: { name: loanTypeName },
        });

        if (!loanType) {
          throw new Error(`Loan type ${loanTypeName} not found`);
        }

        await this.prisma.loan.create({
          data: {
            memberId: member.id,
            loanTypeId: loanType.id,
            amount: new Prisma.Decimal(amount),
            balance: new Prisma.Decimal(balance),
            disbursementDate: disbursementDate ? new Date(disbursementDate as string) : new Date(),
            interestRate: new Prisma.Decimal(interestRate || loanType.interestRate),
            status: 'pending',
            periodMonths: loanType.periodMonths,
          },
        });

        result.loans.succeeded++;
      } catch (error) {
        this.logger.error(`Failed to import loan row ${index + 2}:`, error);
        result.loans.failed++;
        result.loans.errors.push(`Row ${index + 2}: ${error.message}`);
      }
    }

    this.logger.log(`Imported loans: ${result.loans.succeeded} succeeded, ${result.loans.failed} failed`);
  }

  /**
   * Import deposits/contributions
   */
  private async importDeposits(
    worksheet: ExcelJS.Worksheet,
    result: ImportResult,
  ): Promise<void> {
    const rows: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) rows.push(row);
    });

    for (const [index, row] of rows.entries()) {
      try {
        const memberIdentifier = row.getCell(1).value?.toString().trim();
        const amount = parseFloat(row.getCell(2).value?.toString() || '0');
        const date = row.getCell(3).value || new Date();
        const type = row.getCell(4).value?.toString().trim() || 'contribution';
        const description = row.getCell(5).value?.toString().trim() || '';

        if (!memberIdentifier || !amount) {
          throw new Error('Member and amount required');
        }

        // Find member
        const member = await this.prisma.member.findFirst({
          where: { OR: [{ email: memberIdentifier }, { phone: memberIdentifier }, { name: memberIdentifier }] },
        });

        if (!member) {
          throw new Error(`Member ${memberIdentifier} not found`);
        }

        // Get or create account (default to Cashbox)
        let account = await this.prisma.account.findFirst({
          where: { name: 'Cashbox' },
        });

        if (!account) {
          account = await this.prisma.account.create({
            data: {
              name: 'Cashbox',
              type: 'cash' as any,
              balance: new Prisma.Decimal(0),
            },
          });
        }

        await this.prisma.deposit.create({
          data: {
            memberId: member.id,
            amount: new Prisma.Decimal(amount),
            date: new Date(date as string),
            type: type as any,
            accountId: account.id,
            description,
          },
        });

        result.deposits.succeeded++;
      } catch (error) {
        this.logger.error(`Failed to import deposit row ${index + 2}:`, error);
        result.deposits.failed++;
        result.deposits.errors.push(`Row ${index + 2}: ${error.message}`);
      }
    }

    this.logger.log(`Imported deposits: ${result.deposits.succeeded} succeeded, ${result.deposits.failed} failed`);
  }

  /**
   * Import withdrawals
   */
  private async importWithdrawals(
    worksheet: ExcelJS.Worksheet,
    result: ImportResult,
  ): Promise<void> {
    const rows: any[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) rows.push(row);
    });

    for (const [index, row] of rows.entries()) {
      try {
        const memberIdentifier = row.getCell(1).value?.toString().trim();
        const amount = parseFloat(row.getCell(2).value?.toString() || '0');
        const date = row.getCell(3).value || new Date();
        const type = row.getCell(4).value?.toString().trim() || 'expense';
        const description = row.getCell(5).value?.toString().trim() || '';

        if (!memberIdentifier || !amount) {
          throw new Error('Member and amount required');
        }

        // Find member (optional for some withdrawal types)
        let memberId: number | null = null;
        if (memberIdentifier !== 'N/A') {
          const member = await this.prisma.member.findFirst({
            where: { OR: [{ email: memberIdentifier }, { phone: memberIdentifier }, { name: memberIdentifier }] },
          });

          if (member) {
            memberId = member.id;
          }
        }

        // Get or create account (default to Cashbox)
        let account = await this.prisma.account.findFirst({
          where: { name: 'Cashbox' },
        });

        if (!account) {
          account = await this.prisma.account.create({
            data: {
              name: 'Cashbox',
              type: 'cash' as any,
              balance: new Prisma.Decimal(0),
            },
          });
        }

        await this.prisma.withdrawal.create({
          data: {
            memberId,
            amount: new Prisma.Decimal(amount),
            date: new Date(date as string),
            type: type as any,
            accountId: account.id,
            description,
          },
        });

        result.withdrawals.succeeded++;
      } catch (error) {
        this.logger.error(`Failed to import withdrawal row ${index + 2}:`, error);
        result.withdrawals.failed++;
        result.withdrawals.errors.push(`Row ${index + 2}: ${error.message}`);
      }
    }

    this.logger.log(
      `Imported withdrawals: ${result.withdrawals.succeeded} succeeded, ${result.withdrawals.failed} failed`,
    );
  }
}
