import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { EnrollmentService } from './enrollment.service';
import { Q10ClientService } from './q10-client.service';
import { Q10MockService } from './q10-mock.service';
import { Q10AdminController, Q10PublicController } from './q10.controller';
import { TrackingService } from './tracking.service';

@Module({
  imports: [AuthModule],
  controllers: [DashboardController, Q10PublicController, Q10AdminController],
  providers: [
    Q10ClientService,
    Q10MockService,
    TrackingService,
    EnrollmentService,
    DashboardService,
  ],
  exports: [Q10ClientService, TrackingService],
})
export class Q10Module {}
