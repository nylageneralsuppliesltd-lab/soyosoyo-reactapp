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
} from '@nestjs/common';
import { WithdrawalsService } from './withdrawals.service';

@Controller('withdrawals')
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Post('expense')
  async createExpense(@Body() data: any) {
    try {
      // Validate required fields
      if (!data.amount || isNaN(parseFloat(data.amount)) || parseFloat(data.amount) <= 0) {
        throw new BadRequestException('Valid amount is required');
      }
      if (!data.category || typeof data.category !== 'string' || data.category.trim() === '') {
        throw new BadRequestException('Expense category is required');
      }

      return await this.withdrawalsService.createExpense(data);
    } catch (error) {
      // If it's already an HttpException, rethrow it
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to create expense',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('transfer')
  async createTransfer(@Body() data: any) {
    try {
      // Validate required fields
      if (!data.amount || isNaN(parseFloat(data.amount)) || parseFloat(data.amount) <= 0) {
        throw new BadRequestException('Valid amount is required');
      }

      return await this.withdrawalsService.createTransfer(data);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to create transfer',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('refund')
  async createRefund(@Body() data: any) {
    try {
      // Validate required fields
      if (!data.amount || isNaN(parseFloat(data.amount)) || parseFloat(data.amount) <= 0) {
        throw new BadRequestException('Valid amount is required');
      }

      return await this.withdrawalsService.createRefund(data);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to create refund',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('dividend')
  async createDividend(@Body() data: any) {
    try {
      // Validate required fields
      if (!data.amount || isNaN(parseFloat(data.amount)) || parseFloat(data.amount) <= 0) {
        throw new BadRequestException('Valid amount is required');
      }

      return await this.withdrawalsService.createDividend(data);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to create dividend payout',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('stats')
  async getStats() {
    return this.withdrawalsService.getWithdrawalStats();
  }

  @Get()
  async findAll(
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    // Validate and parse query parameters
    const takeNum = take ? parseInt(take, 10) : 100;
    const skipNum = skip ? parseInt(skip, 10) : 0;

    if (isNaN(takeNum) || takeNum < 0) {
      throw new BadRequestException('Invalid take parameter - must be a positive number');
    }

    if (isNaN(skipNum) || skipNum < 0) {
      throw new BadRequestException('Invalid skip parameter - must be a non-negative number');
    }

    return this.withdrawalsService.findAll(takeNum, skipNum);
  }

  @Get('member/:memberId')
  async findByMember(@Param('memberId') memberId: string) {
    return this.withdrawalsService.findByMember(parseInt(memberId));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.withdrawalsService.findOne(parseInt(id));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.withdrawalsService.update(parseInt(id), data);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.withdrawalsService.remove(parseInt(id));
  }
}
