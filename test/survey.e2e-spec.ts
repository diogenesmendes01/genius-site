import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request = require('supertest');
import { SurveyResponse } from '../src/survey/entities/survey-response.entity';
import { createTestApp, loginAsAdmin } from './helpers/app';

const VALID_RESPONSE = {
  nota_aulas: 5,
  progresso: 'mucho_progreso',
  ritmo: 'perfecto',
  pontualidade: 'siempre',
  tarefas: 'bien',
  nota_professor: 5,
  professor_explica: 'siempre',
  aulas_dinamicas: 'siempre',
  nota_geral: 5,
  recomendacao: 'definitivamente',
  atendimento: 'excelente',
  intencao_continuar: 'comprometido',
  feedback_conteudo: 'todo bien',
};

const CRITICAL_RESPONSE = {
  ...VALID_RESPONSE,
  nota_aulas: 1,
  nota_professor: 2,
  recomendacao: 'no_recomendaria',
  intencao_continuar: 'considerando_no_continuar',
};

describe('Survey end-to-end', () => {
  let app: INestApplication;
  let cookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    cookie = await loginAsAdmin(app);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ─── Period generation ──────────────────────────────────────────────

  let periodId: string;
  let firstToken: string;
  let firstTurmaCodigo: string;

  it('admin can generate a period with one token per active student', async () => {
    const resp = await request(app.getHttpServer())
      .post('/api/admin/pesquisas/gerar')
      .set('Cookie', cookie)
      .send({ mes: 5, ano: 2026 })
      .expect(201);

    expect(resp.body.period).toBeDefined();
    expect(resp.body.period.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(resp.body.tokens_created).toBeGreaterThan(0);
    periodId = resp.body.period.id;
  });

  it('refuses to regenerate the same (mes, ano)', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/pesquisas/gerar')
      .set('Cookie', cookie)
      .send({ mes: 5, ano: 2026 })
      .expect(409);
  });

  it('rejects invalid month/year', async () => {
    await request(app.getHttpServer())
      .post('/api/admin/pesquisas/gerar')
      .set('Cookie', cookie)
      .send({ mes: 13, ano: 2026 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/admin/pesquisas/gerar')
      .set('Cookie', cookie)
      .send({ mes: 5, ano: 1999 })
      .expect(400);
  });

  it('admin list shows the new period with token totals', async () => {
    const resp = await request(app.getHttpServer())
      .get('/api/admin/pesquisas')
      .set('Cookie', cookie)
      .expect(200);

    expect(Array.isArray(resp.body)).toBe(true);
    const found = resp.body.find((p: any) => p.id === periodId);
    expect(found).toBeDefined();
    expect(found.tokens_total).toBeGreaterThan(0);
    expect(found.tokens_respondidos).toBe(0);
  });

  // ─── WhatsApp messages give us the tokens ───────────────────────────

  it('whatsapp endpoint emits per-student messages, never aggregating tokens', async () => {
    const resp = await request(app.getHttpServer())
      .get(`/api/admin/pesquisas/${periodId}/mensagens-whatsapp`)
      .set('Cookie', cookie)
      .expect(200);

    expect(resp.body.period).toEqual({ mes: 5, ano: 2026 });
    expect(resp.body.turmas.length).toBeGreaterThan(0);
    const sample = resp.body.turmas[0];
    expect(sample.turma_nome).toBeTruthy();
    expect(sample.alunos_count).toBeGreaterThan(0);
    expect(sample.alunos).toHaveLength(sample.alunos_count);

    // The shape is per-student, never one block with all tokens — that's
    // the whole point of the refactor: a message visible to a third
    // party only burns one token, not the entire class.
    expect(sample).not.toHaveProperty('mensagem');

    // Each individual message contains exactly one /p/<token> link, and
    // the token belongs to that very student (cross-checked via the
    // first-name greeting).
    for (const turma of resp.body.turmas) {
      for (const aluno of turma.alunos) {
        const tokens = [...aluno.mensagem.matchAll(/\/p\/([a-z0-9]{12})/g)];
        expect(tokens).toHaveLength(1);
        const firstName = aluno.aluno_nome.split(/\s+/)[0];
        expect(aluno.mensagem).toContain(`¡Hola ${firstName}!`);
      }
    }

    const firstAluno = sample.alunos[0];
    expect(firstAluno.mensagem).toContain('mayo');
    firstToken = firstAluno.mensagem.match(/\/p\/([a-z0-9]{12})/)![1];
    firstTurmaCodigo = sample.turma_codigo;
  });

  // ─── Public token validation ────────────────────────────────────────

  it('public GET returns the survey context for a valid token, no auth', async () => {
    const resp = await request(app.getHttpServer())
      .get(`/api/pesquisa/${firstToken}/info`)
      .expect(200);

    expect(resp.body).toMatchObject({
      mes_referencia: 5,
      ano_referencia: 2026,
    });
    expect(resp.body.turma_nome).toBeTruthy();
  });

  it('public GET 404s on an invalid token', async () => {
    await request(app.getHttpServer())
      .get('/api/pesquisa/notarealtoken/info')
      .expect(404);
  });

  // ─── Submit ─────────────────────────────────────────────────────────

  it('rejects submissions missing required fields', async () => {
    await request(app.getHttpServer())
      .post(`/api/pesquisa/${firstToken}`)
      .send({ nota_aulas: 5 })
      .expect(400);
  });

  it('rejects submissions with values outside the allowed enum', async () => {
    await request(app.getHttpServer())
      .post(`/api/pesquisa/${firstToken}`)
      .send({ ...VALID_RESPONSE, recomendacao: 'no-existe' })
      .expect(400);
  });

  it('accepts a valid submission and stores the response without aluno_codigo', async () => {
    await request(app.getHttpServer())
      .post(`/api/pesquisa/${firstToken}`)
      .send(VALID_RESPONSE)
      .expect(201);

    // Reach into the DB and confirm the response row has no aluno_codigo.
    const ds = app.get(DataSource);
    const repo = ds.getRepository(SurveyResponse);
    const rows = await repo.find();
    expect(rows.length).toBe(1);
    expect(rows[0]).not.toHaveProperty('aluno_codigo');
    // Belt and braces: the SQL columns exposed by metadata also exclude it.
    const cols = ds.getMetadata(SurveyResponse).columns.map((c) => c.propertyName);
    expect(cols).not.toContain('aluno_codigo');
  });

  it('rejects re-using a token after it was responded', async () => {
    await request(app.getHttpServer())
      .post(`/api/pesquisa/${firstToken}`)
      .send(VALID_RESPONSE)
      .expect(410);
  });

  // ─── Aggregations & alerts ──────────────────────────────────────────

  it('period detail reflects the response and exposes NPS', async () => {
    const resp = await request(app.getHttpServer())
      .get(`/api/admin/pesquisas/${periodId}`)
      .set('Cookie', cookie)
      .expect(200);

    expect(resp.body.summary.respondidas).toBe(1);
    expect(resp.body.summary.media_aulas).toBe(5);
    // 1/1 promoter → NPS 100
    expect(resp.body.summary.nps).toBe(100);
    expect(resp.body.por_turma.length).toBeGreaterThan(0);
  });

  it('turma detail surfaces the response without leaking aluno_codigo', async () => {
    const resp = await request(app.getHttpServer())
      .get(`/api/admin/pesquisas/${periodId}/turma/${firstTurmaCodigo}`)
      .set('Cookie', cookie)
      .expect(200);

    expect(resp.body.respostas.length).toBeGreaterThanOrEqual(1);
    for (const r of resp.body.respostas) {
      expect(r).not.toHaveProperty('aluno_codigo');
    }
  });

  it('a critical response triggers alerts that show on detail', async () => {
    // Need a second token from a different student. Pull one from the
    // whatsapp endpoint and submit a critical response.
    const wResp = await request(app.getHttpServer())
      .get(`/api/admin/pesquisas/${periodId}/mensagens-whatsapp`)
      .set('Cookie', cookie)
      .expect(200);

    let alarmingToken: string | null = null;
    outer: for (const turma of wResp.body.turmas) {
      for (const aluno of turma.alunos) {
        const m = aluno.mensagem.match(/\/p\/([a-z0-9]{12})/);
        if (m && m[1] !== firstToken) {
          alarmingToken = m[1];
          break outer;
        }
      }
    }
    expect(alarmingToken).toBeTruthy();

    await request(app.getHttpServer())
      .post(`/api/pesquisa/${alarmingToken}`)
      .send(CRITICAL_RESPONSE)
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/api/admin/pesquisas/${periodId}`)
      .set('Cookie', cookie)
      .expect(200);

    const tipos = new Set(detail.body.alertas.map((a: any) => a.tipo));
    expect(tipos).toContain('intencao_critica');
    expect(tipos).toContain('nota_aulas_baixa');
    expect(tipos).toContain('nota_professor_baixa');
  });

  // ─── Auth ───────────────────────────────────────────────────────────

  it('admin endpoints require authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/pesquisas')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/admin/pesquisas/gerar')
      .send({ mes: 6, ano: 2026 })
      .expect(401);
  });
});
