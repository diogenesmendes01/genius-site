import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('survey_periods')
@Index(['mes_referencia', 'ano_referencia'], { unique: true })
export class SurveyPeriod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'integer' })
  mes_referencia: number;

  @Column({ type: 'integer' })
  ano_referencia: number;

  @Column({ type: 'varchar' })
  gerado_por: string;

  @Column({ type: 'integer', default: 7 })
  validade_dias: number;

  @CreateDateColumn()
  criado_em: Date;
}
