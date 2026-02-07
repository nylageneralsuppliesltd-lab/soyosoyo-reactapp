import { Controller, Get, Post, Body, Param, Put, Delete, Patch } from '@nestjs/common';
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

  @Patch(':id/approve')
    approve(@Param('id') id: string) {
      return this.loansService.approveLoan(Number(id));
  }

  @Delete(':id')
    remove(@Param('id') id: string) {
      return this.loansService.remove(Number(id));
  }

  @Get(':id/amortization')
  getAmortizationTable(@Param('id') id: string) {
    return this.loansService.getAmortizationTable(Number(id));
  }

  @Get(':id/statement')
  getLoanStatement(@Param('id') id: string) {
    return this.loansService.getLoanStatement(Number(id));
  }

  @Get(':id/comprehensive-statement')
  getComprehensiveLoanStatement(@Param('id') id: string) {
    return this.loansService.getComprehensiveLoanStatement(Number(id));
  }

  @Post('process-late-fines')
  async processLateFines() {
    return this.loansService.processAllOverdueLoans();
  }

  @Post(':id/process-fines')
  async processLoanFines(@Param('id') id: string) {
    const loan = await this.loansService.findOne(Number(id));
    if (!loan) {
      return { success: false, message: 'Loan not found' };
    }
    await this.loansService.imposeFinesIfNeeded(loan);
    return { success: true, message: 'Fines processed successfully' };
  }
}
