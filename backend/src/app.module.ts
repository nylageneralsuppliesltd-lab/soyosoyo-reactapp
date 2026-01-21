

import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
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
import { InvoicingModule } from './invoicing/invoicing.module';
import { CategoryLedgerModule } from './category-ledger/category-ledger.module';
import { AssetsModule } from './assets/assets.module';
import { ReportsModule } from './reports/reports.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    AuditModule,
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
    InvoicingModule,
    CategoryLedgerModule,
    AssetsModule,
    ReportsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
