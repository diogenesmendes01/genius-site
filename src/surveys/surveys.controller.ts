import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
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
 * Best-effort client IP for the duplicate-flagging hash. Behind the Coolify
 * proxy the socket address is the proxy, so we prefer the first hop of
 * X-Forwarded-For. Good enough for a dedup *signal* — this value is hashed
 * and never used as a security control.
 */
function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0];
  return first?.trim() || req.ip || req.socket?.remoteAddress || null;
}
