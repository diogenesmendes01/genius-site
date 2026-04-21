import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser = require('cookie-parser');
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { Q10ClientService } from '../src/q10/q10-client.service';
import {
  estadocuentaestudiantes,
  estudiantes,
  matriculas,
  negocios,
  oportunidades,
  ordenesDePago,
  pagos,
  pagosPendientes,
} from '../src/q10/mock/mock-data';
import { loginAsAdmin } from './helpers/app';

/**
 * Build a Q10 client double whose `.get` resolves mock data for most
 * endpoints but rejects for the paths listed in `rejectPaths`. Used to
 * simulate Q10 subscription plans that don't expose `/pagos` or
 * `/pagospendientes` (the production plan only exposes
 * `/estadocuentaestudiantes` — same limitation hit by the sibling Q10
 * WhatsApp Chrome extension).
 */
function buildQ10ClientStub(rejectPaths: string[]) {
  const shouldReject = (path: string) =>
    rejectPaths.some((r) => path.toLowerCase().includes(r.toLowerCase()));

  const datasetFor = (path: string): unknown[] => {
    const p = path.toLowerCase();
    // /estadocuentaestudiantes must be matched BEFORE /estudiantes since
    // the former is a superstring of the latter.
    if (p.includes('estadocuentaestudiantes')) return estadocuentaestudiantes;
    if (p.includes('estudiantes')) return estudiantes;
    if (p.includes('oportunidades')) return oportunidades;
    if (p.includes('negocios')) return negocios;
    if (p.includes('matricula')) return matriculas;
    if (p.includes('ordenespago') || p.includes('ordenesdepago')) return ordenesDePago;
    // /pagospendientes must be matched BEFORE /pagos (superstring rule).
    if (p.includes('pagospendientes')) return pagosPendientes;
    if (p.includes('pagos')) return pagos;
    return [];
  };

  return {
    get: jest.fn((path: string) => {
      if (shouldReject(path)) {
        return Promise.reject(new Error(`Q10 ${path} unavailable on this plan`));
      }
      return Promise.resolve(datasetFor(path));
    }),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    raw: jest.fn(),
    clearCache: jest.fn(),
  };
}

async function bootApp(clientOverride?: unknown) {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (clientOverride !== undefined) {
    builder.overrideProvider(Q10ClientService).useValue(clientOverride);
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

describe('GET /api/dashboard/overview — partial state (#5 round 2)', () => {
  let app: any;
  let cookie: string;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('returns partial:true and per-source errors when Q10 fetches fail', async () => {
    // Build a custom test app where Q10ClientService.get always rejects so
    // every dashboard source ends up in the errors map.
    app = await bootApp({
      get: jest.fn().mockRejectedValue(new Error('Q10 unreachable')),
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      raw: jest.fn(),
      clearCache: jest.fn(),
    });
    cookie = await loginAsAdmin(app);

    const resp = await request(app.getHttpServer())
      .get('/api/dashboard/overview?range=7')
      .set('Cookie', cookie)
      .expect(200);

    expect(resp.body.partial).toBe(true);
    expect(resp.body.errors).toMatchObject({
      students: expect.any(String),
      opportunities: expect.any(String),
      orders: expect.any(String),
    });
    // KPIs still come back (zeros), so the frontend has something to render.
    expect(resp.body.kpis.activeStudents).toBe(0);
  });

  it('returns partial:false when all sources succeed', async () => {
    app = await bootApp();
    cookie = await loginAsAdmin(app);

    const resp = await request(app.getHttpServer())
      .get('/api/dashboard/overview?range=30')
      .set('Cookie', cookie)
      .expect(200);

    expect(resp.body.partial).toBe(false);
    expect(resp.body.errors).toEqual({});
    // `degraded` is always present in the response — empty when nothing
    // had to be derived from a fallback source.
    expect(resp.body.degraded).toEqual({});
  });

  it('falls back to /estadocuentaestudiantes when /pagos and /pagospendientes fail', async () => {
    // Simulates the production Q10 plan: /pagos and /pagospendientes are
    // NOT exposed, but /estadocuentaestudiantes is. This limitation was
    // discovered in the sibling Q10 WhatsApp Chrome extension project.
    app = await bootApp(buildQ10ClientStub(['/pagospendientes', '/pagos']));
    cookie = await loginAsAdmin(app);

    const resp = await request(app.getHttpServer())
      .get('/api/dashboard/overview?range=30')
      .set('Cookie', cookie)
      .expect(200);

    // Primary sources still report errors → partial remains true.
    expect(resp.body.partial).toBe(true);
    expect(resp.body.errors.payments).toEqual(expect.any(String));
    expect(resp.body.errors.pendingPayments).toEqual(expect.any(String));
    // estadocuentaestudiantes itself must NOT be in errors.
    expect(resp.body.errors.accountStatements).toBeUndefined();

    // Fallback KPIs derived from estadocuentaestudiantes sample data.
    const expectedSaldo = estadocuentaestudiantes.reduce(
      (acc, e) => acc + (Number(e.Saldo) || 0),
      0,
    );
    const expectedTotalPagado = estadocuentaestudiantes.reduce(
      (acc, e) => acc + (Number(e.Total_pagado) || 0),
      0,
    );
    expect(resp.body.kpis.outstandingDebt).toBe(expectedSaldo);
    expect(resp.body.kpis.revenueInRange).toBe(expectedTotalPagado);
    // overduePending has no fallback (no due-date field in estadoCuenta).
    expect(resp.body.kpis.overduePending).toBe(0);

    // Degraded notes are populated for the affected KPIs.
    expect(resp.body.degraded.revenueInRange).toMatch(/estadocuentaestudiantes/);
    expect(resp.body.degraded.outstandingDebt).toMatch(/estadocuentaestudiantes/);
    expect(resp.body.degraded.overduePending).toMatch(/due-date|Unavailable/i);
    expect(resp.body.degraded.revenueByDay).toMatch(/per-payment dates|Unavailable/i);

    // Non-financial KPIs are unaffected — students / opportunities / deals
    // still populate from their own endpoints.
    expect(resp.body.kpis.totalStudents).toBe(estudiantes.length);
    expect(resp.body.kpis.activeDeals).toBe(negocios.length);

    // revenueByDay chart is empty (no dated rows available).
    expect(resp.body.charts.revenueByDay).toEqual([]);
  });

  it('keeps existing behaviour when ALL financial sources fail', async () => {
    app = await bootApp(
      buildQ10ClientStub([
        '/pagospendientes',
        '/pagos',
        '/estadocuentaestudiantes',
      ]),
    );
    cookie = await loginAsAdmin(app);

    const resp = await request(app.getHttpServer())
      .get('/api/dashboard/overview?range=30')
      .set('Cookie', cookie)
      .expect(200);

    expect(resp.body.partial).toBe(true);
    expect(resp.body.errors.payments).toEqual(expect.any(String));
    expect(resp.body.errors.pendingPayments).toEqual(expect.any(String));
    expect(resp.body.errors.accountStatements).toEqual(expect.any(String));

    // Without any financial source there is nothing to fall back to.
    expect(resp.body.kpis.revenueInRange).toBe(0);
    expect(resp.body.kpis.outstandingDebt).toBe(0);
    expect(resp.body.kpis.overduePending).toBe(0);
    expect(resp.body.charts.revenueByDay).toEqual([]);

    // Since estadoCuenta was not available, revenueInRange/outstandingDebt
    // were NOT recomputed from it, so there is no degraded entry for them.
    expect(resp.body.degraded.revenueInRange).toBeUndefined();
    expect(resp.body.degraded.outstandingDebt).toBeUndefined();
  });

  it('uses estadoCuenta only for outstandingDebt when only /pagospendientes fails', async () => {
    app = await bootApp(buildQ10ClientStub(['/pagospendientes']));
    cookie = await loginAsAdmin(app);

    // Wide range so the fixed mock /pagos dates still fall inside the
    // window and feed the primary revenue path.
    const resp = await request(app.getHttpServer())
      .get('/api/dashboard/overview?range=3650')
      .set('Cookie', cookie)
      .expect(200);

    expect(resp.body.partial).toBe(true);
    expect(resp.body.errors.pendingPayments).toEqual(expect.any(String));
    expect(resp.body.errors.payments).toBeUndefined();
    expect(resp.body.errors.accountStatements).toBeUndefined();

    // Fallback kicks in for outstandingDebt only.
    const expectedSaldo = estadocuentaestudiantes.reduce(
      (acc, e) => acc + (Number(e.Saldo) || 0),
      0,
    );
    expect(resp.body.kpis.outstandingDebt).toBe(expectedSaldo);
    expect(resp.body.degraded.outstandingDebt).toMatch(/estadocuentaestudiantes/);

    // revenueInRange stays on the primary /pagos path (not fallback), so
    // no degraded entry for it and revenueByDay chart is still populated.
    expect(resp.body.degraded.revenueInRange).toBeUndefined();
    expect(resp.body.degraded.revenueByDay).toBeUndefined();
    const expectedRevenue = pagos.reduce((a, p) => a + (Number(p.Valor) || 0), 0);
    expect(resp.body.kpis.revenueInRange).toBe(expectedRevenue);
    expect(Array.isArray(resp.body.charts.revenueByDay)).toBe(true);
  });
});
