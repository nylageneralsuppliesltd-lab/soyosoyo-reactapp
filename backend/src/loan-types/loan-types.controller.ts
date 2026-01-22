import { Controller, Get, Post, Body, Patch, Param, Delete, HttpException, HttpStatus } from '@nestjs/common';
import { LoanTypesService } from './loan-types.service';

@Controller('loan-types')
export class LoanTypesController {
  constructor(private readonly loanTypesService: LoanTypesService) {}

  @Post()
  async create(@Body() data: any) {
    try {
      return await this.loanTypesService.create(data);
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          message: error.message || 'Failed to create loan type',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get()
  async findAll() {
    try {
      return await this.loanTypesService.findAll();
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: error.message || 'Failed to fetch loan types',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      return await this.loanTypesService.findOne(parseInt(id));
    } catch (error) {
      const statusCode = error.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.INTERNAL_SERVER_ERROR;
      throw new HttpException(
        {
          status: statusCode,
          message: error.message || 'Failed to fetch loan type',
        },
        statusCode,
      );
    }
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() data: any) {
    try {
      return await this.loanTypesService.update(parseInt(id), data);
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          message: error.message || 'Failed to update loan type',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      return await this.loanTypesService.remove(parseInt(id));
    } catch (error) {
      const statusCode = error.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      throw new HttpException(
        {
          status: statusCode,
          message: error.message || 'Failed to delete loan type',
        },
        statusCode,
      );
    }
  }
}
