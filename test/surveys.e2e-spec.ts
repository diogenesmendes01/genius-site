import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createTestApp, loginAsAdmin } from './helpers/app';

/** A minimal valid submission: every required question answered. */
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
    answers: {
      online_acceso: 5,
      online_plataforma: 'Sí, funciona muy bien',
      online_calidad: 4,
      online_efectividad: 'Sí, totalmente',
      contenido_nivel: 'Sí, está adecuado a mi nivel',
      ayuda_comunicacion: 5,
      materiales: 4,
      contenido_extra: ['Conversación', 'Otro'],
      contenido_extra_otro: 'Música brasileña',
      progreso: 'Sí, mucho',
      necesita_mejorar: ['Hablar con más fluidez'],
      prof_claridad: 5,
      prof_paciencia: 5,
      prof_participacion: 4,
      prof_correccion: 5,
      prof_puntualidad: 'Excelente',
      prof_valoras: 'Su paciencia y energía.',
      comunicacion: 4,
      informacion: 'Sí, siempre',
      lo_mejor: 'Las clases son muy dinámicas.',
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
      expect(entry.answers.online_calidad).toBe(4);
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

      const ana = body.professors.find((p: any) => p.profesorNorm === 'ana martinez');
      expect(ana).toBeDefined();
      expect(ana.avgClaridad).toBe(5);

      const comment = body.comments.find((c: any) => c.text.includes('dinámicas'));
      expect(comment).toBeDefined();
      expect(comment.testimonioOk).toBe(true);
    });

    it('filters stats by nivel', async () => {
      const resp = await request(app.getHttpServer())
        .get('/api/surveys/stats?nivel=C2')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(resp.body.total).toBe(0);
    });
  });
});
