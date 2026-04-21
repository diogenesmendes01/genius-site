import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AcademicService } from './dashboard/academic.service';
import { CommercialService } from './dashboard/commercial.service';
import { FinancialService } from './dashboard/financial.service';
import { DashboardService } from './dashboard.service';
import { Q10ClientService } from './q10-client.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly academic: AcademicService,
    private readonly financial: FinancialService,
    private readonly commercial: CommercialService,
    private readonly q10: Q10ClientService,
  ) {}

  @Get('overview')
  overview(@Query('range') range?: string) {
    const days = Math.max(1, Math.min(365, Number(range ?? 30) || 30));
    return this.dashboard.overview(days);
  }

  @Get('academic')
  academicView() {
    return this.academic.academic();
  }

  @Get('financial')
  financialView(@Query('months') months?: string) {
    const n = Math.max(1, Math.min(60, Number(months ?? 12) || 12));
    return this.financial.financial(n);
  }

  @Get('commercial')
  commercialView() {
    return this.commercial.commercial();
  }

  @Post('refresh')
  refresh() {
    this.q10.clearCache();
    return { success: true, clearedAt: new Date().toISOString() };
  }
}
