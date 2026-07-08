import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One submitted satisfaction survey. Only the fields the dashboard filters
 * or aggregates directly live here as typed columns — every other question
 * is a row in survey_answers (see SurveyAnswerEntity), so the questionnaire
 * can grow/shrink via survey-config.ts without schema changes.
 */
@Entity('survey_responses')
export class SurveyResponseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Distribution channel from the link (?src=whatsapp|en-clase|instagram…). */
  @Column({ type: 'varchar', nullable: true })
  canal: string | null;

  /** P6 — 0..10 recommendation score. */
  @Column({ type: 'int' })
  nps: number;

  /** P5 — 1..5 overall satisfaction. */
  @Column({ type: 'int' })
  csat: number;

  /** P4 — teacher name exactly as the student typed it (optional). */
  @Column({ type: 'varchar', nullable: true })
  profesor: string | null;

  /** Normalised teacher name (lowercase, no accents) used for grouping. */
  @Index()
  @Column({ type: 'varchar', nullable: true })
  profesorNorm: string | null;

  /** P1 — optional self-identification. */
  @Column({ type: 'varchar', nullable: true })
  nombre: string | null;

  /** P2 — optional e-mail / WhatsApp for follow-up. */
  @Column({ type: 'varchar', nullable: true })
  contacto: string | null;

  /** P34 — student authorised follow-up contact. */
  @Column({ type: 'boolean', default: false })
  contactoOk: boolean;

  /** Student authorised using their comment as a website testimonial. */
  @Column({ type: 'boolean', default: false })
  testimonioOk: boolean;

  /** Optional CEFR level (A1..C2) — fixed list, self-reported. */
  @Column({ type: 'varchar', nullable: true })
  nivel: string | null;

  /** Optional "¿hace cuánto estudias?" bracket — fixed list. */
  @Column({ type: 'varchar', nullable: true })
  tiempo: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
