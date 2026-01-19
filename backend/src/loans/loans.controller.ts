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
import { LoansService } from './loans.service';

@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post()
  async create(@Body() data: any) {
    return this.loansService.create(data);
  }

  @Get()
  async findAll(
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.loansService.findAll(
      take ? parseInt(take) : 100,
      skip ? parseInt(skip) : 0,
    );
  }

  @Get('borrower/:borrowerId')
  async findByBorrower(@Param('borrowerId') borrowerId: string) {
    return this.loansService.findByBorrower(parseInt(borrowerId));
  }

  @Get('status/:status')
  async findByStatus(@Param('status') status: string) {
    return this.loansService.findByStatus(status);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.loansService.findOne(parseInt(id));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.loansService.update(parseInt(id), data);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.loansService.remove(parseInt(id));
  }
}
