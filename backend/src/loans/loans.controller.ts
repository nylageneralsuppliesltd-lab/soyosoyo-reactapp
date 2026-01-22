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
      const result = await this.loansService.create(data);
      return { success: true, data: result };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to create loan',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('bank')
  async createBankLoan(@Body() data: any) {
    try {
      const result = await this.loansService.create({
        ...data,
        loanDirection: 'inward',
      });
      return { success: true, data: result };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to create bank loan',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('external')
  async createExternalLoan(@Body() data: any) {
    try {
      const result = await this.loansService.create({
        ...data,
        loanDirection: 'outward',
      });
      return { success: true, data: result };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to create external loan',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('statistics')
  async getStatistics(@Query('direction') direction?: string) {
    try {
      const stats = await this.loansService.getLoanStatistics(direction);
      return { success: true, data: stats };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to fetch statistics',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  async findAll(
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('status') status?: string,
    @Query('direction') direction?: string,
    @Query('external') external?: string,
    @Query('memberId') memberId?: string,
  ) {
    try {
      const result = await this.loansService.findAll(
        take ? parseInt(take) : 100,
        skip ? parseInt(skip) : 0,
        { status, direction, external, memberId },
      );
      return { success: true, ...result };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to fetch loans',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch(':id/approve')
  async approveLoan(@Param('id') id: string) {
    try {
      const result = await this.loansService.approveLoan(parseInt(id));
      return { success: true, message: 'Loan approved', data: result };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to approve loan',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('member/:memberId')
  async findByMember(@Param('memberId') memberId: string) {
    try {
      const result = await this.loansService.findByMember(parseInt(memberId));
      return { success: true, data: result };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to fetch member loans',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('status/:status')
  async findByStatus(@Param('status') status: string) {
    try {
      const result = await this.loansService.findByStatus(status);
      return { success: true, data: result };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to fetch loans by status',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() data: any,
  ) {
    try {
      const result = await this.loansService.update(parseInt(id), data);
      return { success: true, data: result };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to update loan',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      await this.loansService.remove(parseInt(id));
      return { success: true, message: 'Loan deleted successfully' };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to delete loan',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      const result = await this.loansService.findOne(parseInt(id));
      return { success: true, data: result };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Loan not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
