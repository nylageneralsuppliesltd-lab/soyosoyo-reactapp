import { Controller, Get, Post, Patch, Delete, Param, Body, Query, BadRequestException } from '@nestjs/common';
import { MembersService } from './members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Post()
  async create(@Body() dto: CreateMemberDto) {
    try {
      if (dto && (dto as any).nextOfKin !== undefined) {
        const rawNextOfKin = (dto as any).nextOfKin;
        if (rawNextOfKin === null || rawNextOfKin === '') {
          (dto as any).nextOfKin = undefined;
        } else if (typeof rawNextOfKin === 'string') {
          try {
            (dto as any).nextOfKin = JSON.parse(rawNextOfKin);
          } catch (error) {
            throw new BadRequestException('nextOfKin must be valid JSON');
          }
        }

        if ((dto as any).nextOfKin !== undefined && !Array.isArray((dto as any).nextOfKin)) {
          throw new BadRequestException('nextOfKin must be an array');
        }
      }

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
    const memberId = Number(id);
    if (!Number.isFinite(memberId)) throw new BadRequestException('Invalid member ID');
    return this.membersService.findOne(memberId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    const memberId = Number(id);
    if (!Number.isFinite(memberId)) throw new BadRequestException('Invalid member ID');

    const trimString = (value?: unknown) => {
      if (value === undefined || value === null) return value;
      const trimmed = String(value).trim();
      return trimmed === '' ? undefined : trimmed;
    };

    const cleanedDto: any = { ...dto };

    cleanedDto.name = trimString(dto.name);
    cleanedDto.phone = trimString(dto.phone);
    cleanedDto.email = trimString(dto.email);
    cleanedDto.idNumber = trimString(dto.idNumber);
    cleanedDto.dob = trimString(dto.dob);
    cleanedDto.gender = trimString(dto.gender);
    cleanedDto.physicalAddress = trimString(dto.physicalAddress);
    cleanedDto.town = trimString(dto.town);
    cleanedDto.employmentStatus = trimString(dto.employmentStatus);
    cleanedDto.employerName = trimString(dto.employerName);
    cleanedDto.regNo = trimString(dto.regNo);
    cleanedDto.employerAddress = trimString(dto.employerAddress);
    cleanedDto.role = trimString(dto.role);
    cleanedDto.introducerName = trimString(dto.introducerName);
    cleanedDto.introducerMemberNo = trimString(dto.introducerMemberNo);

    if (dto.balance !== undefined) {
      const balance = typeof dto.balance === 'string' ? parseFloat(dto.balance) : dto.balance;
      if (balance === undefined || isNaN(balance)) throw new BadRequestException('Invalid balance amount');
      cleanedDto.balance = balance;
    }

    if (dto.loanBalance !== undefined) {
      const loanBalance = typeof dto.loanBalance === 'string' ? parseFloat(dto.loanBalance) : dto.loanBalance;
      if (loanBalance === undefined || isNaN(loanBalance)) throw new BadRequestException('Invalid loan balance amount');
      cleanedDto.loanBalance = loanBalance;
    }

    if (dto.active !== undefined) {
      if (typeof dto.active === 'string') {
        if (dto.active.toLowerCase() === 'true') cleanedDto.active = true;
        else if (dto.active.toLowerCase() === 'false') cleanedDto.active = false;
        else throw new BadRequestException('Invalid active flag - expected true or false');
      } else {
        cleanedDto.active = dto.active;
      }
    }

    if (dto.nextOfKin !== undefined) {
      if (typeof dto.nextOfKin === 'string') {
        try {
          cleanedDto.nextOfKin = JSON.parse(dto.nextOfKin);
        } catch (error) {
          throw new BadRequestException('nextOfKin must be valid JSON');
        }
      } else {
        cleanedDto.nextOfKin = dto.nextOfKin;
      }

      if (cleanedDto.nextOfKin !== undefined && !Array.isArray(cleanedDto.nextOfKin)) {
        throw new BadRequestException('nextOfKin must be an array');
      }
    }

    return this.membersService.update(memberId, cleanedDto);
  }

  @Patch(':id/suspend')
  suspend(@Param('id') id: string) {
    const memberId = Number(id);
    if (!Number.isFinite(memberId)) throw new BadRequestException('Invalid member ID');
    return this.membersService.suspend(memberId);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string) {
    const memberId = Number(id);
    if (!Number.isFinite(memberId)) throw new BadRequestException('Invalid member ID');
    return this.membersService.reactivate(memberId);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    const memberId = Number(id);
    if (!Number.isFinite(memberId)) throw new BadRequestException('Invalid member ID');
    return this.membersService.delete(memberId);
  }

  @Get(':id/ledger')
  ledger(@Param('id') id: string) {
    const memberId = Number(id);
    if (!Number.isFinite(memberId)) throw new BadRequestException('Invalid member ID');
    return this.membersService.ledger(memberId);
  }
}
