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
import { RepaymentsService } from './repayments.service';

@Controller('repayments')
export class RepaymentsController {
  constructor(private readonly repaymentsService: RepaymentsService) {}

  @Post()
  async create(@Body() data: any) {
    try {
      console.log('[RepaymentsController] Creating repayment with data:', data);
      
      // Validate required fields
      if (!data.amount || isNaN(parseFloat(data.amount)) || parseFloat(data.amount) <= 0) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            message: 'Valid amount is required',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!data.loanId) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            message: 'Loan ID is required',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.repaymentsService.create(data);
      console.log('[RepaymentsController] Repayment created successfully:', result);
      return result;
    } catch (error) {
      console.error('[RepaymentsController] Error creating repayment:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          message: error.message || 'Failed to create repayment',
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
      throw new HttpException(
        { success: false, message: 'Invalid take parameter - must be a positive number' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (isNaN(skipNum) || skipNum < 0) {
      throw new HttpException(
        { success: false, message: 'Invalid skip parameter - must be a non-negative number' },
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.repaymentsService.findAll(takeNum, skipNum);
  }

  @Get('loan/:loanId')
  async findByLoan(@Param('loanId') loanId: string) {
    return this.repaymentsService.findByLoan(parseInt(loanId));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.repaymentsService.findOne(parseInt(id));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() data: any,
  ) {
    const parsedId = parseInt(id);
    if (isNaN(parsedId)) throw new BadRequestException('Invalid repayment ID');

    // Normalize payload
    if (data.amount !== undefined && typeof data.amount === 'string') data.amount = parseFloat(data.amount);
    if (data.penalty !== undefined && typeof data.penalty === 'string') data.penalty = parseFloat(data.penalty);
    if (data.interestPortion !== undefined && typeof data.interestPortion === 'string') data.interestPortion = parseFloat(data.interestPortion);
    if (data.principalPortion !== undefined && typeof data.principalPortion === 'string') data.principalPortion = parseFloat(data.principalPortion);
    if (data.loanId !== undefined) {
      data.loanId = data.loanId === null ? null : parseInt(data.loanId);
      if (data.loanId !== null && isNaN(data.loanId)) throw new BadRequestException('Invalid loanId');
    }
    if (data.accountId !== undefined) {
      data.accountId = data.accountId === null ? null : parseInt(data.accountId);
      if (data.accountId !== null && isNaN(data.accountId)) throw new BadRequestException('Invalid accountId');
    }
    if (data.memberId !== undefined) {
      data.memberId = data.memberId === null ? null : parseInt(data.memberId);
      if (data.memberId !== null && isNaN(data.memberId)) throw new BadRequestException('Invalid memberId');
    }
    if (data.date && typeof data.date === 'string') {
      const d = new Date(data.date); if (isNaN(d.getTime())) throw new BadRequestException('Invalid date');
      data.date = d;
    }
    if (data.description) data.description = String(data.description).trim();
    if (data.reference) data.reference = String(data.reference).trim();
    if (data.narration) data.narration = String(data.narration).trim();
    return this.repaymentsService.update(parsedId, data);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.repaymentsService.remove(parseInt(id));
  }
}
