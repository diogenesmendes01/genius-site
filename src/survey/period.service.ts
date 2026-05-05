import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreatePeriodDto } from './dto/create-period.dto';
import { SurveyPeriod } from './entities/survey-period.entity';
import { SurveyToken } from './entities/survey-token.entity';
import { StudentSourceService } from './student-source.service';
import { generateToken } from './token-generator';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SurveyPeriodService {
  private readonly logger = new Logger(SurveyPeriodService.name);

  constructor(
    @InjectRepository(SurveyPeriod)
    private readonly periods: Repository<SurveyPeriod>,
    @InjectRepository(SurveyToken)
    private readonly tokens: Repository<SurveyToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly studentSource: StudentSourceService,
  ) {}

  async createPeriod(dto: CreatePeriodDto, criadoPor: string) {
    const existing = await this.periods.findOne({
      where: { mes_referencia: dto.mes, ano_referencia: dto.ano },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe un período para ${dto.mes}/${dto.ano}`,
      );
    }

    const students = await this.studentSource.fetchActiveStudentsForSurvey();
    if (students.length === 0) {
      throw new ConflictException(
        'No hay estudiantes activos para generar la encuesta',
      );
    }

    const validadeDias = dto.validade_dias ?? 7;
    const agora = new Date();
    const expiraEm = new Date(agora.getTime() + validadeDias * DAY_MS);

    return this.dataSource.transaction(async (manager) => {
      const period = manager.create(SurveyPeriod, {
        mes_referencia: dto.mes,
        ano_referencia: dto.ano,
        gerado_por: criadoPor,
        validade_dias: validadeDias,
      });
      await manager.save(period);

      // Generate tokens with collision retry — 12 chars over a 28-char
      // alphabet gives us 28^12 ≈ 2.3e17 possibilities, but since we'll have
      // ~100 students per period, a unique-constraint retry is enough.
      const tokens: SurveyToken[] = [];
      const seen = new Set<string>();
      for (const s of students) {
        let value = generateToken();
        while (seen.has(value)) value = generateToken();
        seen.add(value);
        tokens.push(
          manager.create(SurveyToken, {
            token: value,
            period_id: period.id,
            aluno_codigo: s.aluno_codigo,
            aluno_nome: s.aluno_nome,
            turma_codigo: s.turma_codigo,
            turma_nome: s.turma_nome,
            professor_nome: s.professor_nome,
            expira_em: expiraEm,
          }),
        );
      }

      // chunk to avoid hitting SQLite's parameter limit on huge classes.
      for (let i = 0; i < tokens.length; i += 100) {
        await manager.save(tokens.slice(i, i + 100));
      }

      this.logger.log(
        `Período ${dto.mes}/${dto.ano} criado com ${tokens.length} tokens (gerado_por=${criadoPor})`,
      );

      return {
        period,
        tokens_created: tokens.length,
      };
    });
  }

  async listPeriods() {
    const all = await this.periods.find({
      order: { ano_referencia: 'DESC', mes_referencia: 'DESC' },
    });
    if (all.length === 0) return [];

    // Counts per period in one round-trip rather than N+1.
    const ids = all.map((p) => p.id);
    const tokenCounts = await this.tokens
      .createQueryBuilder('t')
      .select('t.period_id', 'period_id')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        'SUM(CASE WHEN t.usado_em IS NOT NULL THEN 1 ELSE 0 END)',
        'respondidas',
      )
      .where('t.period_id IN (:...ids)', { ids })
      .groupBy('t.period_id')
      .getRawMany();

    const byPeriod = new Map<string, { total: number; respondidas: number }>();
    for (const row of tokenCounts) {
      byPeriod.set(row.period_id, {
        total: Number(row.total) || 0,
        respondidas: Number(row.respondidas) || 0,
      });
    }

    return all.map((p) => ({
      id: p.id,
      mes_referencia: p.mes_referencia,
      ano_referencia: p.ano_referencia,
      gerado_por: p.gerado_por,
      criado_em: p.criado_em,
      validade_dias: p.validade_dias,
      tokens_total: byPeriod.get(p.id)?.total ?? 0,
      tokens_respondidos: byPeriod.get(p.id)?.respondidas ?? 0,
    }));
  }

  async getPeriodOrFail(id: string): Promise<SurveyPeriod> {
    const p = await this.periods.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Período no encontrado');
    return p;
  }
}
