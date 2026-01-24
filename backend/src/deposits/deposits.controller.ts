import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpException,
  HttpStatus,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DepositsService, BulkPaymentRecord, BulkImportResult } from './deposits.service';

@Controller('deposits')
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Post()
  async create(@Body() data: any) {
    try {
      console.log('[DepositsController] Creating deposit with data:', data);
      
      // Validate required fields
      if (!data.amount || isNaN(parseFloat(data.amount)) || parseFloat(data.amount) <= 0) {
        throw new BadRequestException('Valid amount is required');
      }
      if (!data.memberName && !data.memberId) {
        throw new BadRequestException('Member name or ID is required');
      }

      const result = await this.depositsService.create(data);
      console.log('[DepositsController] Deposit created successfully:', result);
      return result;
    } catch (error) {
      console.error('[DepositsController] Error creating deposit:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          message: error.message || 'Failed to create deposit',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get()
  async findAll(
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const takeNum = take ? parseInt(take, 10) : 100;
    const skipNum = skip ? parseInt(skip, 10) : 0;

    if (isNaN(takeNum) || takeNum < 0) {
      throw new BadRequestException('Invalid take parameter - must be a positive number');
    }
    if (isNaN(skipNum) || skipNum < 0) {
      throw new BadRequestException('Invalid skip parameter - must be a non-negative number');
    }

    return this.depositsService.findAll(takeNum, skipNum);
  }

  @Get('member/:memberId')
  async findByMember(@Param('memberId') memberId: string) {
    return this.depositsService.findByMember(parseInt(memberId));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.depositsService.findOne(parseInt(id));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() data: any,
  ) {
    try {
      const parsedId = parseInt(id);
      if (isNaN(parsedId)) {
        throw new BadRequestException('Invalid deposit ID');
      }
      
      // Ensure amount is a number (Prisma will convert to Decimal)
      if (data.amount !== undefined && typeof data.amount === 'string') {
        data.amount = parseFloat(data.amount);
      }
      
      const result = await this.depositsService.update(parsedId, data);
      return result;
    } catch (error) {
      console.error(`Error updating deposit ${id}:`, error.message);
      throw error;
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.depositsService.remove(parseInt(id));
  }

  /**
   * Bulk import payments from JSON array
   * POST /deposits/bulk/import-json
   */
  @Post('bulk/import-json')
  async bulkImportJson(@Body() body: { payments: BulkPaymentRecord[] }): Promise<BulkImportResult> {
    try {
      if (!body.payments || !Array.isArray(body.payments)) {
        throw new BadRequestException('Payments array is required');
      }

      if (body.payments.length === 0) {
        throw new BadRequestException('At least one payment record is required');
      }

      const result = await this.depositsService.processBulkPayments(body.payments);
      return result;
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          message: error.message || 'Bulk import failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Get bulk import template/structure
   * GET /deposits/bulk/template
   */
  @Get('bulk/template')
  getBulkTemplate() {
    return {
      description:
        'Bulk payment import template. All fields required except accountId, reference, notes',
      example: {
        payments: [
          {
            date: '2026-01-22',
            memberName: 'John Doe',
            memberId: 1,
            amount: 5000,
            paymentType: 'contribution', // contribution | fine | loan_repayment | income | miscellaneous
            contributionType: 'Monthly Savings', // optional, for custom types
            paymentMethod: 'cash', // cash | bank | mpesa | check_off | bank_deposit | other
            accountId: 1, // optional, defaults to Cashbox
            reference: 'REF-001',
            notes: 'Member payment',
          },
        ],
      },
      fields: {
        date: 'ISO 8601 date (YYYY-MM-DD)',
        memberName: 'Full name or phone number of member',
        memberId: 'Member ID (used to look up if name not found)',
        amount: 'Positive number, payment amount in KES',
        paymentType:
          'contribution | fine | loan_repayment | income | miscellaneous',
        contributionType: 'Custom contribution type (optional)',
        paymentMethod: 'cash | bank | mpesa | check_off | bank_deposit | other',
        accountId: 'Account ID (optional, defaults to Cashbox)',
        reference: 'Transaction reference (optional)',
        notes: 'Additional notes (optional)',
      },
    };
  }
}
