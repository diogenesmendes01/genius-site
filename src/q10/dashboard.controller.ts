import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { Q10ClientService } from './q10-client.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly q10: Q10ClientService,
  ) {}

  @Get('overview')
  overview(@Query('range') range?: string) {
    const days = Math.max(1, Math.min(365, Number(range ?? 30) || 30));
    return this.dashboard.overview(days);
  }

  @Post('refresh')
  refresh() {
    this.q10.clearCache();
    return { success: true, clearedAt: new Date().toISOString() };
  }
}
