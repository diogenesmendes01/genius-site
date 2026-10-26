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
import { SURVEYS, getSurvey } from './survey-registry';
import { SurveysService } from './surveys.service';

// 5 submissions/min/IP in production; overridable so the e2e suite can
// exercise more than 5 POSTs without tripping the limiter.
const SUBMIT_LIMIT = Number(process.env.SURVEY_THROTTLE_LIMIT ?? 5);

/**
 * Every endpoint takes an optional `survey` key ('alumnos' by default, so
 * the original links and dashboard calls keep working; 'equipe' for the
 * staff survey — see survey-registry.ts).
 */
@Controller('surveys')
export class SurveysController {
  constructor(private readonly surveys: SurveysService) {}

  /** Public: the wizard renders itself from this config. `t` = link token. */
  @Get('config')
  getConfig(@Query('survey') survey?: string, @Query('t') token?: string) {
    return this.surveys.config(getSurvey(survey), token);
  }

  /** Public submission — throttled like the login endpoint to stop spam. */
  @Throttle({ default: { limit: SUBMIT_LIMIT, ttl: 60_000 } })
  @Post()
  create(@Body() dto: CreateSurveyResponseDto, @Req() req: Request) {
    return this.surveys.create(getSurvey(dto.survey), dto, clientIp(req));
  }

  /** Admin: the surveys the dashboard can show. */
  @UseGuards(JwtAuthGuard)
  @Get('list')
  listSurveys() {
    return Object.values(SURVEYS).map((s) => ({ key: s.key, name: s.name, lang: s.ui.lang }));
  }

  /**
   * Admin: pre-aggregated stats for the survey's dashboard tab.
   * `commentsLimit` accepts a number or 'all' (used by the printable
   * report, which must include every comment, not just the latest 30).
   */
  @UseGuards(JwtAuthGuard)
  @Get('stats')
  stats(
    @Query('survey') survey?: string,
    @Query('nivel') nivel?: string,
    @Query('profesor') profesor?: string,
    @Query('canal') canal?: string,
    @Query('modalidad') modalidad?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('commentsLimit') commentsLimit?: string,
  ) {
    const limit =
      commentsLimit === 'all'
        ? Number.MAX_SAFE_INTEGER
        : Math.max(1, parseInt(commentsLimit ?? '', 10) || 30);
    return this.surveys.stats(
      getSurvey(survey),
      { nivel, profesor, canal, modalidad, from, to },
      limit,
    );
  }

  /** Admin: download every response as CSV (respects the same filters). */
  @UseGuards(JwtAuthGuard)
  @Get('export.csv')
  async exportCsv(
    @Res() res: Response,
    @Query('survey') survey?: string,
    @Query('nivel') nivel?: string,
    @Query('profesor') profesor?: string,
    @Query('canal') canal?: string,
    @Query('modalidad') modalidad?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const def = getSurvey(survey);
    const csv = await this.surveys.exportCsv(def, { nivel, profesor, canal, modalidad, from, to });
    const today = new Date().toISOString().slice(0, 10);
    const base = def.key === 'alumnos' ? 'encuesta-respuestas' : `encuesta-${def.key}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}-${today}.csv"`);
    res.send(csv);
  }

  /** Admin: raw responses (with answers) for drill-down/export. */
  @UseGuards(JwtAuthGuard)
  @Get()
  list(
    @Query('survey') survey?: string,
    @Query('nivel') nivel?: string,
    @Query('profesor') profesor?: string,
    @Query('canal') canal?: string,
    @Query('modalidad') modalidad?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.surveys.list(getSurvey(survey), { nivel, profesor, canal, modalidad, from, to });
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
