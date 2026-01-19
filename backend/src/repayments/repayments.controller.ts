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
} from '@nestjs/common';
import { RepaymentsService } from './repayments.service';

@Controller('repayments')
export class RepaymentsController {
  constructor(private readonly repaymentsService: RepaymentsService) {}

  @Post()
  async create(@Body() data: any) {
    try {
      console.log('[RepaymentsController] Creating repayment with data:', data);
      const result = await this.repaymentsService.create(data);
      console.log('[RepaymentsController] Repayment created successfully:', result);
      return result;
    } catch (error) {
      console.error('[RepaymentsController] Error creating repayment:', error);
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
    return this.repaymentsService.findAll(
      take ? parseInt(take) : 100,
      skip ? parseInt(skip) : 0,
    );
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
    return this.repaymentsService.update(parseInt(id), data);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.repaymentsService.remove(parseInt(id));
  }
}
