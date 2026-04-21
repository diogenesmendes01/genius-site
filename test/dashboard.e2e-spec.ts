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
      // DashboardService no longer calls /ordenespago, /pagos, /pagospendientes
      // (they don't apply to this Q10 plan). The sources that DO run and fail
      // when the client rejects everything are /periodos, /contactos,
      // /oportunidades, /negocios, and /estadocuentaestudiantes.
      periods: expect.any(String),
      contacts: expect.any(String),
      opportunities: expect.any(String),
      deals: expect.any(String),
      estadoCuenta: expect.any(String),
    });
    // KPIs still come back (zeros), so the frontend has something to render.
    expect(resp.body.kpis.activeStudents).toBe(0);
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
  });
});
