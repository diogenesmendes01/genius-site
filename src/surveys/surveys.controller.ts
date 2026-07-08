import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSurveyResponseDto } from './dto/create-survey-response.dto';
import { SURVEY_STEPS } from './survey-config';
import { SurveysService } from './surveys.service';

// 5 submissions/min/IP in production; overridable so the e2e suite can
// exercise more than 5 POSTs without tripping the limiter.
const SUBMIT_LIMIT = Number(process.env.SURVEY_THROTTLE_LIMIT ?? 5);

@Controller('surveys')
export class SurveysController {
  constructor(private readonly surveys: SurveysService) {}

  /** Public: the wizard renders itself from this config. */
  @Get('config')
  getConfig() {
    return { steps: SURVEY_STEPS };
  }

  /** Public submission — throttled like the login endpoint to stop spam. */
  @Throttle({ default: { limit: SUBMIT_LIMIT, ttl: 60_000 } })
  @Post()
  create(@Body() dto: CreateSurveyResponseDto, @Req() req: Request) {
    return this.surveys.create(dto, clientIp(req));
  }

  /** Admin: pre-aggregated stats for the "Encuesta" dashboard tab. */
  @UseGuards(JwtAuthGuard)
  @Get('stats')
  stats(
    @Query('nivel') nivel?: string,
    @Query('profesor') profesor?: string,
    @Query('canal') canal?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.surveys.stats({ nivel, profesor, canal, from, to });
  }

  /** Admin: download every response as CSV (respects the same filters). */
  @UseGuards(JwtAuthGuard)
  @Get('export.csv')
  async exportCsv(
    @Res() res: Response,
    @Query('nivel') nivel?: string,
    @Query('profesor') profesor?: string,
    @Query('canal') canal?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const csv = await this.surveys.exportCsv({ nivel, profesor, canal, from, to });
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="encuesta-respuestas-${today}.csv"`,
    );
    res.send(csv);
  }

  /** Admin: raw responses (with answers) for drill-down/export. */
  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @Query('nivel') nivel?: string,
    @Query('profesor') profesor?: string,
    @Query('canal') canal?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.surveys.list({ nivel, profesor, canal, from, to });
  }
}

/**
 * Client IP for the duplicate-flagging hash. `trust proxy` is configured in
 * main.ts, so req.ip already resolves the real client behind the Coolify
 * proxy — and, unlike reading X-Forwarded-For by hand, ignores entries the
 * client forged itself.
 */
function clientIp(req: Request): string | null {
  return req.ip || req.socket?.remoteAddress || null;
}
