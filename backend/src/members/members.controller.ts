import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { MembersService } from './members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Post()
  create(@Body() dto: CreateMemberDto) {
    return this.membersService.create(dto);
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
