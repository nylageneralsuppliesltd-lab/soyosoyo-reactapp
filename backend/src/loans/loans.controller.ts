import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { LoansService } from './loans.service';

@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Get()
  findAll() {
    return this.loansService.findAll();
  }

  @Get(':id')
    findOne(@Param('id') id: string) {
      return this.loansService.findOne(Number(id));
  }

  @Post()
  create(@Body() createLoanDto: any) {
    return this.loansService.create(createLoanDto);
  }

  @Put(':id')
    update(@Param('id') id: string, @Body() updateLoanDto: any) {
      return this.loansService.update(Number(id), updateLoanDto);
  }

  @Delete(':id')
    remove(@Param('id') id: string) {
      return this.loansService.remove(Number(id));
  }
}
