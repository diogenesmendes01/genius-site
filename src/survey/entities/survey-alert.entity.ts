import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type SurveyAlertType =
  | 'intencao_critica'
  | 'nota_professor_baixa'
  | 'nota_aulas_baixa';

// Lightweight log table — each row is one trigger that fired when a response
// came in. Email/WhatsApp escalation is intentionally out of scope (spec §7);
// for now we just persist so the admin panel can surface them.
@Entity('survey_alerts')
@Index(['period_id'])
@Index(['turma_codigo'])
export class SurveyAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  period_id: string;

  @Column({ type: 'uuid' })
  response_id: string;

  @Column({ type: 'varchar' })
  turma_codigo: string;

  @Column({ type: 'varchar' })
  tipo: SurveyAlertType;

  @Column({ type: 'varchar' })
  detalhe: string;

  @Column({ type: 'boolean', default: false })
  visualizado: boolean;

  @CreateDateColumn()
  criado_em: Date;
}
