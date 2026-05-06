import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SurveyAlert } from './entities/survey-alert.entity';
import { SurveyPeriod } from './entities/survey-period.entity';
import { SurveyResponse } from './entities/survey-response.entity';
import { SurveyToken } from './entities/survey-token.entity';
import {
  INTENCAO_CONTINUAR,
  RECOMENDACAO_DETRACTORS,
  RECOMENDACAO_PROMOTORS,
} from './survey.constants';

export interface TurmaStats {
  turma_codigo: string;
  turma_nome: string;
  professor_nome: string | null;
  alunos_count: number;
  respondidas: number;
  media_aulas: number | null;
  media_professor: number | null;
  media_geral: number | null;
}

@Injectable()
export class SurveyAnalyticsService {
  constructor(
    @InjectRepository(SurveyPeriod)
    private readonly periods: Repository<SurveyPeriod>,
    @InjectRepository(SurveyToken)
    private readonly tokens: Repository<SurveyToken>,
    @InjectRepository(SurveyResponse)
    private readonly responses: Repository<SurveyResponse>,
    @InjectRepository(SurveyAlert)
    private readonly alerts: Repository<SurveyAlert>,
    private readonly config: ConfigService,
  ) {}

  /** Aggregate stats for one period. */
  async periodDetail(period_id: string) {
    const period = await this.periods.findOne({ where: { id: period_id } });
    if (!period) throw new NotFoundException('Período no encontrado');

    const [tokens, responses, alerts] = await Promise.all([
      this.tokens.find({ where: { period_id } }),
      this.responses.find({ where: { period_id } }),
      this.alerts.find({
        where: { period_id },
        order: { criado_em: 'DESC' },
      }),
    ]);

    return {
      period: {
        id: period.id,
        mes_referencia: period.mes_referencia,
        ano_referencia: period.ano_referencia,
        criado_em: period.criado_em,
        gerado_por: period.gerado_por,
      },
      summary: this.summarise(tokens, responses),
      por_turma: this.statsPerTurma(tokens, responses),
      alertas: alerts.map((a) => ({
        id: a.id,
        tipo: a.tipo,
        detalhe: a.detalhe,
        turma_codigo: a.turma_codigo,
        criado_em: a.criado_em,
        visualizado: a.visualizado,
      })),
    };
  }

  /** Responses for one specific class (anonymised — only the answers). */
  async turmaDetail(period_id: string, turma_codigo: string) {
    const period = await this.periods.findOne({ where: { id: period_id } });
    if (!period) throw new NotFoundException('Período no encontrado');

    const [tokens, responses] = await Promise.all([
      this.tokens.find({ where: { period_id, turma_codigo } }),
      this.responses.find({
        where: { period_id, turma_codigo },
        order: { respondido_em: 'DESC' },
      }),
    ]);
    if (tokens.length === 0) throw new NotFoundException('Turma sin tokens en este período');

    const sample = tokens[0];
    return {
      period: {
        id: period.id,
        mes_referencia: period.mes_referencia,
        ano_referencia: period.ano_referencia,
      },
      turma: {
        turma_codigo,
        turma_nome: sample.turma_nome,
        professor_nome: sample.professor_nome,
      },
      alunos_count: tokens.length,
      respondidas: tokens.filter((t) => t.usado_em).length,
      respostas: responses.map((r) => ({
        id: r.id,
        respondido_em: r.respondido_em,
        nota_aulas: r.nota_aulas,
        nota_professor: r.nota_professor,
        nota_geral: r.nota_geral,
        progresso: r.progresso,
        ritmo: r.ritmo,
        pontualidade: r.pontualidade,
        tarefas: r.tarefas,
        professor_explica: r.professor_explica,
        aulas_dinamicas: r.aulas_dinamicas,
        recomendacao: r.recomendacao,
        atendimento: r.atendimento,
        intencao_continuar: r.intencao_continuar,
        feedback_conteudo: r.feedback_conteudo,
        feedback_professor: r.feedback_professor,
        feedback_escola: r.feedback_escola,
        situacao_pessoal: r.situacao_pessoal,
      })),
    };
  }

  /**
   * Per-student WhatsApp messages, grouped by class for navigation but
   * **never aggregated into a single block** — each `mensagem` contains
   * exactly one token. The operator copies one message at a time into a
   * 1-on-1 chat with the student.
   *
   * Why per-student: the token is the auth credential for the public POST
   * endpoint, so any link visible to a third party can be consumed by
   * them, locking out the legitimate student. A single "paste this in the
   * group chat" block would expose every token to every classmate
   * (review #17 finding). URL prefix is taken from PUBLIC_BASE_URL env;
   * falls back to a relative `/p/:token`.
   */
  async whatsappMessages(period_id: string) {
    const period = await this.periods.findOne({ where: { id: period_id } });
    if (!period) throw new NotFoundException('Período no encontrado');

    const tokens = await this.tokens.find({ where: { period_id } });
    const baseUrl = (this.config.get<string>('PUBLIC_BASE_URL') ?? '').replace(/\/+$/, '');
    const monthName = MES_PT[period.mes_referencia] ?? `${period.mes_referencia}`;

    // Group by turma so the UI can show class context, but each entry's
    // `mensagem` is for that single student — never the whole class.
    const byTurma = new Map<string, typeof tokens>();
    for (const t of tokens) {
      const arr = byTurma.get(t.turma_codigo) ?? [];
      arr.push(t);
      byTurma.set(t.turma_codigo, arr);
    }

    const turmas = [...byTurma.entries()].map(([turma_codigo, list]) => {
      const sample = list[0];
      const alunos = list
        .slice()
        .sort((a, b) => a.aluno_nome.localeCompare(b.aluno_nome))
        .map((t) => {
          const url = baseUrl ? `${baseUrl}/p/${t.token}` : `/p/${t.token}`;
          const firstName = t.aluno_nome.split(/\s+/)[0] || t.aluno_nome;
          return {
            aluno_codigo: t.aluno_codigo,
            aluno_nome: t.aluno_nome,
            mensagem:
              `¡Hola ${firstName}! Tu encuesta de ${monthName} está aquí 🌟\n` +
              `${url}\n\n` +
              `Responder lleva menos de 3 minutos. ¡Gracias!`,
          };
        });
      return {
        turma_codigo,
        turma_nome: sample.turma_nome,
        professor_nome: sample.professor_nome,
        alunos_count: list.length,
        alunos,
      };
    });

    turmas.sort((a, b) => a.turma_nome.localeCompare(b.turma_nome));

    return {
      period: {
        mes: period.mes_referencia,
        ano: period.ano_referencia,
      },
      turmas,
    };
  }

  // ─── helpers ───

  private summarise(tokens: SurveyToken[], responses: SurveyResponse[]) {
    const tokens_total = tokens.length;
    const respondidas = responses.length;
    const taxa_resposta =
      tokens_total > 0 ? Math.round((respondidas / tokens_total) * 1000) / 10 : 0;

    const media_aulas = avg(responses.map((r) => r.nota_aulas));
    const media_professor = avg(responses.map((r) => r.nota_professor));
    const media_geral = avg(responses.map((r) => r.nota_geral));

    // NPS-style: %promotores − %detratores.
    let promotores = 0;
    let detratores = 0;
    for (const r of responses) {
      if ((RECOMENDACAO_PROMOTORS as readonly string[]).includes(r.recomendacao)) {
        promotores++;
      } else if ((RECOMENDACAO_DETRACTORS as readonly string[]).includes(r.recomendacao)) {
        detratores++;
      }
    }
    const nps =
      respondidas > 0
        ? Math.round(((promotores - detratores) / respondidas) * 100)
        : null;

    const intencao_distribuicao: Record<string, number> = {};
    for (const v of INTENCAO_CONTINUAR) intencao_distribuicao[v] = 0;
    for (const r of responses) {
      if (r.intencao_continuar in intencao_distribuicao) {
        intencao_distribuicao[r.intencao_continuar]++;
      }
    }

    return {
      tokens_total,
      respondidas,
      taxa_resposta,
      media_aulas,
      media_professor,
      media_geral,
      nps,
      intencao_distribuicao,
    };
  }

  private statsPerTurma(
    tokens: SurveyToken[],
    responses: SurveyResponse[],
  ): TurmaStats[] {
    const byCodigo = new Map<string, {
      sample: SurveyToken;
      tokens: SurveyToken[];
      responses: SurveyResponse[];
    }>();
    for (const t of tokens) {
      const entry = byCodigo.get(t.turma_codigo) ?? {
        sample: t,
        tokens: [],
        responses: [],
      };
      entry.tokens.push(t);
      byCodigo.set(t.turma_codigo, entry);
    }
    for (const r of responses) {
      const entry = byCodigo.get(r.turma_codigo);
      if (entry) entry.responses.push(r);
    }
    return [...byCodigo.values()]
      .map(({ sample, tokens, responses }) => ({
        turma_codigo: sample.turma_codigo,
        turma_nome: sample.turma_nome,
        professor_nome: sample.professor_nome,
        alunos_count: tokens.length,
        respondidas: responses.length,
        media_aulas: avg(responses.map((r) => r.nota_aulas)),
        media_professor: avg(responses.map((r) => r.nota_professor)),
        media_geral: avg(responses.map((r) => r.nota_geral)),
      }))
      .sort((a, b) => a.turma_nome.localeCompare(b.turma_nome));
  }
}

function avg(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sum = xs.reduce((a, b) => a + b, 0);
  return Math.round((sum / xs.length) * 10) / 10;
}

const MES_PT: Record<number, string> = {
  1: 'enero',
  2: 'febrero',
  3: 'marzo',
  4: 'abril',
  5: 'mayo',
  6: 'junio',
  7: 'julio',
  8: 'agosto',
  9: 'septiembre',
  10: 'octubre',
  11: 'noviembre',
  12: 'diciembre',
};
