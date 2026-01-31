
  // Get full loan statement (repayments, fines, schedule)
  @Get(':id/statement')
  async getLoanStatement(@Param('id') id: string) {
    try {
      const loan = await this.loansService.findOne(parseInt(id));
      if (!loan) throw new Error('Loan not found');
      // Get repayments and fines
      const repayments = loan.repayments || [];
      const fines = (loan.fines || []);
      // Compose statement
      return {
        success: true,
        data: {
          loan,
          repayments,
          fines,
          schedule: loan.schedule || [],
        }
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Get amortization table only
  @Get(':id/amortization')
  async getLoanAmortization(@Param('id') id: string) {
    try {
      const loan = await this.loansService.findOne(parseInt(id));
      if (!loan) throw new Error('Loan not found');
      return { success: true, schedule: loan.schedule || [] };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
import { EclService } from '../ifrs/ecl.service';
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
import { LoansService } from './loans.service';

@Controller('loans')
export class LoansController {
  constructor(
    private readonly loansService: LoansService,
    private readonly eclService: EclService
  ) {}

  // IFRS 9: Trigger ECL calculation and update all loans
  @Post('ifrs/ecl')
  async runEclCalculation() {
    try {
      const result = await this.eclService.runEcl(false, 'manual');
      return { success: true, ...result };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  @Post()
  async create(@Body() data: any) {
    try {
      // Validate required fields
      if (!data.amount || isNaN(parseFloat(data.amount)) || parseFloat(data.amount) <= 0) {
        throw new BadRequestException('Valid loan amount is required');
      }

      // At least one borrower identifier is required
      if (!data.memberName && !data.memberId && !data.bankName && !data.externalName && !data.borrower) {
        throw new BadRequestException('Member name, bank name, or external borrower name is required');
      }

      const result = await this.loansService.create(data);
      return { success: true, data: result };
    } catch (error) {
      // If it's already an HttpException, rethrow it
      if (error instanceof HttpException) {
        throw error;
      }
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
      // Validate required fields
      if (!data.amount || isNaN(parseFloat(data.amount)) || parseFloat(data.amount) <= 0) {
        throw new BadRequestException('Valid loan amount is required');
      }
      if (!data.bankName) {
        throw new BadRequestException('Bank name is required');
      }

      const result = await this.loansService.create({
        ...data,
        loanDirection: 'inward',
      });
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
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
      // Validate required fields
      if (!data.amount || isNaN(parseFloat(data.amount)) || parseFloat(data.amount) <= 0) {
        throw new BadRequestException('Valid loan amount is required');
      }
      if (!data.externalName) {
        throw new BadRequestException('External borrower name is required');
      }

      const result = await this.loansService.create({
        ...data,
        loanDirection: 'outward',
      });
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
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
      // Validate and parse query parameters, provide safe defaults
      const takeNum = take ? parseInt(take, 10) : 100;
      const skipNum = skip ? parseInt(skip, 10) : 0;

      // Validate parsed values are valid numbers
      if (isNaN(takeNum) || takeNum < 0) {
        throw new HttpException(
          {
            success: false,
            message: 'Invalid take parameter - must be a positive number',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (isNaN(skipNum) || skipNum < 0) {
        throw new HttpException(
          {
            success: false,
            message: 'Invalid skip parameter - must be a non-negative number',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const result = await this.loansService.findAll(
        takeNum,
        skipNum,
        { status, direction, external, memberId },
      );
      return { success: true, ...result };
    } catch (error) {
      // If it's already an HttpException, rethrow it
      if (error instanceof HttpException) {
        throw error;
      }
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
      const parsedId = parseInt(id);
      if (isNaN(parsedId)) throw new BadRequestException('Invalid loan ID');

      // Normalize payload
      if (data.amount !== undefined && typeof data.amount === 'string') data.amount = parseFloat(data.amount);
      if (data.principal !== undefined && typeof data.principal === 'string') data.principal = parseFloat(data.principal);
      if (data.interestRate !== undefined && typeof data.interestRate === 'string') data.interestRate = parseFloat(data.interestRate);
      if (data.tenureMonths !== undefined && typeof data.tenureMonths === 'string') data.tenureMonths = parseInt(data.tenureMonths);
      if (data.memberId !== undefined) {
        data.memberId = data.memberId === null ? null : parseInt(data.memberId);
        if (data.memberId !== null && isNaN(data.memberId)) throw new BadRequestException('Invalid memberId');
      }
      if (data.loanTypeId !== undefined) {
        data.loanTypeId = data.loanTypeId === null ? null : parseInt(data.loanTypeId);
        if (data.loanTypeId !== null && isNaN(data.loanTypeId)) throw new BadRequestException('Invalid loanTypeId');
      }
      if (data.startDate && typeof data.startDate === 'string') {
        const d = new Date(data.startDate); if (isNaN(d.getTime())) throw new BadRequestException('Invalid startDate');
        data.startDate = d;
      }
      if (data.endDate && typeof data.endDate === 'string') {
        const d = new Date(data.endDate); if (isNaN(d.getTime())) throw new BadRequestException('Invalid endDate');
        data.endDate = d;
      }
      if (data.description) data.description = String(data.description).trim();
      if (data.reference) data.reference = String(data.reference).trim();
      if (data.status) data.status = String(data.status).trim();

      const result = await this.loansService.update(parsedId, data);
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
