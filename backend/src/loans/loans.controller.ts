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
import { LoansService } from './loans.service';

@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post()
  async create(@Body() data: any) {
    try {
      console.log('[LoansController] Creating loan with data:', data);
      const result = await this.loansService.create(data);
      console.log('[LoansController] Loan created successfully:', result);
      return result;
    } catch (error) {
      console.error('[LoansController] Error creating loan:', error);
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          message: error.message || 'Failed to create loan',
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
    return this.loansService.findAll(
      take ? parseInt(take) : 100,
      skip ? parseInt(skip) : 0,
    );
  }

  @Get('member/:memberId')
  async findByMember(@Param('memberId') memberId: string) {
    return this.loansService.findByMember(parseInt(memberId));
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
