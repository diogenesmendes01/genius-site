import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createTestApp, loginAsAdmin } from './helpers/app';

const PROFESSOR = 'Professor/a';
const ADMIN = 'Equipe administrativa, comercial ou gestão';

/** A minimal valid staff submission: every required question answered. */
function equipePayload(rol = PROFESSOR, nps = 9) {
  const base: Record<string, unknown> = {
    nps_motivo: 'Equipe acolhedora e método claro.',
    permanencia: 5,
    remuneracao: 4,
    pagamentos_prazo: 5,
    previsibilidade: 4,
    carga: 4,
    ferramentas: 3,
    expectativas: 5,
    feedback: 3,
    mudancas: 4,
    problemas: 4,
    decisoes: 4,
    desenvolvimento: 3,
    reconhecimento: 4,
    autonomia: 5,
    orgulho: 5,
  };
  const role =
    rol === PROFESSOR
      ? { ped_material: 3, ped_material_acesso: 2, ped_nivel_clareza: 2, ped_nivelamento: 2, ped_turmas: 4, ped_dificuldade: 3, ped_troca: 2 }
      : { adm_processos: 3, adm_informacao: 4, adm_prazo: 3, adm_ferramentas: 2 };
  return {
    survey: 'equipe',
    nps,
    csat: 4,
    rol,
    tiempo: 'De 1 a 2 anos',
    answers: { ...base, ...role },
  };
}

describe('Surveys — pesquisa de clima da equipe (/equipe)', () => {
  let app: INestApplication;
  let adminCookie: string;

  beforeAll(async () => {
    delete process.env.SURVEY_EQUIPE_TOKEN;
    app = await createTestApp();
    adminCookie = await loginAsAdmin(app);
  });

  afterAll(async () => {
    delete process.env.SURVEY_EQUIPE_TOKEN;
    await app.close();
  });

  describe('GET /api/surveys/config?survey=equipe', () => {
    it('returns the Portuguese wizard with its own UI strings', async () => {
      const resp = await request(app.getHttpServer())
        .get('/api/surveys/config?survey=equipe')
        .expect(200);
      expect(resp.body.key).toBe('equipe');
      expect(resp.body.ui.lang).toBe('pt-BR');
      expect(resp.body.ui.submit).toBe('Enviar respostas');
      const ids = resp.body.steps.flatMap((s: any) => s.questions.map((q: any) => q.id));
      expect(ids).toContain('rol');
      expect(ids).toContain('nps');
      expect(ids).toContain('ped_nivel_clareza');
      expect(ids).not.toContain('contacto_ok'); // anonymous by design
    });

    it('still serves the student survey without a key', async () => {
      const resp = await request(app.getHttpServer()).get('/api/surveys/config').expect(200);
      expect(resp.body.key).toBe('alumnos');
      expect(resp.body.ui.lang).toBe('es');
    });

    it('404s on an unknown survey', async () => {
      await request(app.getHttpServer()).get('/api/surveys/config?survey=nope').expect(404);
    });
  });

  describe('POST /api/surveys (survey=equipe)', () => {
    it('rejects a rol outside the fixed list', async () => {
      const body = equipePayload();
      body.rol = 'CEO';
      const resp = await request(app.getHttpServer()).post('/api/surveys').send(body).expect(400);
      expect(JSON.stringify(resp.body)).toContain('rol');
    });

    it('rejects student-only segments on the staff survey', async () => {
      const body = { ...equipePayload(), modalidad: 'Grupo regular' };
      await request(app.getHttpServer()).post('/api/surveys').send(body).expect(400);
    });

    it('rejects student question ids on the staff survey', async () => {
      const body = equipePayload();
      (body.answers as any).prof_claridad = 5;
      await request(app.getHttpServer()).post('/api/surveys').send(body).expect(400);
    });

    it('ignores contact fields even if sent (anonymous)', async () => {
      const body = { ...equipePayload(), contactoOk: true, nombre: 'Fulano', contacto: 'x@y.z', profesor: 'Alguém' };
      await request(app.getHttpServer()).post('/api/surveys').send(body).expect(201);
      const list = await request(app.getHttpServer())
        .get('/api/surveys?survey=equipe')
        .set('Cookie', adminCookie)
        .expect(200);
      const entry = list.body.entries[0];
      expect(entry.nombre).toBeNull();
      expect(entry.contacto).toBeNull();
      expect(entry.contactoOk).toBe(false);
      expect(entry.profesor).toBeNull();
      // Strict anonymity: no segment next to the free text of one person.
      expect(entry.rol).toBeNull();
      expect(entry.tiempo).toBeNull();
      expect(entry.survey).toBe('equipe');
    });

    it('accepts "Não se aplica" on the opt-out items', async () => {
      const body = equipePayload(ADMIN, 7);
      (body.answers as any).pagamentos_prazo = 'Não se aplica';
      await request(app.getHttpServer()).post('/api/surveys').send(body).expect(201);
    });
  });

  describe('stats isolation and anonymity', () => {
    it('keeps staff and student responses apart', async () => {
      const equipe = await request(app.getHttpServer())
        .get('/api/surveys/stats?survey=equipe')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(equipe.body.survey.key).toBe('equipe');
      expect(equipe.body.total).toBe(2);
      expect(equipe.body.professors).toEqual([]);

      const alumnos = await request(app.getHttpServer())
        .get('/api/surveys/stats')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(alumnos.body.survey.key).toBe('alumnos');
      expect(alumnos.body.total).toBe(0);
    });

    it('masks any group below 5 responses and strips chips from comments', async () => {
      const resp = await request(app.getHttpServer())
        .get('/api/surveys/stats?survey=equipe')
        .set('Cookie', adminCookie)
        .expect(200);
      const porFuncao = resp.body.breakdowns.find((b: any) => b.column === 'rol');
      expect(porFuncao.minN).toBe(5);
      for (const g of porFuncao.groups) {
        expect(g.insufficient).toBe(true);
        expect(g.nps).toBeNull();
        expect(g.csatAvg).toBeNull();
      }
      // Scale averages still work (they are not per-group).
      const permanencia = resp.body.averages.find((a: any) => a.questionId === 'permanencia');
      expect(permanencia.avg).toBe(5);
      // Comments carry no segment metadata.
      const c = resp.body.comments.find((x: any) => x.text.includes('acolhedora'));
      expect(c).toBeDefined();
      expect(c.question).toBe('Razão da nota');
      expect(c.profesor).toBeNull();
      expect(c.modalidad).toBeNull();
      expect(c.nivel).toBeNull();
    });

    it('reveals a group once it reaches 5 responses', async () => {
      for (let i = 0; i < 4; i++) {
        await request(app.getHttpServer()).post('/api/surveys').send(equipePayload(PROFESSOR, 10)).expect(201);
      }
      const resp = await request(app.getHttpServer())
        .get('/api/surveys/stats?survey=equipe')
        .set('Cookie', adminCookie)
        .expect(200);
      const porFuncao = resp.body.breakdowns.find((b: any) => b.column === 'rol');
      const profs = porFuncao.groups.find((g: any) => g.value === PROFESSOR);
      expect(profs.count).toBe(5);
      expect(profs.insufficient).toBe(false);
      expect(profs.nps).toBe(100);
      expect(profs.csatAvg).toBe(4);
      const adm = porFuncao.groups.find((g: any) => g.value === ADMIN);
      expect(adm.insufficient).toBe(true);
    });

    it('exports a CSV without segment or contact columns (strict anonymity)', async () => {
      const resp = await request(app.getHttpServer())
        .get('/api/surveys/export.csv?survey=equipe')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(resp.headers['content-disposition']).toContain('encuesta-equipe-');
      const lines = resp.text.replace(/^﻿/, '').split('\r\n');
      const header = lines[0].split(';');
      expect(header.slice(0, 4)).toEqual(['fecha', 'canal', 'nps', 'csat']);
      expect(header).not.toContain('rol');
      expect(header).not.toContain('tiempo');
      expect(header).not.toContain('nombre');
      expect(header).not.toContain('profesor');
      expect(header).toContain('ped_nivel_clareza');
      expect(lines.length - 1).toBe(6);
    });

    it('lists both surveys for the dashboard', async () => {
      const resp = await request(app.getHttpServer())
        .get('/api/surveys/list')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(resp.body.map((s: any) => s.key).sort()).toEqual(['alumnos', 'equipe']);
    });
  });

  describe('link token (SURVEY_EQUIPE_TOKEN)', () => {
    beforeAll(() => {
      process.env.SURVEY_EQUIPE_TOKEN = 'segredo-2026';
    });
    afterAll(() => {
      delete process.env.SURVEY_EQUIPE_TOKEN;
    });

    it('403s the config and the submission without the token', async () => {
      await request(app.getHttpServer()).get('/api/surveys/config?survey=equipe').expect(403);
      await request(app.getHttpServer()).post('/api/surveys').send(equipePayload()).expect(403);
    });

    it('accepts both with the right token', async () => {
      await request(app.getHttpServer())
        .get('/api/surveys/config?survey=equipe&t=segredo-2026')
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/surveys')
        .send({ ...equipePayload(), token: 'segredo-2026' })
        .expect(201);
    });

    it('never affects the student survey', async () => {
      await request(app.getHttpServer()).get('/api/surveys/config').expect(200);
    });
  });
});
