import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One answer to one configurable survey question. `questionId` matches an
 * id in survey-config.ts; exactly one of the value columns is set depending
 * on the question type (scale5 → valueInt, radio/text/textarea → valueText,
 * checks → valueJson with a JSON string array).
 */
@Entity('survey_answers')
export class SurveyAnswerEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  responseId: string;

  @Index()
  @Column()
  questionId: string;

  @Column({ type: 'int', nullable: true })
  valueInt: number | null;

  @Column({ type: 'text', nullable: true })
  valueText: string | null;

  @Column({ type: 'text', nullable: true })
  valueJson: string | null;
}
