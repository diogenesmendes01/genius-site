import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SurveyPeriod } from './survey-period.entity';

// The actual answer. Deliberately has NO aluno_codigo column — the token
// (in SurveyToken) is what identifies who responded, and once the response
// is saved, the link from response → student is gone.
@Entity('survey_responses')
export class SurveyResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  period_id: string;

  @ManyToOne(() => SurveyPeriod, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'period_id' })
  period: SurveyPeriod;

  @Column({ type: 'varchar' })
  turma_codigo: string;

  @CreateDateColumn()
  respondido_em: Date;

  // ─── Aulas ───
  @Column({ type: 'integer' })
  nota_aulas: number;

  @Column({ type: 'varchar' })
  progresso: string;

  @Column({ type: 'varchar' })
  ritmo: string;

  @Column({ type: 'varchar' })
  pontualidade: string;

  @Column({ type: 'varchar' })
  tarefas: string;

  // ─── Professor ───
  @Column({ type: 'integer' })
  nota_professor: number;

  @Column({ type: 'varchar' })
  professor_explica: string;

  @Column({ type: 'varchar' })
  aulas_dinamicas: string;

  // ─── Escola / experiência geral ───
  @Column({ type: 'integer' })
  nota_geral: number;

  @Column({ type: 'varchar' })
  recomendacao: string;

  @Column({ type: 'varchar' })
  atendimento: string;

  @Column({ type: 'varchar' })
  intencao_continuar: string;

  // ─── Feedback livre ───
  @Column({ type: 'text', nullable: true })
  feedback_conteudo: string | null;

  @Column({ type: 'text', nullable: true })
  feedback_professor: string | null;

  @Column({ type: 'text', nullable: true })
  feedback_escola: string | null;

  @Column({ type: 'text', nullable: true })
  situacao_pessoal: string | null;
}
