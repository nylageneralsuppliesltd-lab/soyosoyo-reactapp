import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterProfileDto } from './dto/register-profile.dto';
import { DeveloperModeDto } from './dto/developer-mode.dto';
import { CreateSaccoDto } from './dto/create-sacco.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { Public } from './public.decorator';
import { Access } from './access.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register-profile')
  @Public()
  registerProfile(@Body() dto: RegisterProfileDto) {
    return this.authService.registerProfile(dto);
  }

  @Post('login')
  @Public()
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('developer-mode')
  @UseGuards(JwtAuthGuard)
  @Access('settings', 'admin')
  developerMode(@CurrentUser() user: any, @Body() dto: DeveloperModeDto) {
    return this.authService.setDeveloperMode(user.sub, dto.enabled);
  }

  @Post('saccos/create')
  @UseGuards(JwtAuthGuard)
  @Access('settings', 'write')
  createSacco(@CurrentUser() user: any, @Body() dto: CreateSaccoDto) {
    return this.authService.createSacco(user.sub, dto);
  }

  @Get('saccos/list')
  @UseGuards(JwtAuthGuard)
  @Access('dashboard', 'read')
  listSaccos(@CurrentUser() user: any) {
    return this.authService.listSaccosForUser(user.sub);
  }

  @Get('developer/overview')
  @UseGuards(JwtAuthGuard)
  @Access('settings', 'admin')
  developerOverview(@CurrentUser() user: any) {
    return this.authService.developerOverview(user.sub);
  }

  @Get('session')
  @UseGuards(JwtAuthGuard)
  @Access('dashboard', 'read')
  getSession(@CurrentUser() user: any) {
    return this.authService.getSession(user.sub);
  }

  @Post('password/reset-request')
  @Public()
  requestPasswordReset(@Body() body: { identifier: string }) {
    return this.authService.requestPasswordReset(body.identifier);
  }

  @Get('password/reset-request-status/:requestId')
  @Public()
  passwordResetRequestStatus(@Param('requestId') requestId: string) {
    return this.authService.getPasswordResetDispatchStatus(requestId);
  }

  @Get('email-health')
  @Public()
  emailHealth() {
    return this.authService.getEmailHealth();
  }

  @Post('password/verify-reset')
  @Public()
  verifyResetCode(@Body() body: { identifier: string; resetCode: string; newPassword: string }) {
    return this.authService.verifyResetCode(body.identifier, body.resetCode, body.newPassword);
  }
}
