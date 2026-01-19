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
import { DepositsService } from './deposits.service';

@Controller('deposits')
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Post()
  async create(@Body() data: any) {
    try {
      console.log('[DepositsController] Creating deposit with data:', data);
      const result = await this.depositsService.create(data);
      console.log('[DepositsController] Deposit created successfully:', result);
      return result;
    } catch (error) {
      console.error('[DepositsController] Error creating deposit:', error);
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
    return this.depositsService.findAll(
      take ? parseInt(take) : 100,
      skip ? parseInt(skip) : 0,
    );
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
    return this.depositsService.update(parseInt(id), data);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.depositsService.remove(parseInt(id));
  }
}
