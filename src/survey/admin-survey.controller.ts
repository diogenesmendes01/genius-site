import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePeriodDto } from './dto/create-period.dto';
import { SurveyAnalyticsService } from './analytics.service';
import { SurveyPeriodService } from './period.service';

@Controller('admin/pesquisas')
@UseGuards(JwtAuthGuard)
export class AdminSurveyController {
  constructor(
    private readonly periods: SurveyPeriodService,
    private readonly analytics: SurveyAnalyticsService,
  ) {}

  @Post('gerar')
  async gerar(@Body() dto: CreatePeriodDto, @Req() req: Request) {
    const user = (req as any).user;
    const criadoPor = user?.name ?? user?.email ?? 'unknown';
    return this.periods.createPeriod(dto, criadoPor);
  }

  @Get()
  async list() {
    return this.periods.listPeriods();
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.analytics.periodDetail(id);
  }

  @Get(':id/turma/:turmaId')
  async turma(
    @Param('id') id: string,
    @Param('turmaId') turmaId: string,
  ) {
    return this.analytics.turmaDetail(id, turmaId);
  }

  @Get(':id/mensagens-whatsapp')
  async whatsapp(@Param('id') id: string) {
    return this.analytics.whatsappMessages(id);
  }
}
