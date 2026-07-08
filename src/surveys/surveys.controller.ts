import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
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
  create(@Body() dto: CreateSurveyResponseDto) {
    return this.surveys.create(dto);
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
