import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createTestApp, loginAsAdmin } from './helpers/app';

/**
 * Smoke tests for the three sibling dashboard tabs that landed alongside
 * the multi-tab UI. Each endpoint should require authentication, return
 * 200 with the documented shape, and not throw on the mock dataset.
 */
describe('Dashboard tabs — academic / financial / commercial', () => {
  let app: INestApplication;
  let cookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    cookie = await loginAsAdmin(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['/api/dashboard/academic'],
    ['/api/dashboard/financial'],
    ['/api/dashboard/commercial'],
  ])('%s requires a session cookie', async (path) => {
    await request(app.getHttpServer()).get(path).expect(401);
  });

  it('GET /api/dashboard/academic returns composition + retention shape', async () => {
    const resp = await request(app.getHttpServer())
      .get('/api/dashboard/academic')
      .set('Cookie', cookie)
      .expect(200);

    expect(resp.body.summary).toEqual(
      expect.objectContaining({
        totalStudents: expect.any(Number),
        totalTeachers: expect.any(Number),
      }),
    );
    expect(resp.body.retention).toEqual(
      expect.objectContaining({
        previousTotal: expect.any(Number),
        currentTotal: expect.any(Number),
        retained: expect.any(Number),
        churned: expect.any(Number),
        newcomers: expect.any(Number),
      }),
    );
    expect(resp.body.distributions).toEqual(
      expect.objectContaining({
        byJornada: expect.any(Object),
        byNivel: expect.any(Object),
        byGender: expect.any(Object),
        byAge: expect.any(Object),
      }),
    );
    expect(Array.isArray(resp.body.teachers)).toBe(true);
  });

  it('GET /api/dashboard/financial returns MRR series + debt tables', async () => {
    const resp = await request(app.getHttpServer())
      .get('/api/dashboard/financial?months=6')
      .set('Cookie', cookie)
      .expect(200);

    expect(resp.body.summary).toEqual(
      expect.objectContaining({
        monthsBack: 6,
        totalRevenue: expect.any(Number),
        outstandingDebt: expect.any(Number),
        payingStudents: expect.any(Number),
      }),
    );
    expect(Array.isArray(resp.body.charts.revenueByMonth)).toBe(true);
    // 6 months requested → 6 buckets.
    expect(resp.body.charts.revenueByMonth).toHaveLength(6);
    expect(Array.isArray(resp.body.tables.topDebtors)).toBe(true);
    expect(Array.isArray(resp.body.tables.recentPayments)).toBe(true);
  });

  it('GET /api/dashboard/financial clamps the months parameter to a safe range', async () => {
    const resp = await request(app.getHttpServer())
      .get('/api/dashboard/financial?months=9999')
      .set('Cookie', cookie)
      .expect(200);
    // Controller enforces max 60 to keep the Q10 page-size within bounds.
    expect(resp.body.summary.monthsBack).toBe(60);
  });

  it('GET /api/dashboard/commercial returns funnel states + advisors', async () => {
    const resp = await request(app.getHttpServer())
      .get('/api/dashboard/commercial')
      .set('Cookie', cookie)
      .expect(200);

    expect(resp.body.summary).toEqual(
      expect.objectContaining({
        totalOpportunities: expect.any(Number),
        won: expect.any(Number),
        lost: expect.any(Number),
        inProgress: expect.any(Number),
      }),
    );
    expect(Array.isArray(resp.body.charts.leadsByMonth)).toBe(true);
    expect(resp.body.charts.leadsByMonth).toHaveLength(12);
    expect(Array.isArray(resp.body.tables.advisors)).toBe(true);
    expect(Array.isArray(resp.body.tables.topMunicipios)).toBe(true);
    expect(Array.isArray(resp.body.tables.recentOpps)).toBe(true);
  });
});
