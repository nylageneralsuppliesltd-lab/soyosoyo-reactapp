import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

interface ListOptions {
  skip?: number;
  take?: number;
  search?: string;
  role?: string;
  active?: boolean;
  sort?: 'asc' | 'desc';
}

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateMemberDto) {
    try {
      console.log('[MembersService.create] Starting with dto:', JSON.stringify(dto));

      // Check if member exists
      console.log('[MembersService.create] Checking if member with phone exists:', dto.phone);
      const existing = await this.prisma.member.findUnique({ where: { phone: dto.phone } });
      if (existing) {
        console.warn('[MembersService.create] Member already exists with phone:', dto.phone);
        throw new BadRequestException('Member with this phone number already exists.');
      }

      // Prepare data and convert empty strings to null for optional fields
      const { nextOfKin, ...rest } = dto;

      const dataToCreate = {
        ...rest,
        dob: rest.dob && rest.dob.trim() ? rest.dob : null,
        email: rest.email && rest.email.trim() ? rest.email : null,
        idNumber: rest.idNumber && rest.idNumber.trim() ? rest.idNumber : null,
        gender: rest.gender && rest.gender.trim() ? rest.gender : null,
        employmentStatus: rest.employmentStatus && rest.employmentStatus.trim() ? rest.employmentStatus : null,
        employerName: rest.employerName && rest.employerName.trim() ? rest.employerName : null,
        regNo: rest.regNo && rest.regNo.trim() ? rest.regNo : null,
        employerAddress: rest.employerAddress && rest.employerAddress.trim() ? rest.employerAddress : null,
        nextOfKin: nextOfKin && nextOfKin.length > 0 ? JSON.parse(JSON.stringify(nextOfKin)) : null,
      };

      delete (dataToCreate as any).customRole;
      console.log('[MembersService.create] Prepared data for creation:', JSON.stringify(dataToCreate));

      const result = await this.prisma.member.create({ data: dataToCreate });
      console.log('[MembersService.create] Member created with id:', result.id);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorName = err instanceof Error ? err.name : 'Unknown';
      console.error('[MembersService.create] FAILED:', errorName, errorMsg);
      throw err;
    }
  }

  async findAll(options: ListOptions = {}) {
    const { skip = 0, take = 50, search, role, active, sort = 'desc' } = options;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    if (active !== undefined) {
      where.active = active;
    }

    const [members, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: sort },
      }),
      this.prisma.member.count({ where }),
    ]);

    return {
      data: members,
      total,
      skip,
      take,
      pages: Math.ceil(total / take),
    };
  }

  async findOne(id: number) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: { 
        ledger: {
          orderBy: { date: 'asc' },
        },
      },
    });
    if (!member) throw new NotFoundException(`Member with ID ${id} not found.`);
    return member;
  }

  async update(id: number, dto: any) {
    await this.findOne(id);

    const trimToUndefined = (value?: string | null) => {
      if (value === undefined || value === null) return undefined;
      const trimmed = String(value).trim();
      return trimmed === '' ? undefined : trimmed;
    };

    const nullIfEmpty = (value?: string | null) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      const trimmed = String(value).trim();
      return trimmed === '' ? null : trimmed;
    };

    const sanitizedPhone = trimToUndefined(dto.phone);

    // Check for duplicate phone if phone is being updated
    if (sanitizedPhone) {
      const existing = await this.prisma.member.findUnique({
        where: { phone: sanitizedPhone },
      });
      if (existing && existing.id !== id) {
        throw new BadRequestException('This phone number is already in use by another member.');
      }
    }

    const { nextOfKin, balance, loanBalance, active, ...rest } = dto;

    const dataToUpdate: any = {};

    const directStrings: Array<keyof typeof rest> = [
      'name',
      'role',
      'physicalAddress',
      'town',
      'introducerName',
      'introducerMemberNo',
    ];

    Object.keys(rest).forEach((field) => {
      if (directStrings.includes(field as any) && rest[field] !== undefined) {
        const trimmed = trimToUndefined(rest[field]);
        if (trimmed !== undefined) dataToUpdate[field] = trimmed;
      }
    });

    if (sanitizedPhone !== undefined) dataToUpdate.phone = sanitizedPhone;

    dataToUpdate.dob = nullIfEmpty(rest.dob);
    dataToUpdate.email = nullIfEmpty(rest.email);
    dataToUpdate.idNumber = nullIfEmpty(rest.idNumber);
    dataToUpdate.gender = nullIfEmpty(rest.gender);
    dataToUpdate.employmentStatus = nullIfEmpty(rest.employmentStatus);
    dataToUpdate.employerName = nullIfEmpty(rest.employerName);
    dataToUpdate.regNo = nullIfEmpty(rest.regNo);
    dataToUpdate.employerAddress = nullIfEmpty(rest.employerAddress);

    if (balance !== undefined) {
      const bal = typeof balance === 'string' ? parseFloat(balance) : balance;
      if (bal === undefined || isNaN(bal)) {
        throw new BadRequestException('Invalid balance amount');
      }
      dataToUpdate.balance = bal;
    }

    if (loanBalance !== undefined) {
      const lBal = typeof loanBalance === 'string' ? parseFloat(loanBalance) : loanBalance;
      if (lBal === undefined || isNaN(lBal)) {
        throw new BadRequestException('Invalid loan balance amount');
      }
      dataToUpdate.loanBalance = lBal;
    }

    if (active !== undefined) {
      dataToUpdate.active = Boolean(active);
    }

    if (nextOfKin !== undefined) {
      dataToUpdate.nextOfKin = nextOfKin ? JSON.parse(JSON.stringify(nextOfKin)) : null;
    }

    delete (dataToUpdate as any).customRole;

    return this.prisma.member.update({
      where: { id },
      data: dataToUpdate,
    });
  }

  async suspend(id: number) {
    await this.findOne(id);
    return this.prisma.member.update({
      where: { id },
      data: { active: false },
    });
  }

  async reactivate(id: number) {
    await this.findOne(id);
    return this.prisma.member.update({
      where: { id },
      data: { active: true },
    });
  }

  async delete(id: number) {
    await this.findOne(id);
    return this.prisma.member.delete({ where: { id } });
  }

  async ledger(id: number) {
    const member = await this.findOne(id);
    return member;
  }

  async getStats() {
    const [total, active, suspended, balance] = await Promise.all([
      this.prisma.member.count(),
      this.prisma.member.count({ where: { active: true } }),
      this.prisma.member.count({ where: { active: false } }),
      this.prisma.member.aggregate({
        _sum: { balance: true },
      }),
    ]);

    return {
      total,
      active,
      suspended,
      totalBalance: balance._sum.balance || 0,
    };
  }
}
