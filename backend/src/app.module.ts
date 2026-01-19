

import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { MembersModule } from './members/members.module';
import { DepositsModule } from './deposits/deposits.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';
import { LoansModule } from './loans/loans.module';
import { RepaymentsModule } from './repayments/repayments.module';
import { SettingsModule } from './settings/settings.module';
import { AccountsModule } from './accounts/accounts.module';
import { GeneralLedgerModule } from './general-ledger/general-ledger.module';
import { FinesModule } from './fines/fines.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    HealthModule,
    DashboardModule,
    MembersModule,
    DepositsModule,
    WithdrawalsModule,
    LoansModule,
    RepaymentsModule,
    SettingsModule,
    AccountsModule,
    GeneralLedgerModule,
    FinesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
