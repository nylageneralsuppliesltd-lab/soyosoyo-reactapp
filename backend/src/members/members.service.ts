import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import * as bcrypt from 'bcryptjs';

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

  private normalizeEmail(email?: string | null): string | null {
    if (!email) return null;
    const value = String(email).trim().toLowerCase();
    return value || null;
  }

  private normalizePhone(phone?: string | null): string | null {
    if (!phone) return null;
    const compact = String(phone).trim().replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(compact)) {
      throw new BadRequestException('Phone must be in international format, e.g. +254712345678');
    }
    return compact;
  }

  async create(dto: CreateMemberDto) {
    try {
      console.log('[MembersService.create] Starting with dto:', JSON.stringify(dto));

      const normalizedPhone = this.normalizePhone(dto.phone);
      const normalizedEmail = this.normalizeEmail(dto.email);

      // Check if member exists
      console.log('[MembersService.create] Checking if member with phone exists:', normalizedPhone);
      const existing = await this.prisma.member.findUnique({ where: { phone: normalizedPhone! } });
      if (existing) {
        console.warn('[MembersService.create] Member already exists with phone:', normalizedPhone);
        throw new BadRequestException('Member with this phone number already exists.');
      }

      if (normalizedEmail) {
        const existingEmail = await this.prisma.member.findUnique({ where: { email: normalizedEmail } });
        if (existingEmail) {
          throw new BadRequestException('Member with this email already exists.');
        }
      }

      // Prepare data and convert empty strings to null for optional fields
      const { nextOfKin, password, isSystemDeveloper, ...rest } = dto as CreateMemberDto & { password?: string; isSystemDeveloper?: boolean };

      const passwordHash = password?.trim() ? await bcrypt.hash(password.trim(), 10) : null;

      const dataToCreate = {
        ...rest,
        phone: normalizedPhone,
        dob: rest.dob && rest.dob.trim() ? rest.dob : null,
        email: normalizedEmail,
        idNumber: rest.idNumber && rest.idNumber.trim() ? rest.idNumber : null,
        gender: rest.gender && rest.gender.trim() ? rest.gender : null,
        employmentStatus: rest.employmentStatus && rest.employmentStatus.trim() ? rest.employmentStatus : null,
        employerName: rest.employerName && rest.employerName.trim() ? rest.employerName : null,
        regNo: rest.regNo && rest.regNo.trim() ? rest.regNo : null,
        employerAddress: rest.employerAddress && rest.employerAddress.trim() ? rest.employerAddress : null,
        adminCriteria: rest.adminCriteria && rest.adminCriteria.trim() ? rest.adminCriteria : null,
        passwordHash,
        canLogin: Boolean(passwordHash),
        isSystemDeveloper: Boolean(isSystemDeveloper),
        developerMode: false,
        nextOfKin: nextOfKin && nextOfKin.length > 0 ? JSON.parse(JSON.stringify(nextOfKin)) : null,
      };

      delete (dataToCreate as any).customRole;
      console.log('[MembersService.create] Prepared data for creation:', JSON.stringify(dataToCreate));

      const result = await this.prisma.$transaction(async (tx) => {
        const createdMember = await tx.member.create({ data: dataToCreate });

        if (passwordHash) {
          await tx.appProfile.create({
            data: {
              fullName: createdMember.name,
              phone: createdMember.phone,
              email: createdMember.email,
              passwordHash,
              memberId: createdMember.id,
              role: createdMember.role || 'Member',
              isPlatformAdmin: createdMember.adminCriteria === 'Admin' || createdMember.role === 'Admin',
              isSystemDeveloper: createdMember.isSystemDeveloper,
            },
          });
        }

        return createdMember;
      });
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
        include: {
          ledger: {
            select: {
              amount: true,
              type: true,
            },
          },
        },
      }),
      this.prisma.member.count({ where }),
    ]);

    // Calculate real-time balances from ledger
    const membersWithCalculatedBalance = members.map((member) => {
      const ledgerEntries = member.ledger || [];

      const calculatedBalance = ledgerEntries.reduce((sum, entry) => {
        const amount = Number(entry.amount);
        const credits = ['contribution', 'deposit', 'income', 'loan_repayment', 'fine_payment'];
        const debits = ['withdrawal', 'expense', 'loan_disbursement', 'fine', 'transfer_out', 'refund'];

        if (credits.includes(entry.type)) {
          return sum + amount;
        }
        if (debits.includes(entry.type)) {
          return sum - Math.abs(amount);
        }
        return sum;
      }, 0);

      // Calculate loan balance from loan-related entries
      const calculatedLoanBalance = ledgerEntries.reduce((sum, entry) => {
        if (entry.type === 'loan_disbursement') {
          return sum + entry.amount;
        } else if (entry.type === 'loan_repayment') {
          return sum - entry.amount;
        }
        return sum;
      }, 0);

      // Return member with calculated balances (override stored values)
      const { ledger, ...memberData } = member;
      return {
        ...memberData,
        balance: Math.round(calculatedBalance * 100) / 100,
        loanBalance: Math.round(calculatedLoanBalance * 100) / 100,
      };
    });

    return {
      data: membersWithCalculatedBalance,
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
    
    // Calculate real-time balances from ledger
    const ledgerEntries = member.ledger || [];
    
    const calculatedBalance = ledgerEntries.reduce((sum, entry) => {
      const amount = Number(entry.amount);
      const credits = ['contribution', 'deposit', 'income', 'loan_repayment', 'fine_payment'];
      const debits = ['withdrawal', 'expense', 'loan_disbursement', 'fine', 'transfer_out', 'refund'];

      if (credits.includes(entry.type)) {
        return sum + amount;
      }
      if (debits.includes(entry.type)) {
        return sum - Math.abs(amount);
      }
      return sum;
    }, 0);

    const calculatedLoanBalance = ledgerEntries.reduce((sum, entry) => {
      if (entry.type === 'loan_disbursement') {
        return sum + entry.amount;
      } else if (entry.type === 'loan_repayment') {
        return sum - entry.amount;
      }
      return sum;
    }, 0);

    return {
      ...member,
      balance: Math.round(calculatedBalance * 100) / 100,
      loanBalance: Math.round(calculatedLoanBalance * 100) / 100,
    };
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

    const sanitizedPhoneRaw = trimToUndefined(dto.phone);
    const sanitizedPhone = sanitizedPhoneRaw ? this.normalizePhone(sanitizedPhoneRaw) : undefined;
    const normalizedEmail = dto.email === undefined ? undefined : this.normalizeEmail(dto.email);

    // Check for duplicate phone if phone is being updated
    if (sanitizedPhone) {
      const existing = await this.prisma.member.findUnique({
        where: { phone: sanitizedPhone },
      });
      if (existing && existing.id !== id) {
        throw new BadRequestException('This phone number is already in use by another member.');
      }
    }

    if (normalizedEmail) {
      const existingEmail = await this.prisma.member.findUnique({ where: { email: normalizedEmail } });
      if (existingEmail && existingEmail.id !== id) {
        throw new BadRequestException('This email is already in use by another member.');
      }
    }

    const { nextOfKin, balance, loanBalance, active, password, isSystemDeveloper, ...rest } = dto;

    const dataToUpdate: any = {};

    const directStrings: Array<keyof typeof rest> = [
      'name',
      'role',
      'adminCriteria',
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
    dataToUpdate.email = normalizedEmail;
    dataToUpdate.idNumber = nullIfEmpty(rest.idNumber);
    dataToUpdate.gender = nullIfEmpty(rest.gender);
    dataToUpdate.employmentStatus = nullIfEmpty(rest.employmentStatus);
    dataToUpdate.employerName = nullIfEmpty(rest.employerName);
    dataToUpdate.regNo = nullIfEmpty(rest.regNo);
    dataToUpdate.employerAddress = nullIfEmpty(rest.employerAddress);

    if (password !== undefined) {
      const pwd = String(password || '').trim();
      if (pwd.length < 6) {
        throw new BadRequestException('Password must be at least 6 characters');
      }
      dataToUpdate.passwordHash = await bcrypt.hash(pwd, 10);
      dataToUpdate.canLogin = true;
    }

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

    if (isSystemDeveloper !== undefined) {
      dataToUpdate.isSystemDeveloper = Boolean(isSystemDeveloper);
    }

    if (nextOfKin !== undefined) {
      dataToUpdate.nextOfKin = nextOfKin ? JSON.parse(JSON.stringify(nextOfKin)) : null;
    }

    delete (dataToUpdate as any).customRole;

    const updatedMember = await this.prisma.member.update({
      where: { id },
      data: dataToUpdate,
    });

    const hasLogin = Boolean(updatedMember.passwordHash && updatedMember.canLogin);
    if (hasLogin) {
      await this.prisma.appProfile.upsert({
        where: { memberId: updatedMember.id },
        create: {
          fullName: updatedMember.name,
          phone: updatedMember.phone,
          email: updatedMember.email,
          passwordHash: updatedMember.passwordHash!,
          memberId: updatedMember.id,
          role: updatedMember.role || 'Member',
          isPlatformAdmin: updatedMember.adminCriteria === 'Admin' || updatedMember.role === 'Admin',
          isSystemDeveloper: updatedMember.isSystemDeveloper,
          developerModeEnabled: updatedMember.developerMode,
        },
        update: {
          fullName: updatedMember.name,
          phone: updatedMember.phone,
          email: updatedMember.email,
          passwordHash: updatedMember.passwordHash!,
          role: updatedMember.role || 'Member',
          isPlatformAdmin: updatedMember.adminCriteria === 'Admin' || updatedMember.role === 'Admin',
          isSystemDeveloper: updatedMember.isSystemDeveloper,
          developerModeEnabled: updatedMember.developerMode,
        },
      });
    }

    return updatedMember;
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
    const [total, active, suspended, members] = await Promise.all([
      this.prisma.member.count(),
      this.prisma.member.count({ where: { active: true } }),
      this.prisma.member.count({ where: { active: false } }),
      this.prisma.member.findMany({
        include: {
          ledger: {
            select: {
              amount: true,
              type: true,
            },
          },
        },
      }),
    ]);

    // Calculate total balance from all members' ledgers
    const totalBalance = members.reduce((sum, member) => {
      const memberBalance = member.ledger.reduce((memberSum, entry) => {
        const amount = Number(entry.amount);
        const credits = ['contribution', 'deposit', 'income', 'loan_repayment', 'fine_payment'];
        const debits = ['withdrawal', 'expense', 'loan_disbursement', 'fine', 'transfer_out', 'refund'];

        if (credits.includes(entry.type)) {
          return memberSum + amount;
        }
        if (debits.includes(entry.type)) {
          return memberSum - Math.abs(amount);
        }
        return memberSum;
      }, 0);
      return sum + memberBalance;
    }, 0);

    return {
      total,
      active,
      suspended,
      totalBalance: Math.round(totalBalance * 100) / 100,
    };
  }
}
