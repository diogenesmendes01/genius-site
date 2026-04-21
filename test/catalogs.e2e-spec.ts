import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser = require('cookie-parser');
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { Q10ClientService } from '../src/q10/q10-client.service';
import { createTestApp } from './helpers/app';

describe('GET /api/q10/catalogs', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns all five catalogs as arrays', async () => {
    const resp = await request(app.getHttpServer())
      .get('/api/q10/catalogs')
      .expect(200);

    const expectedKeys = [
      'programas',
      'periodos',
      'sedes',
      'mediospublicitarios',
      'medioscontacto',
    ];
    for (const key of expectedKeys) {
      expect(resp.body).toHaveProperty(key);
      expect(Array.isArray(resp.body[key])).toBe(true);
    }

    // And nothing extra beyond those five keys.
    expect(Object.keys(resp.body).sort()).toEqual(expectedKeys.sort());
  });

  it('mediospublicitarios items carry the catalog shape', async () => {
    const resp = await request(app.getHttpServer())
      .get('/api/q10/catalogs')
      .expect(200);
    expect(resp.body.mediospublicitarios.length).toBeGreaterThan(0);
    const first = resp.body.mediospublicitarios[0];
    expect(first).toHaveProperty('Codigo');
    expect(first).toHaveProperty('Nombre');
    expect(first).toHaveProperty('Estado');
  });

  it('medioscontacto items carry the catalog shape', async () => {
    const resp = await request(app.getHttpServer())
      .get('/api/q10/catalogs')
      .expect(200);
    expect(resp.body.medioscontacto.length).toBeGreaterThan(0);
    const first = resp.body.medioscontacto[0];
    expect(first).toHaveProperty('Codigo');
    expect(first).toHaveProperty('Nombre');
    expect(first).toHaveProperty('Estado');
  });

  /**
   * On a Q10 plan that does not expose the CRM catalogs, the endpoint must
   * still serve the matrícula form's required catalogs (programas/periodos/
   * sedes). We stub Q10ClientService so just the two optional paths reject.
   */
  it('returns [] for optional catalogs when Q10 rejects them (form stays usable)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Q10ClientService)
      .useValue({
        get: jest.fn(async (path: string) => {
          if (
            path.includes('mediospublicitarios') ||
            path.includes('medioscontacto')
          ) {
            const err: any = new Error('Resource not found');
            err.status = 404;
            throw err;
          }
          // Return a plausible payload for the required catalogs.
          if (path.includes('programas')) return [{ Codigo: 'PROG-X' }];
          if (path.includes('periodos')) return [{ Codigo: 'PER-X' }];
          if (path.includes('sedes')) return [{ Codigo: 'SEDE-X' }];
          return [];
        }),
        post: jest.fn(),
        put: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
        raw: jest.fn(),
        clearCache: jest.fn(),
      })
      .compile();

    const localApp = moduleRef.createNestApplication();
    localApp.use(cookieParser());
    localApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    localApp.setGlobalPrefix('api');
    await localApp.init();

    try {
      const resp = await request(localApp.getHttpServer())
        .get('/api/q10/catalogs')
        .expect(200);
      expect(resp.body.programas).toEqual([{ Codigo: 'PROG-X' }]);
      expect(resp.body.periodos).toEqual([{ Codigo: 'PER-X' }]);
      expect(resp.body.sedes).toEqual([{ Codigo: 'SEDE-X' }]);
      expect(resp.body.mediospublicitarios).toEqual([]);
      expect(resp.body.medioscontacto).toEqual([]);
    } finally {
      await localApp.close();
    }
  });
});
