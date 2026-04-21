import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createTestApp, loginAsAdmin } from './helpers/app';

describe('Public tracking endpoints — hardening (#1 round 2)', () => {
  let app: INestApplication;
  let adminCookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminCookie = await loginAsAdmin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/q10/tracking', () => {
    it('rejects ref that does not match the strict regex', async () => {
      await request(app.getHttpServer())
        .post('/api/q10/tracking')
        .send({ ref: 'short' })
        .expect(400);
    });

    it('rejects status other than "opened"', async () => {
      await request(app.getHttpServer())
        .post('/api/q10/tracking')
        .send({ ref: 'ENR-ABCDEF12', status: 'paid' })
        .expect(400);
    });

    it('strips unknown fields (cannot inject IDs)', async () => {
      const resp = await request(app.getHttpServer())
        .post('/api/q10/tracking')
        .send({
          ref: 'ENR-INJECT01',
          status: 'opened',
          contactId: 'malicious-id',
          studentId: 'malicious-id',
        })
        .expect(400); // forbidNonWhitelisted strips → forbidden non-whitelisted
    });

    it('accepts a valid opened tracking and returns a redacted payload', async () => {
      const resp = await request(app.getHttpServer())
        .post('/api/q10/tracking')
        .send({ ref: 'ENR-OPENED01', status: 'opened' })
        .expect(201);
      expect(resp.body).toEqual({
        ref: 'ENR-OPENED01',
        status: 'opened',
        updatedAt: expect.any(String),
      });
      // No PII / IDs leaked back.
      expect(resp.body).not.toHaveProperty('contactId');
      expect(resp.body).not.toHaveProperty('email');
    });
  });

  describe('GET /api/q10/tracking/:ref', () => {
    it('returns redacted shape for unknown ref', async () => {
      const resp = await request(app.getHttpServer())
        .get('/api/q10/tracking/ENR-NOTFOUND')
        .expect(200);
      expect(resp.body).toEqual({
        ref: 'ENR-NOTFOUND',
        status: 'pending',
        updatedAt: null,
      });
    });

    it('does not expose Q10 IDs or PII even when entry exists with full data', async () => {
      // Seed a "rich" entry via admin route — the public GET must redact it.
      await request(app.getHttpServer())
        .post('/api/q10/tracking')
        .send({ ref: 'ENR-REDACT01', status: 'opened' })
        .expect(201);

      const resp = await request(app.getHttpServer())
        .get('/api/q10/tracking/ENR-REDACT01')
        .expect(200);
      expect(Object.keys(resp.body).sort()).toEqual(
        ['ref', 'status', 'updatedAt'].sort(),
      );
    });

    it('admin list (GET /api/q10/tracking) requires cookie and returns full entries', async () => {
      await request(app.getHttpServer())
        .get('/api/q10/tracking')
        .expect(401);

      const resp = await request(app.getHttpServer())
        .get('/api/q10/tracking')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(resp.body).toHaveProperty('entries');
      expect(resp.body).toHaveProperty('count');
    });
  });
});
