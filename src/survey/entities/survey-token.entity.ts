import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SurveyPeriod } from './survey-period.entity';

// One row per (period, student). Identifies *who* responded so the operator
// can chase down stragglers — but the response itself is stored in
// SurveyResponse without aluno_codigo, preserving anonymity by design.
//
// (period_id, aluno_codigo) is unique: spec contract is "um link único por
// aluno por mês". The DB enforces it; the service deduplicates the Q10
// input before insert as defense in depth.
@Entity('survey_tokens')
@Index(['period_id', 'aluno_codigo'], { unique: true })
@Index(['period_id', 'turma_codigo'])
export class SurveyToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 12-char alphanumeric, generated via crypto.randomBytes — short enough
  // to fit comfortably inside a WhatsApp link.
  @Column({ type: 'varchar', length: 12, unique: true })
  token: string;

  @Column({ type: 'uuid' })
  period_id: string;

  @ManyToOne(() => SurveyPeriod, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'period_id' })
  period: SurveyPeriod;

  // Q10 identifiers — kept as plain strings because the local DB has no
  // students/classes table; Q10 is the source of truth for those.
  @Column({ type: 'varchar' })
  aluno_codigo: string;

  // Denormalized for WhatsApp message generation and so the recorded
  // attribution survives downstream changes in Q10 (student moved class,
  // teacher swapped, etc.).
  @Column({ type: 'varchar' })
  aluno_nome: string;

  @Column({ type: 'varchar' })
  turma_codigo: string;

  @Column({ type: 'varchar' })
  turma_nome: string;

  @Column({ type: 'varchar', nullable: true })
  professor_nome: string | null;

  @Column({ type: 'datetime', nullable: true })
  usado_em: Date | null;

  @Column({ type: 'datetime' })
  expira_em: Date;

  @CreateDateColumn()
  criado_em: Date;
}
