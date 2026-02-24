import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Patch,
  ParseIntPipe,
  Logger,
} from '@nestjs/common';
import { ContributionTransfersService } from './contribution-transfers.service';

@Controller('contribution-transfers')
export class ContributionTransfersController {
  private readonly logger = new Logger(ContributionTransfersController.name);

  constructor(
    private readonly contributionTransfersService: ContributionTransfersService,
  ) {}

  /**
   * Create a new contribution transfer
   */
  @Post()
  async create(@Body() createDto: any) {
    this.logger.log(`Creating contribution transfer: ${JSON.stringify(createDto)}`);
    return this.contributionTransfersService.createTransfer(createDto);
  }

  /**
   * Create contribution to loan transfer
   */
  @Post('contribution-to-loan')
  async createContributionToLoan(@Body() data: any) {
    this.logger.log(`Creating contribution-to-loan transfer: ${JSON.stringify(data)}`);
    return this.contributionTransfersService.createContributionToLoanTransfer(data);
  }

  /**
   * Create member to member transfer
   */
  @Post('member-to-member')
  async createMemberToMember(@Body() data: any) {
    this.logger.log(`Creating member-to-member transfer: ${JSON.stringify(data)}`);
    return this.contributionTransfersService.createMemberToMemberTransfer(data);
  }

  /**
   * Get all contribution transfers with optional filters
   */
  @Get()
  async findAll(
    @Query('take') take?: number,
    @Query('skip') skip?: number,
    @Query('fromMemberId') fromMemberId?: number,
    @Query('toMemberId') toMemberId?: number,
    @Query('category') category?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters: any = {};
    if (fromMemberId) filters.fromMemberId = Number(fromMemberId);
    if (toMemberId) filters.toMemberId = Number(toMemberId);
    if (category) filters.category = category;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    return this.contributionTransfersService.findAll(
      take ? Number(take) : 100,
      skip ? Number(skip) : 0,
      filters,
    );
  }

  /**
   * Get a specific contribution transfer
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contributionTransfersService.findOne(id);
  }

  /**
   * Void a contribution transfer
   */
  @Patch(':id/void')
  async void(
    @Param('id', ParseIntPipe) id: number,
    @Body() voidData: { voidedBy: string; voidReason: string },
  ) {
    this.logger.log(`Voiding contribution transfer ${id}`);
    return this.contributionTransfersService.voidTransfer(
      id,
      voidData.voidedBy,
      voidData.voidReason,
    );
  }
}
