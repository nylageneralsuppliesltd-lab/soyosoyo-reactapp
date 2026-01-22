import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { MembersService } from './members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Post()
  async create(@Body() dto: CreateMemberDto) {
    try {
      console.log('[POST /members] Received dto:', JSON.stringify(dto));
      const result = await this.membersService.create(dto);
      console.log('[POST /members] Member created successfully with id:', result.id);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[POST /members] ERROR:', errorMsg);
      throw err;
    }
  }

  @Get('stats')
  async getStats() {
    return this.membersService.getStats();
  }

  @Get()
  async findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('active') active?: string,
    @Query('sort') sort?: 'asc' | 'desc',
  ) {
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const takeNum = take ? parseInt(take, 10) : 50;

    if (isNaN(skipNum) || skipNum < 0) {
      throw new Error('Invalid skip parameter - must be a non-negative number');
    }
    if (isNaN(takeNum) || takeNum < 0) {
      throw new Error('Invalid take parameter - must be a positive number');
    }

    return this.membersService.findAll({
      skip: skipNum,
      take: takeNum,
      search,
      role,
      active: active === 'true' ? true : active === 'false' ? false : undefined,
      sort: sort || 'desc',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.membersService.findOne(Number(id));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMemberDto) {
    return this.membersService.update(Number(id), dto);
  }

  @Patch(':id/suspend')
  suspend(@Param('id') id: string) {
    return this.membersService.suspend(Number(id));
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.membersService.reactivate(Number(id));
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.membersService.delete(Number(id));
  }

  @Get(':id/ledger')
  ledger(@Param('id') id: string) {
    return this.membersService.ledger(Number(id));
  }
}
