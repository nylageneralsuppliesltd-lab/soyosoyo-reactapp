import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
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
      console.log('[POST /members] Member created successfully:', result);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : 'No stack trace';
      console.error('[POST /members] ERROR:', errorMsg);
      console.error('[POST /members] STACK:', errorStack);
      console.error('[POST /members] Full error object:', JSON.stringify(err, Object.getOwnPropertyNames(err)));
      throw err;
    }
  }

  @Get()
  findAll() {
    return this.membersService.findAll();
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

  @Get(':id/ledger')
  ledger(@Param('id') id: string) {
    return this.membersService.ledger(Number(id));
  }
}
