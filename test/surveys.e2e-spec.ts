import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createTestApp, loginAsAdmin } from './helpers/app';

/** A minimal valid v2 submission: every required question answered. */
function validPayload() {
  return {
    nps: 9,
    csat: 5,
    canal: 'whatsapp',
    profesor: 'Ana Martínez',
    contactoOk: true,
    nombre: 'María López',
    contacto: 'maria@example.com',
    testimonioOk: true,
    nivel: 'B1',
    tiempo: 'De 3 a 6 meses',
    modalidad: 'Grupo regular',
    pais: 'Guatemala',
    answers: {
      nps_motivo: 'Las clases son muy dinámicas.',
      continuar: 'Sí, seguro',
      progreso: 'Sí, mucho',
      progreso_claridad: 4,
      contenido_nivel: 'Sí, está adecuado a mi nivel',
      materiales: 4,
      materiales_acceso: 'Sí, siempre',
      online_plataforma: 'Sí, funciona muy bien',
      prof_claridad: 5,
      prof_participacion: 4,
      prof_feedback: 5,
      informacion: 'Sí, siempre',
      soporte: 4,
      soporte_tiempo: 'El mismo día',
      contenido_extra: ['Conversación', 'Otro'],
      contenido_extra_otro: 'Música brasileña',
      necesita_mejorar: ['Hablar con más fluidez'],
    },
  };
}

describe('Surveys — encuesta de satisfacción', () => {
  let app: INestApplication;
  let adminCookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminCookie = await loginAsAdmin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/surveys/config', () => {
    it('is public and returns the wizard steps', async () => {
      const resp = await request(app.getHttpServer())
        .get('/api/surveys/config')
        .expect(200);
      expect(Array.isArray(resp.body.steps)).toBe(true);
      expect(resp.body.steps.length).toBeGreaterThan(0);
      const ids = resp.body.steps.flatMap((s: any) => s.questions.map((q: any) => q.id));
      expect(ids).toContain('nps');
      expect(ids).toContain('prof_claridad');
      // v2 additions
      expect(ids).toContain('modalidad');
      expect(ids).toContain('continuar');
      expect(ids).toContain('progreso_claridad');
      expect(ids).toContain('soporte_tiempo');
      // v1 questions removed in v2
      expect(ids).not.toContain('prof_paciencia');
      expect(ids).not.toContain('online_calidad');
      // teacher is a fixed list now, not free text
      const curso = resp.body.steps
        .flatMap((s: any) => s.questions)
        .find((q: any) => q.id === 'curso');
      const profesor = curso.selects.find((sel: any) => sel.id === 'profesor');
      expect(profesor.required).toBe(true);
      expect(profesor.options).toContain('Prefiero no decir');
    });
  });

  describe('POST /api/surveys', () => {
    it('rejects a submission without nps/csat', async () => {
      await request(app.getHttpServer())
        .post('/api/surveys')
        .send({ answers: {} })
        .expect(400);
    });

    it('rejects nps out of range', async () => {
      const body = validPayload();
      body.nps = 11;
      await request(app.getHttpServer()).post('/api/surveys').send(body).expect(400);
    });

    it('rejects unknown answer keys (no field injection into answers)', async () => {
      const body = validPayload();
      (body.answers as any).hacked_field = 'x';
      const resp = await request(app.getHttpServer())
        .post('/api/surveys')
        .send(body)
        .expect(400);
      expect(JSON.stringify(resp.body)).toContain('hacked_field');
    });

    it('rejects answers outside the option whitelist', async () => {
      const body = validPayload();
      (body.answers as any).progreso = 'opción inventada';
      await request(app.getHttpServer()).post('/api/surveys').send(body).expect(400);
    });

    it('rejects when a required question is missing', async () => {
      const body = validPayload();
      delete (body.answers as any).prof_claridad;
      const resp = await request(app.getHttpServer())
        .post('/api/surveys')
        .send(body)
        .expect(400);
      expect(JSON.stringify(resp.body)).toContain('prof_claridad');
    });

    it('rejects v1 question ids that no longer exist', async () => {
      const body = validPayload();
      (body.answers as any).prof_paciencia = 5;
      const resp = await request(app.getHttpServer())
        .post('/api/surveys')
        .send(body)
        .expect(400);
      expect(JSON.stringify(resp.body)).toContain('prof_paciencia');
    });

    it('rejects a modalidad outside the fixed list', async () => {
      const body = validPayload();
      body.modalidad = 'Presencial';
      await request(app.getHttpServer()).post('/api/surveys').send(body).expect(400);
    });

    it('accepts the scale5 opt-out ("No he necesitado ayuda") as text', async () => {
      const body = validPayload();
      (body.answers as any).soporte = 'No he necesitado ayuda';
      await request(app.getHttpServer()).post('/api/surveys').send(body).expect(201);

      const stats = await request(app.getHttpServer())
        .get('/api/surveys/stats')
        .set('Cookie', adminCookie)
        .expect(200);
      // The opt-out is stored but never enters the average.
      const soporte = stats.body.averages.find((a: any) => a.questionId === 'soporte');
      expect(soporte.count).toBe(0);
    });

    it('rejects any other string on a scale5 question', async () => {
      const body = validPayload();
      (body.answers as any).soporte = 'Excelente';
      await request(app.getHttpServer()).post('/api/surveys').send(body).expect(400);
    });

    it('accepts a full valid submission', async () => {
      const resp = await request(app.getHttpServer())
        .post('/api/surveys')
        .send(validPayload())
        .expect(201);
      expect(resp.body).toEqual({ success: true });
    });

    it('honeypot: accepts but silently drops the submission', async () => {
      const before = await request(app.getHttpServer())
        .get('/api/surveys')
        .set('Cookie', adminCookie)
        .expect(200);

      const body = validPayload();
      (body as any).website = 'http://spam.example';
      await request(app.getHttpServer()).post('/api/surveys').send(body).expect(201);

      const after = await request(app.getHttpServer())
        .get('/api/surveys')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(after.body.count).toBe(before.body.count);
    });
  });

  describe('admin endpoints', () => {
    it('GET /api/surveys requires auth', async () => {
      await request(app.getHttpServer()).get('/api/surveys').expect(401);
    });

    it('GET /api/surveys/stats requires auth', async () => {
      await request(app.getHttpServer()).get('/api/surveys/stats').expect(401);
    });

    it('lists the stored response with its answers', async () => {
      const resp = await request(app.getHttpServer())
        .get('/api/surveys')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(resp.body.count).toBeGreaterThan(0);
      const entry = resp.body.entries[0];
      expect(entry.nps).toBe(9);
      expect(entry.profesorNorm).toBe('ana martinez');
      expect(entry.modalidad).toBe('Grupo regular');
      expect(entry.pais).toBe('Guatemala');
      expect(entry.answers.progreso_claridad).toBe(4);
      expect(entry.answers.contenido_extra).toEqual(['Conversación', 'Otro']);
    });

    it('aggregates stats (NPS, averages, professors, comments)', async () => {
      const resp = await request(app.getHttpServer())
        .get('/api/surveys/stats')
        .set('Cookie', adminCookie)
        .expect(200);
      const body = resp.body;
      expect(body.total).toBeGreaterThan(0);
      expect(body.nps.promoters).toBeGreaterThan(0);
      expect(body.csatAvg).toBeGreaterThan(0);

      const claridad = body.averages.find((a: any) => a.questionId === 'prof_claridad');
      expect(claridad.avg).toBe(5);

      // Ana has 2 responses so far (< MIN_PROFESSOR_N): the row shows the
      // count but withholds the numbers.
      const ana = body.professors.find((p: any) => p.profesorNorm === 'ana martinez');
      expect(ana).toBeDefined();
      expect(ana.count).toBe(2);
      expect(ana.insufficient).toBe(true);
      expect(ana.avgClaridad).toBeNull();
      expect(ana.nps).toBeNull();

      // intención de continuar (all submissions so far said "Sí, seguro")
      expect(body.continuar.respondieron).toBe(2);
      expect(body.continuar.pctPositivo).toBe(100);
      expect(body.continuar.enRiesgo).toBe(0);

      const comment = body.comments.find((c: any) => c.text.includes('dinámicas'));
      expect(comment).toBeDefined();
      expect(comment.question).toBe('Razón de la nota');
      expect(comment.testimonioOk).toBe(true);
    });

    it('reveals a teacher\'s averages once MIN_PROFESSOR_N responses exist', async () => {
      // Third response for Ana (2 already stored above) → threshold reached.
      const body = validPayload();
      (body.answers as any).prof_claridad = 3;
      (body.answers as any).prof_feedback = 3;
      await request(app.getHttpServer()).post('/api/surveys').send(body).expect(201);

      const resp = await request(app.getHttpServer())
        .get('/api/surveys/stats')
        .set('Cookie', adminCookie)
        .expect(200);
      const ana = resp.body.professors.find((p: any) => p.profesorNorm === 'ana martinez');
      expect(ana.count).toBe(3);
      expect(ana.insufficient).toBe(false);
      expect(ana.avgClaridad).toBe(4.3); // (5 + 5 + 3) / 3
      expect(ana.avgFeedback).toBe(4.3);
      expect(ana.nps).toBe(100);
    });

    it('treats "Prefiero no decir" / "Tengo más de un profesor/a" as unidentified', async () => {
      const before = await request(app.getHttpServer())
        .get('/api/surveys/stats')
        .set('Cookie', adminCookie)
        .expect(200);

      const body = validPayload();
      body.profesor = 'Prefiero no decir';
      await request(app.getHttpServer()).post('/api/surveys').send(body).expect(201);

      const after = await request(app.getHttpServer())
        .get('/api/surveys/stats')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(after.body.unidentified).toBe(before.body.unidentified + 1);
      expect(after.body.professors.some((p: any) => p.profesor === 'Prefiero no decir')).toBe(false);
    });

    it('counts "No sé mi nivel" and flags students at risk of leaving', async () => {
      const body = validPayload();
      body.nivel = 'No sé mi nivel';
      (body.answers as any).continuar = 'Probablemente no';
      (body.answers as any).continuar_motivo = 'Horarios más flexibles.';
      await request(app.getHttpServer()).post('/api/surveys').send(body).expect(201);

      const resp = await request(app.getHttpServer())
        .get('/api/surveys/stats')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(resp.body.nivelDesconocido).toBe(1);
      expect(resp.body.continuar.enRiesgo).toBe(1);
      expect(resp.body.distributions.continuar.dist['Probablemente no']).toBe(1);
      const motivo = resp.body.comments.find((c: any) => c.text.includes('flexibles'));
      expect(motivo.question).toBe('Qué le haría quedarse');
    });

    it('filters stats by modalidad', async () => {
      const body = validPayload();
      body.modalidad = 'Clases particulares';
      await request(app.getHttpServer()).post('/api/surveys').send(body).expect(201);

      const resp = await request(app.getHttpServer())
        .get('/api/surveys/stats?modalidad=Clases%20particulares')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(resp.body.total).toBe(1);
      expect(resp.body.filterOptions.modalidades).toContain('Clases particulares');
      expect(resp.body.filterOptions.modalidades).toContain('Grupo regular');
    });

    it('filters stats by nivel', async () => {
      const resp = await request(app.getHttpServer())
        .get('/api/surveys/stats?nivel=C2')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(resp.body.total).toBe(0);
    });

    it('flags possible duplicates from the same IP (never blocks)', async () => {
      // Second full submission from the same client IP (supertest uses
      // 127.0.0.1 for every request) — both must save and both get flagged.
      await request(app.getHttpServer())
        .post('/api/surveys')
        .send(validPayload())
        .expect(201);

      const stats = await request(app.getHttpServer())
        .get('/api/surveys/stats')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(stats.body.total).toBeGreaterThanOrEqual(2);
      expect(stats.body.possibleDuplicates).toBeGreaterThanOrEqual(2);

      const list = await request(app.getHttpServer())
        .get('/api/surveys')
        .set('Cookie', adminCookie)
        .expect(200);
      const flagged = list.body.entries.filter((e: any) => e.possibleDuplicate);
      expect(flagged.length).toBeGreaterThanOrEqual(2);
      // The raw hash never leaves the API — only the derived flag.
      expect(list.body.entries[0]).not.toHaveProperty('ipHash');
    });

    it('stores canal "directo" when the link has no ?src= and makes it filterable', async () => {
      const body = validPayload();
      delete (body as any).canal;
      await request(app.getHttpServer()).post('/api/surveys').send(body).expect(201);

      const direct = await request(app.getHttpServer())
        .get('/api/surveys/stats?canal=directo')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(direct.body.total).toBe(1);

      const all = await request(app.getHttpServer())
        .get('/api/surveys/stats')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(all.body.filterOptions.canales).toContain('directo');
      expect(all.body.canales.directo).toBe(1);
    });
  });

  describe('GET /api/surveys/export.csv', () => {
    it('requires auth', async () => {
      await request(app.getHttpServer()).get('/api/surveys/export.csv').expect(401);
    });

    it('downloads the responses as ;-separated CSV with one column per question', async () => {
      const resp = await request(app.getHttpServer())
        .get('/api/surveys/export.csv')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(resp.headers['content-type']).toContain('text/csv');
      expect(resp.headers['content-disposition']).toContain('attachment');

      const lines = resp.text.replace(/^﻿/, '').split('\r\n');
      const header = lines[0].split(';');
      expect(header.slice(0, 8)).toEqual([
        'fecha', 'canal', 'modalidad', 'pais', 'nivel', 'tiempo', 'nps', 'csat',
      ]);
      expect(header).toContain('prof_claridad');
      expect(header).toContain('nps_motivo');
      // No v1 answers stored in this run → no empty legacy columns.
      expect(header).not.toContain('lo_mejor');
      expect(resp.text).toContain('Grupo regular');
      // One data row per stored response.
      expect(lines.length - 1).toBeGreaterThanOrEqual(3);
      expect(resp.text).toContain('whatsapp');
      expect(resp.text).toContain('Ana Martínez');
      // Multi-select answers join with " | ".
      expect(resp.text).toContain('Conversación | Otro');
    });

    it('respects the same filters as stats', async () => {
      const resp = await request(app.getHttpServer())
        .get('/api/surveys/export.csv?nivel=C2')
        .set('Cookie', adminCookie)
        .expect(200);
      const lines = resp.text.replace(/^﻿/, '').split('\r\n');
      expect(lines.length).toBe(1); // solo el header
    });

    it('neutralises formula injection in student-controlled cells', async () => {
      const body = validPayload();
      (body.answers as any).nps_motivo = '=HYPERLINK("https://evil.example","clic")';
      body.profesor = '@SUM(A1:A9)';
      await request(app.getHttpServer()).post('/api/surveys').send(body).expect(201);

      const resp = await request(app.getHttpServer())
        .get('/api/surveys/export.csv')
        .set('Cookie', adminCookie)
        .expect(200);
      // The values survive, but prefixed with an apostrophe so Excel/Sheets
      // treat them as text — never as an executable formula right after a
      // separator or at a cell start.
      expect(resp.text).toContain("'=HYPERLINK");
      expect(resp.text).toContain("'@SUM(A1:A9)");
      expect(resp.text).not.toMatch(/;=HYPERLINK/);
      expect(resp.text).not.toMatch(/;@SUM/);
    });
  });

  describe('commentsLimit', () => {
    it('caps the stats comments feed by default and expands with commentsLimit=all', async () => {
      const capped = await request(app.getHttpServer())
        .get('/api/surveys/stats?commentsLimit=1')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(capped.body.comments.length).toBe(1);

      const all = await request(app.getHttpServer())
        .get('/api/surveys/stats?commentsLimit=all')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(all.body.comments.length).toBeGreaterThan(1);
    });
  });
});
