import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser = require('cookie-parser');
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { Q10ClientService } from '../src/q10/q10-client.service';
import { loginAsAdmin } from './helpers/app';

describe('GET /api/dashboard/overview — partial state (#5 round 2)', () => {
  let app: any;
  let cookie: string;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns partial:true and per-source errors when Q10 fetches fail', async () => {
    // Build a custom test app where Q10ClientService.get always rejects so
    // every dashboard source ends up in the errors map.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Q10ClientService)
      .useValue({
        get: jest.fn().mockRejectedValue(new Error('Q10 unreachable')),
        post: jest.fn(),
        put: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
        raw: jest.fn(),
        clearCache: jest.fn(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    await app.init();

    cookie = await loginAsAdmin(app);

    const resp = await request(app.getHttpServer())
      .get('/api/dashboard/overview?range=7')
      .set('Cookie', cookie)
      .expect(200);

    expect(resp.body.partial).toBe(true);
    expect(resp.body.errors).toMatchObject({
      // After the live-diagnostic fix, DashboardService only calls endpoints
      // confirmed to work on the "pagos regulares" plan: /periodos,
      // /contactos, /oportunidades, /pagos. /negocios and
      // /estadocuentaestudiantes are dropped (400 in every param combo),
      // and /estudiantes + /pagosPendientes only fire after /periodos
      // returns at least one active period — so with /periodos rejecting
      // here, they don't generate their own error entries.
      periods: expect.any(String),
      contacts: expect.any(String),
      opportunities: expect.any(String),
      payments: expect.any(String),
    });
    // KPIs still come back (zeros), so the frontend has something to render.
    expect(resp.body.kpis.activeStudents).toBe(0);
    // When periods failed, students list is degraded — UI surfaces that.
    expect(resp.body.degraded).toHaveProperty('students');
  });

  it('returns partial:false when all sources succeed', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    await app.init();

    cookie = await loginAsAdmin(app);

    const resp = await request(app.getHttpServer())
      .get('/api/dashboard/overview?range=30')
      .set('Cookie', cookie)
      .expect(200);

    expect(resp.body.partial).toBe(false);
    expect(resp.body.errors).toEqual({});
    // overduePending is degraded by design on this Q10 plan — /pagosPendientes
    // does not expose Fecha_vencimiento. Keep this assertion so a future
    // schema change that re-enables the field gets caught.
    expect(resp.body.degraded.overduePending).toBeTruthy();
    // Conversion rate degradation is data-driven (depends on opps vs students
    // ratio). With the small mock dataset the CRM is "underused", so the
    // backend marks conversionRate as degraded → null.
    expect(resp.body.kpis.conversionRate).toBeNull();
    expect(resp.body.degraded.conversionRate).toBeTruthy();
  });
});
