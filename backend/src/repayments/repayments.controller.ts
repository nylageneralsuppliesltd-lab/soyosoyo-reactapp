import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { RepaymentsService } from './repayments.service';

@Controller('repayments')
export class RepaymentsController {
  constructor(private readonly repaymentsService: RepaymentsService) {}

  @Post()
  async create(@Body() data: any) {
    return this.repaymentsService.create(data);
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
