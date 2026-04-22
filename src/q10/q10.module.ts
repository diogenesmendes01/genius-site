import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AcademicService } from './dashboard/academic.service';
import { CommercialService } from './dashboard/commercial.service';
import { CurrencyService } from './dashboard/currency.service';
import { FinancialService } from './dashboard/financial.service';
import { TurmasService } from './dashboard/turmas.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { EnrollmentService } from './enrollment.service';
import { Q10ClientService } from './q10-client.service';
import { Q10MockService } from './q10-mock.service';
import { Q10AdminController, Q10PublicController } from './q10.controller';
import { TrackingEntryEntity } from './tracking-entry.entity';
import { TrackingService } from './tracking.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([TrackingEntryEntity])],
  controllers: [DashboardController, Q10PublicController, Q10AdminController],
  providers: [
    Q10ClientService,
    Q10MockService,
    TrackingService,
    EnrollmentService,
    DashboardService,
    AcademicService,
    FinancialService,
    CommercialService,
    CurrencyService,
    TurmasService,
  ],
  exports: [Q10ClientService, TrackingService],
})
export class Q10Module {}
