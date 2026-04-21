import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createTestApp, loginAsAdmin } from './helpers/app';

describe('Q10 routes — public/admin split (#1)', () => {
  let app: INestApplication;
  let adminCookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminCookie = await loginAsAdmin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('public routes are reachable without auth', () => {
    it('GET /api/q10/catalogs → 200', async () => {
      const resp = await request(app.getHttpServer())
        .get('/api/q10/catalogs')
        .expect(200);
      expect(resp.body).toHaveProperty('programas');
      expect(resp.body).toHaveProperty('periodos');
      expect(resp.body).toHaveProperty('sedes');
    });
  });

  describe('admin routes require a valid session cookie', () => {
    it.each([
      ['/api/q10/contacts'],
      ['/api/q10/students'],
      ['/api/q10/opportunities'],
      ['/api/q10/financial/orders'],
      ['/api/q10/tracking'],
      ['/api/q10/anything-not-routed/explicitly'],
    ])('GET %s without cookie → 401', async (path) => {
      await request(app.getHttpServer()).get(path).expect(401);
    });

    it('GET /api/q10/contacts with admin cookie → 200', async () => {
      await request(app.getHttpServer())
        .get('/api/q10/contacts')
        .set('Cookie', adminCookie)
        .expect(200);
    });

    it('catch-all forwards subpath via originalUrl (#4)', async () => {
      const resp = await request(app.getHttpServer())
        .get('/api/q10/programas')
        .set('Cookie', adminCookie)
        .expect(200);
      expect(Array.isArray(resp.body)).toBe(true);
    });
  });
});
