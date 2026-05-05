import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SubmitResponseDto } from './dto/submit-response.dto';
import { SurveyResponseService } from './response.service';

// AJAX endpoints called by the student-facing page. The HTML itself is
// served by SurveyPagesController so it can sit outside the /api prefix.
@Controller('pesquisa')
export class PublicSurveyController {
  constructor(private readonly responses: SurveyResponseService) {}

  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 3600_000 } })
  async getSurvey(@Param('token') token: string) {
    return this.responses.getSurveyByToken(token);
  }

  // 10 req/h per IP (spec §5). Defends against accidental double-submit and
  // someone trying to brute-force token values from a single IP.
  @Post(':token')
  @Throttle({ default: { limit: 10, ttl: 3600_000 } })
  async submit(
    @Param('token') token: string,
    @Body() dto: SubmitResponseDto,
  ) {
    return this.responses.submitResponse(token, dto);
  }
}
