import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SurveyAnswerEntity } from './survey-answer.entity';
import { SurveyResponseEntity } from './survey-response.entity';
import { SurveysController } from './surveys.controller';
import { SurveysService } from './surveys.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SurveyResponseEntity, SurveyAnswerEntity]),
    AuthModule,
  ],
  controllers: [SurveysController],
  providers: [SurveysService],
})
export class SurveysModule {}
