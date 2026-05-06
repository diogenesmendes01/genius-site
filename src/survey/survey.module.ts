import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Q10Module } from '../q10/q10.module';
import { AdminSurveyController } from './admin-survey.controller';
import { SurveyAnalyticsService } from './analytics.service';
import { SurveyAlert } from './entities/survey-alert.entity';
import { SurveyPeriod } from './entities/survey-period.entity';
import { SurveyResponse } from './entities/survey-response.entity';
import { SurveyToken } from './entities/survey-token.entity';
import { SurveyPeriodService } from './period.service';
import { PublicSurveyController } from './public-survey.controller';
import { SurveyResponseService } from './response.service';
import { StudentSourceService } from './student-source.service';
import { SurveyPagesController } from './survey-pages.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SurveyPeriod,
      SurveyToken,
      SurveyResponse,
      SurveyAlert,
    ]),
    AuthModule,
    Q10Module,
  ],
  controllers: [
    AdminSurveyController,
    PublicSurveyController,
    SurveyPagesController,
  ],
  providers: [
    SurveyPeriodService,
    SurveyResponseService,
    SurveyAnalyticsService,
    StudentSourceService,
  ],
})
export class SurveyModule {}
