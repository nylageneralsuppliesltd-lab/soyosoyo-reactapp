import { Controller, Post, Get, UseInterceptors, UploadedFile, BadRequestException, HttpException, HttpStatus, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { ImportService, ImportResult } from './import.service';
import { Access } from '../auth/access.decorator';

@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Get('excel-template-download')
  async downloadTemplate(@Res() res: Response) {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.removeWorksheet('Sheet1');

      // MEMBERS Sheet
      const membersWs = workbook.addWorksheet('Members', { state: 'visible' });
      membersWs.columns = [
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Full Name', key: 'fullName', width: 20 },
        { header: 'Join Date (YYYY-MM-DD)', key: 'joinDate', width: 20 },
      ];
      membersWs.addRows([
        {
          email: 'john.doe@example.com',
          phone: '+254712345678',
          fullName: 'John Doe',
          joinDate: '2025-01-15',
        },
      ]);

      // ACCOUNTS Sheet
      const accountsWs = workbook.addWorksheet('Accounts', { state: 'visible' });
      accountsWs.columns = [
        { header: 'Account Name', key: 'name', width: 20 },
        { header: 'Type (CASH/BANK/SAVINGS)', key: 'type', width: 20 },
        { header: 'Initial Balance', key: 'balance', width: 15 },
      ];
      accountsWs.addRows([
        { name: 'Cashbox', type: 'CASH', balance: 50000 },
        { name: 'Main Bank', type: 'BANK', balance: 500000 },
      ]);

      // LOAN TYPES Sheet
      const loanTypesWs = workbook.addWorksheet('LoanTypes', { state: 'visible' });
      loanTypesWs.columns = [
        { header: 'Loan Type Name', key: 'name', width: 20 },
        { header: 'Interest Rate (%)', key: 'rate', width: 15 },
        { header: 'Period (months)', key: 'period', width: 15 },
        { header: 'Max Amount', key: 'maxAmount', width: 15 },
      ];
      loanTypesWs.addRows([
        { name: 'Personal Loan', rate: 12, period: 12, maxAmount: 50000 },
      ]);

      // LOANS Sheet
      const loansWs = workbook.addWorksheet('Loans', { state: 'visible' });
      loansWs.columns = [
        { header: 'Member (Email/Phone/Name)', key: 'member', width: 25 },
        { header: 'Loan Type', key: 'loanType', width: 20 },
        { header: 'Amount', key: 'amount', width: 15 },
        { header: 'Balance', key: 'balance', width: 15 },
        { header: 'Disbursement Date', key: 'date', width: 18 },
        { header: 'Interest Rate (%)', key: 'rate', width: 15 },
      ];

      // DEPOSITS Sheet
      const depositsWs = workbook.addWorksheet('Deposits', { state: 'visible' });
      depositsWs.columns = [
        { header: 'Member (Email/Phone/Name)', key: 'member', width: 25 },
        { header: 'Amount', key: 'amount', width: 15 },
        { header: 'Date (YYYY-MM-DD)', key: 'date', width: 18 },
        { header: 'Type', key: 'type', width: 20 },
        { header: 'Description', key: 'notes', width: 30 },
      ];

      // WITHDRAWALS Sheet
      const withdrawalsWs = workbook.addWorksheet('Withdrawals', { state: 'visible' });
      withdrawalsWs.columns = [
        { header: 'Member (Email/Phone/Name or N/A)', key: 'member', width: 25 },
        { header: 'Amount', key: 'amount', width: 15 },
        { header: 'Date (YYYY-MM-DD)', key: 'date', width: 18 },
        { header: 'Type', key: 'type', width: 20 },
        { header: 'Description', key: 'notes', width: 30 },
      ];

      // Format headers
      Object.values(workbook.worksheets).forEach((ws) => {
        ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        ws.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' },
        };
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=import-template.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      res.status(500).send('Failed to generate template');
    }
  }

  @Post('excel')
  @Access('settings', 'write')
  @UseInterceptors(FileInterceptor('file'))
  async uploadExcel(@UploadedFile() file: any): Promise<ImportResult> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (!file.originalname.endsWith('.xlsx') && !file.originalname.endsWith('.xls')) {
      throw new BadRequestException('Only Excel files (.xlsx, .xls) are supported');
    }

    try {
      const result = await this.importService.importFromExcel(file.buffer);
      return result;
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          message: error.message || 'Excel import failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('excel-template')
  async getExcelTemplate() {
    return {
      message: 'Visit GET /import/excel-template to download template',
      worksheets: [
        'Members',
        'Accounts',
        'LoanTypes',
        'Loans',
        'Deposits',
        'Withdrawals',
      ],
      description: 'Download the Excel template with all required sheets and columns',
    };
  }
}
