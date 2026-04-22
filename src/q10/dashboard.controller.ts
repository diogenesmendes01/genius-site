import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// Accept only plain YYYY-MM-DD to keep the /pagos passthrough to Q10 safe —
// anything else (including ISO with time) gets dropped so the service falls
// back to its `monthsBack`/`rangeDays` default.
function validateIsoDate(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

import { AcademicService } from './dashboard/academic.service';
import { CommercialService } from './dashboard/commercial.service';
import { CurrencyService } from './dashboard/currency.service';
import { FinancialService } from './dashboard/financial.service';
import { TurmasService } from './dashboard/turmas.service';
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
    private readonly currency: CurrencyService,
    private readonly turmas: TurmasService,
    private readonly q10: Q10ClientService,
  ) {}

  @Get('overview')
  overview(
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const days = Math.max(1, Math.min(365, Number(range ?? 30) || 30));
    return this.dashboard.overview(days, validateIsoDate(from), validateIsoDate(to));
  }

  @Get('academic')
  academicView() {
    return this.academic.academic();
  }

  @Get('financial')
  financialView(
    @Query('months') months?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const n = Math.max(1, Math.min(60, Number(months ?? 12) || 12));
    return this.financial.financial(n, validateIsoDate(from), validateIsoDate(to));
  }

  @Get('commercial')
  commercialView() {
    return this.commercial.commercial();
  }

  @Get('turmas')
  turmasView() {
    return this.turmas.turmas();
  }

  /**
   * Exchange rates for the dashboard's currency switcher. Q10 stores all
   * monetary values in USD on this tenant, so the FE uses these rates
   * (USD → CRC, USD → BRL) to relabel KPIs without touching backend.
   */
  @Get('currency-rates')
  rates() {
    return this.currency.getRates();
  }

  @Post('refresh')
  refresh() {
    this.q10.clearCache();
    return { success: true, clearedAt: new Date().toISOString() };
  }
}
