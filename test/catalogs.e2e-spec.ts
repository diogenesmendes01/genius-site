import { INestApplication } from '@nestjs/common';
import request = require('supertest');
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
});
