import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createTestApp, loginAsAdmin } from './helpers/app';

/**
 * Regression guard for the admin dashboard: every route under
 * /api/dashboard/* must require a valid session cookie, including the
 * POST /refresh action which evicts the Q10 cache. Without this suite, a
 * controller-level `@UseGuards(JwtAuthGuard)` could be accidentally
 * dropped in a refactor and nothing would fail — see PR #11 review.
 */
describe('Dashboard routes — all require auth (#refresh-guard)', () => {
  let app: INestApplication;
  let adminCookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminCookie = await loginAsAdmin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('without cookie → 401', () => {
    it.each([
      ['GET',  '/api/dashboard/overview'],
      ['GET',  '/api/dashboard/academic'],
      ['GET',  '/api/dashboard/financial'],
      ['GET',  '/api/dashboard/commercial'],
      ['GET',  '/api/dashboard/turmas'],
      ['GET',  '/api/dashboard/currency-rates'],
      ['POST', '/api/dashboard/refresh'],
    ])('%s %s → 401', async (method, path) => {
      const req = request(app.getHttpServer());
      const call = method === 'POST' ? req.post(path) : req.get(path);
      await call.expect(401);
    });
  });

  describe('with admin cookie → 200', () => {
    it('POST /api/dashboard/refresh with admin cookie → 201', async () => {
      // NestJS defaults POST to 201 Created (no `@HttpCode(200)` on the
      // handler). The important assertion is "guard lets us through".
      const resp = await request(app.getHttpServer())
        .post('/api/dashboard/refresh')
        .set('Cookie', adminCookie)
        .expect(201);
      expect(resp.body).toEqual(
        expect.objectContaining({
          success: true,
          clearedAt: expect.any(String),
        }),
      );
    });

    it('GET /api/dashboard/currency-rates with admin cookie → 200', async () => {
      const resp = await request(app.getHttpServer())
        .get('/api/dashboard/currency-rates')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(resp.body).toEqual(
        expect.objectContaining({
          rates: expect.any(Object),
        }),
      );
    });
  });
});
