import {
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SubmitResponseDto } from './dto/submit-response.dto';
import { SurveyAlert, SurveyAlertType } from './entities/survey-alert.entity';
import { SurveyResponse } from './entities/survey-response.entity';
import { SurveyToken } from './entities/survey-token.entity';
import {
  INTENCAO_CRITICA,
  NOTA_BAIXA_THRESHOLD,
} from './survey.constants';

@Injectable()
export class SurveyResponseService {
  private readonly logger = new Logger(SurveyResponseService.name);

  constructor(
    @InjectRepository(SurveyToken)
    private readonly tokens: Repository<SurveyToken>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Read-only validation used by the public page before showing the form. */
  async getSurveyByToken(token: string) {
    const t = await this.tokens.findOne({
      where: { token },
      relations: { period: true },
    });
    if (!t) throw new NotFoundException('Link inválido');
    if (t.usado_em) throw new GoneException('Esta encuesta ya fue respondida');
    if (new Date() > t.expira_em) {
      throw new GoneException('Esta encuesta expiró');
    }
    return {
      turma_nome: t.turma_nome,
      professor_nome: t.professor_nome,
      mes_referencia: t.period.mes_referencia,
      ano_referencia: t.period.ano_referencia,
    };
  }

  /**
   * Submit transactionally: validate, persist response, atomically mark the
   * token used (UPDATE … WHERE usado_em IS NULL), derive alerts. The atomic
   * mark closes the TOCTOU race that two concurrent submissions on the same
   * token would otherwise win — better-sqlite3 doesn't support pessimistic
   * row locks, so we rely on SQL's UPDATE-with-predicate semantics, which
   * are portable to Postgres if the project migrates.
   */
  async submitResponse(token: string, dto: SubmitResponseDto) {
    return this.dataSource.transaction(async (manager) => {
      const t = await manager.findOne(SurveyToken, { where: { token } });
      if (!t) throw new NotFoundException('Link inválido');
      if (t.usado_em) throw new GoneException('Esta encuesta ya fue respondida');
      if (new Date() > t.expira_em) {
        throw new GoneException('Esta encuesta expiró');
      }

      const response = manager.create(SurveyResponse, {
        period_id: t.period_id,
        turma_codigo: t.turma_codigo,
        nota_aulas: dto.nota_aulas,
        progresso: dto.progresso,
        ritmo: dto.ritmo,
        pontualidade: dto.pontualidade,
        tarefas: dto.tarefas,
        nota_professor: dto.nota_professor,
        professor_explica: dto.professor_explica,
        aulas_dinamicas: dto.aulas_dinamicas,
        nota_geral: dto.nota_geral,
        recomendacao: dto.recomendacao,
        atendimento: dto.atendimento,
        intencao_continuar: dto.intencao_continuar,
        feedback_conteudo: dto.feedback_conteudo ?? null,
        feedback_professor: dto.feedback_professor ?? null,
        feedback_escola: dto.feedback_escola ?? null,
        situacao_pessoal: dto.situacao_pessoal ?? null,
      });
      await manager.save(response);

      const now = new Date();
      const result = await manager
        .createQueryBuilder()
        .update(SurveyToken)
        .set({ usado_em: now })
        .where('id = :id AND usado_em IS NULL', { id: t.id })
        .execute();
      if (!result.affected || result.affected === 0) {
        // Lost the race against a concurrent submission. Throwing rolls
        // back the freshly-inserted response too.
        throw new GoneException('Esta encuesta ya fue respondida');
      }

      const alerts = this.deriveAlerts(t.period_id, response.id, dto, t.turma_codigo);
      if (alerts.length > 0) {
        await manager.save(SurveyAlert, alerts);
        this.logger.warn(
          `Respuesta crítica registrada en período ${t.period_id}: ${alerts.map((a) => a.tipo).join(', ')}`,
        );
      }

      return { success: true };
    });
  }

  private deriveAlerts(
    period_id: string,
    response_id: string,
    dto: SubmitResponseDto,
    turma_codigo: string,
  ): Partial<SurveyAlert>[] {
    const alerts: Partial<SurveyAlert>[] = [];
    const push = (tipo: SurveyAlertType, detalhe: string) =>
      alerts.push({ period_id, response_id, turma_codigo, tipo, detalhe });

    if (
      INTENCAO_CRITICA.includes(
        dto.intencao_continuar as (typeof INTENCAO_CRITICA)[number],
      )
    ) {
      push('intencao_critica', `intencao_continuar=${dto.intencao_continuar}`);
    }
    if (dto.nota_professor <= NOTA_BAIXA_THRESHOLD) {
      push('nota_professor_baixa', `nota_professor=${dto.nota_professor}`);
    }
    if (dto.nota_aulas <= NOTA_BAIXA_THRESHOLD) {
      push('nota_aulas_baixa', `nota_aulas=${dto.nota_aulas}`);
    }
    return alerts;
  }
}
