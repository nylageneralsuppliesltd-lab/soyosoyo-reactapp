import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../common/email.service';
import { LoginDto } from './dto/login.dto';
import { RegisterProfileDto } from './dto/register-profile.dto';
import { DeveloperModeDto } from './dto/developer-mode.dto';
import { CreateSaccoDto } from './dto/create-sacco.dto';

@Injectable()
export class AuthService {
  private readonly resetDispatchStatus = new Map<
    string,
    { status: 'pending' | 'sent' | 'failed' | 'accepted'; detail: string; updatedAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  private setResetDispatchStatus(
    requestId: string,
    status: 'pending' | 'sent' | 'failed' | 'accepted',
    detail: string,
  ) {
    this.resetDispatchStatus.set(requestId, { status, detail, updatedAt: Date.now() });

    // keep map bounded / auto-clean old records (30 minutes)
    const maxAgeMs = 30 * 60 * 1000;
    for (const [id, item] of this.resetDispatchStatus.entries()) {
      if (Date.now() - item.updatedAt > maxAgeMs) {
        this.resetDispatchStatus.delete(id);
      }
    }
  }

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

  private async resolveMemberByIdentifier(identifier: string): Promise<any> {
    const prismaAny = this.prisma as any;
    const id = String(identifier || '').trim();
    if (!id) throw new BadRequestException('Identifier is required');

    if (id.includes('@')) {
      const email = this.normalizeEmail(id);
      return prismaAny.member.findFirst({ where: { email: email! } });
    }

    const phone = this.normalizePhone(id);
    return prismaAny.member.findUnique({ where: { phone: phone! } });
  }

  private async ensureProfile(member: any) {
    const prismaAny = this.prisma as any;
    const fallbackPassword = await bcrypt.hash(`member-${member.id}-${Date.now()}`, 10);
    const hash = member.passwordHash || fallbackPassword;

    return prismaAny.appProfile.upsert({
      where: { memberId: member.id },
      create: {
        fullName: member.name,
        phone: member.phone,
        email: member.email,
        passwordHash: hash,
        memberId: member.id,
        role: member.role || 'Member',
        isPlatformAdmin: member.adminCriteria === 'Admin' || member.role === 'Admin',
        isSystemDeveloper: Boolean(member.isSystemDeveloper),
        developerModeEnabled: Boolean(member.developerMode),
      },
      update: {
        fullName: member.name,
        phone: member.phone,
        email: member.email,
        role: member.role || 'Member',
        isPlatformAdmin: member.adminCriteria === 'Admin' || member.role === 'Admin',
        isSystemDeveloper: Boolean(member.isSystemDeveloper),
        developerModeEnabled: Boolean(member.developerMode),
        passwordHash: hash,
      },
    });
  }

  private sign(member: any) {
    const payload = {
      sub: member.id,
      phone: member.phone,
      email: member.email,
      role: member.role,
      adminCriteria: member.adminCriteria,
      isSystemDeveloper: member.isSystemDeveloper,
      developerMode: member.developerMode,
    };

    const token = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET || 'change-this-secret',
      expiresIn: (process.env.JWT_EXPIRES_IN || '12h') as any,
    });

    return {
      token,
      user: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        email: member.email,
        role: member.role,
        adminCriteria: member.adminCriteria,
        isSystemDeveloper: member.isSystemDeveloper,
        developerMode: member.developerMode,
      },
    };
  }

  private async getMemberById(memberId: number): Promise<any> {
    const member = await (this.prisma as any).member.findUnique({ where: { id: memberId } });
    if (!member) {
      throw new UnauthorizedException('Member account not found');
    }
    return member;
  }

  async registerProfile(dto: RegisterProfileDto) {
    let member: any = null;

    if (dto.memberId) {
      member = await (this.prisma as any).member.findUnique({ where: { id: dto.memberId } });
    } else if (dto.identifier) {
      member = await this.resolveMemberByIdentifier(dto.identifier);
    }

    if (!member) {
      throw new NotFoundError('Member not found for profile registration');
    }

    const passwordHash = await bcrypt.hash(dto.password.trim(), 10);
    const accessKey = process.env.DEVELOPER_ACCESS_KEY || 'CHANGE_ME';
    const isSystemDeveloper = dto.developerAccessKey && dto.developerAccessKey === accessKey;

    member = await (this.prisma as any).member.update({
      where: { id: member.id },
      data: {
        passwordHash,
        canLogin: true,
        isSystemDeveloper: isSystemDeveloper ? true : member.isSystemDeveloper,
      } as any,
    });

    await this.ensureProfile(member);

    return this.sign(member);
  }

  async login(dto: LoginDto) {
    const member: any = await this.resolveMemberByIdentifier(dto.identifier);
    if (!member) throw new UnauthorizedException('Invalid credentials');
    if (!member.canLogin || !member.passwordHash) {
      throw new UnauthorizedException('Profile login is not enabled for this member');
    }

    const match = await bcrypt.compare(dto.password, member.passwordHash);
    if (!match) throw new UnauthorizedException('Invalid credentials');

    await this.ensureProfile(member);
    return this.sign(member);
  }

  async setDeveloperMode(memberId: number, enabled: boolean) {
    const member: any = await this.getMemberById(memberId);

    if (!member.isSystemDeveloper) {
      throw new ForbiddenException('Developer mode can only be toggled by a system developer');
    }

    const updated = await (this.prisma as any).member.update({
      where: { id: member.id },
      data: { developerMode: enabled } as any,
    });

    await (this.prisma as any).appProfile.updateMany({
      where: { memberId: member.id },
      data: { developerModeEnabled: enabled },
    });

    return this.sign(updated);
  }

  async createSacco(memberId: number, dto: CreateSaccoDto) {
    const member: any = await this.getMemberById(memberId);

    const profile = await this.ensureProfile(member);

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const prismaAny = this.prisma as any;
    const sacco = await prismaAny.saccoOrganization.create({
      data: {
        name: dto.name.trim(),
        registrationNumber: dto.registrationNumber?.trim() || null,
        ownerProfileId: profile.id,
        trialStartsAt: now,
        trialEndsAt,
        billingStatus: 'trial',
      },
    });

    await prismaAny.saccoMembership.create({
      data: {
        profileId: profile.id,
        saccoId: sacco.id,
        role: member.role || 'Member',
        isAdmin: true,
      },
    });

    return sacco;
  }

  async listSaccosForUser(memberId: number) {
    const member: any = await this.getMemberById(memberId);

    const profile = await this.ensureProfile(member);

    const now = new Date();

    if (member.isSystemDeveloper && member.developerMode) {
      const saccos = await (this.prisma as any).saccoOrganization.findMany({
        include: { memberships: true },
        orderBy: { createdAt: 'desc' },
      });

      return {
        developerMode: true,
        saccos,
      };
    }

    const memberships = await (this.prisma as any).saccoMembership.findMany({
      where: { profileId: profile.id, isActive: true },
      include: { sacco: true },
      orderBy: { createdAt: 'desc' },
    });

    const visible = memberships.map((item) => {
      const expired = item.sacco.trialEndsAt < now && item.sacco.billingStatus !== 'active';
      return {
        ...item,
        sacco: {
          ...item.sacco,
          isHiddenForNonPayment: expired,
          hiddenDetails: expired
            ? {
                name: item.sacco.name,
                trialEndsAt: item.sacco.trialEndsAt,
                billingStatus: item.sacco.billingStatus,
              }
            : null,
        },
      };
    });

    return {
      developerMode: false,
      saccos: visible,
    };
  }

  async developerOverview(memberId: number) {
    const member: any = await this.getMemberById(memberId);
    if (!member.isSystemDeveloper || !member.developerMode) {
      throw new ForbiddenException('Enable developer mode to access full platform overview');
    }

    const [profiles, saccos] = await Promise.all([
      (this.prisma as any).appProfile.findMany({ orderBy: { createdAt: 'desc' } }),
      (this.prisma as any).saccoOrganization.findMany({ include: { memberships: true }, orderBy: { createdAt: 'desc' } }),
    ]);

    return {
      profiles,
      saccos,
    };
  }

  async getSession(memberId: number) {
    const member = await this.getMemberById(memberId);
    await this.ensureProfile(member);
    return this.sign(member);
  }

  getEmailHealth() {
    const health = this.emailService.getHealth();
    return {
      success: true,
      ...health,
      checkedAt: new Date().toISOString(),
    };
  }

  getPasswordResetDispatchStatus(requestId: string) {
    const key = String(requestId || '').trim();
    if (!key) {
      throw new BadRequestException('requestId is required');
    }

    const item = this.resetDispatchStatus.get(key);
    if (!item) {
      return {
        success: false,
        requestId: key,
        status: 'unknown',
        detail: 'No dispatch status found for this requestId',
      };
    }

    return {
      success: true,
      requestId: key,
      status: item.status,
      detail: item.detail,
      updatedAt: new Date(item.updatedAt).toISOString(),
    };
  }

  async requestPasswordReset(identifier: string) {
    const requestId = randomUUID();

    const member = await this.resolveMemberByIdentifier(identifier);
    if (!member) {
      // Don't reveal if user exists
      this.setResetDispatchStatus(requestId, 'accepted', 'Request accepted');
      return {
        success: true,
        requestId,
        dispatchStatus: 'accepted',
        message: 'If account exists, reset code sent to your email',
      };
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set expiration to 15 minutes from now
    const resetCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    
    // Store code in database
    await this.prisma.member.update({
      where: { id: member.id },
      data: {
        resetCode: code,
        resetCodeExpiresAt,
      },
    });

    // Send email with reset code (fire-and-forget - don't block API response)
    if (member.email) {
      this.setResetDispatchStatus(requestId, 'pending', 'Dispatch started');
      // Send email asynchronously without awaiting (non-blocking)
      this.emailService.sendPasswordResetEmail(
        member.email,
        member.name || 'Member',
        code
      ).then((sent) => {
        if (!sent) {
          this.setResetDispatchStatus(requestId, 'failed', 'Provider rejected or delivery dispatch failed');
          console.error(`[AUTH] Password reset email dispatch reported failure for ${member.email}`);
          return;
        }

        this.setResetDispatchStatus(
          requestId,
          'sent',
          'Provider accepted email for delivery (inbox placement not guaranteed)',
        );
      }).catch((err) => {
        this.setResetDispatchStatus(requestId, 'failed', `Dispatch error: ${err.message}`);
        console.error(`[AUTH] Failed to send password reset email to ${member.email}:`, err.message);
      });
    } else {
      this.setResetDispatchStatus(requestId, 'failed', 'Member has no email address on file');
      console.warn(`[AUTH] Member ${member.id} has no email address`);
    }

    return {
      success: true,
      requestId,
      dispatchStatus: member.email ? 'pending' : 'failed',
      message: 'Reset code request accepted. Dispatch status can be checked with requestId.',
    };
  }

  async verifyResetCode(identifier: string, resetCode: string, newPassword: string) {
    const member = await this.resolveMemberByIdentifier(identifier);
    if (!member) {
      throw new UnauthorizedException('Invalid identifier');
    }

    if (!member.resetCode) {
      throw new BadRequestException('No reset code found. Please request a new one.');
    }

    if (!member.resetCodeExpiresAt || Date.now() > member.resetCodeExpiresAt.getTime()) {
      // Clear expired code
      await this.prisma.member.update({
        where: { id: member.id },
        data: { resetCode: null, resetCodeExpiresAt: null },
      });
      throw new BadRequestException('Reset code expired. Please request a new one.');
    }

    if (member.resetCode !== resetCode) {
      throw new BadRequestException('Invalid reset code');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update member password
    const prismaAny = this.prisma as any;
    const updated = await prismaAny.member.update({
      where: { id: member.id },
      data: {
        passwordHash,
        resetCode: null, // Clear reset code
        resetCodeExpiresAt: null,
      },
    });

    // Update profile password hash
    await prismaAny.appProfile.updateMany({
      where: { memberId: member.id },
      data: { passwordHash },
    });

    // Return signed session
    return this.sign(updated);
  }
}

class NotFoundError extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}
