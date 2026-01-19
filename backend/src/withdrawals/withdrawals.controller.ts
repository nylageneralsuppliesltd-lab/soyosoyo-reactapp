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
import { WithdrawalsService } from './withdrawals.service';

@Controller('withdrawals')
export class WithdrawalsController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Post()
  async create(@Body() data: any) {
    try {
      console.log('[WithdrawalsController] Creating withdrawal with data:', data);
      const result = await this.withdrawalsService.create(data);
      console.log('[WithdrawalsController] Withdrawal created successfully:', result);
      return result;
    } catch (error) {
      console.error('[WithdrawalsController] Error creating withdrawal:', error);
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          message: error.message || 'Failed to create withdrawal',
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
    return this.withdrawalsService.findAll(
      take ? parseInt(take) : 100,
      skip ? parseInt(skip) : 0,
    );
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
