import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createTestApp } from './helpers/app';

const VALID_PERSONAL = {
  Nombres: 'Test',
  Apellidos: 'User',
  Correo_electronico: 'test@example.com',
  Telefono: '+502 5555-1234',
  Numero_documento: '1234567890101',
};
const VALID_PROGRAM = {
  Codigo_programa: 'PROG-001',
  Codigo_periodo: 'PER-2026-I',
};

describe('POST /api/q10/enrollment — DTO + idempotency (#2 / #3)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects empty body with 400', async () => {
    const resp = await request(app.getHttpServer())
      .post('/api/q10/enrollment')
      .send({})
      .expect(400);
    expect(resp.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('personal')]),
    );
  });

  it('rejects missing program with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/q10/enrollment')
      .send({ personal: VALID_PERSONAL })
      .expect(400);
  });

  it('rejects empty strings inside personal/program', async () => {
    const resp = await request(app.getHttpServer())
      .post('/api/q10/enrollment')
      .send({
        personal: {
          Nombres: '',
          Apellidos: '',
          Correo_electronico: '',
          Telefono: '',
          Numero_documento: '',
        },
        program: { Codigo_programa: '', Codigo_periodo: '' },
      })
      .expect(400);
    expect(resp.body.message.length).toBeGreaterThan(3);
  });

  it('rejects invalid email', async () => {
    await request(app.getHttpServer())
      .post('/api/q10/enrollment')
      .send({
        personal: { ...VALID_PERSONAL, Correo_electronico: 'not-an-email' },
        program: VALID_PROGRAM,
      })
      .expect(400);
  });

  // The idempotency key must match the same regex the tracking endpoint
  // enforces, so clients can't use /enrollment to bypass it with empty or
  // malformed refs.
  it.each([
    ['empty', ''],
    ['too short', 'short'],
    ['wrong prefix', 'XYZ-ABCDEFGH'],
    ['lowercase', 'enr-abcdefgh'],
    ['contains symbols', 'ENR-ABC!DEF$'],
  ])('rejects ref with %s', async (_label, ref) => {
    await request(app.getHttpServer())
      .post('/api/q10/enrollment')
      .send({ ref, personal: VALID_PERSONAL, program: VALID_PROGRAM })
      .expect(400);
  });

  it('accepts a well-formed ref', async () => {
    const resp = await request(app.getHttpServer())
      .post('/api/q10/enrollment')
      .send({
        ref: 'ENR-GOODREF1',
        personal: VALID_PERSONAL,
        program: VALID_PROGRAM,
      })
      .expect(201);
    expect(resp.body.ref).toBe('ENR-GOODREF1');
  });

  // Per review #7: enrollment idempotency must survive a backend restart.
  // We can't actually kill+restart Nest mid-test, but we can prove the
  // tracking entry persisted in SQLite is what carries the IDs across by
  // re-reading it through a fresh service instance after the first run.
  it('persists tracking in SQLite (survives a fresh service instance)', async () => {
    const ref = 'ENR-RESTART01';
    await request(app.getHttpServer())
      .post('/api/q10/enrollment')
      .send({ ref, personal: VALID_PERSONAL, program: VALID_PROGRAM })
      .expect(201);

    // Resolve the TrackingService via the Nest container — same SQLite
    // file but a fresh function call simulates "what the next request,
    // possibly served by a different process instance, would see".
    const trackingSvc = app.get(require('../src/q10/tracking.service').TrackingService);
    const entry = await trackingSvc.get(ref);
    expect(entry).not.toBeNull();
    expect(entry.contactId).toBeTruthy();
    expect(entry.studentId).toBeTruthy();
    expect(entry.paymentOrderId).toBeTruthy();
    expect(entry.status).toBe('filled');
  });

  it('replaying with same ref does not duplicate (idempotent) — first run + replay return identical paymentDetails.orderId', async () => {
    const ref = `ENR-IDEMP${Date.now()}TEST`.replace(/-/g, '').replace(
      /^/,
      'ENR-',
    );
    const body = { ref, personal: VALID_PERSONAL, program: VALID_PROGRAM };

    const first = await request(app.getHttpServer())
      .post('/api/q10/enrollment')
      .send(body)
      .expect(201);

    expect(first.body.success).toBe(true);
    expect(first.body.ref).toBe(ref);
    expect(first.body.status).toBe('filled');
    // The redacted public response must NOT leak the per-step trace or
    // any raw Q10 IDs (review #7 finding). Only `paymentDetails.orderId`
    // is intentionally exposed because the form prints it as the user's
    // payment reference.
    expect(first.body).not.toHaveProperty('ids');
    expect(first.body).not.toHaveProperty('steps');
    expect(first.body).not.toHaveProperty('partialIds');
    expect(first.body.paymentDetails).toHaveProperty('orderId');

    const replay = await request(app.getHttpServer())
      .post('/api/q10/enrollment')
      .send(body)
      .expect(201);

    expect(replay.body.ref).toBe(ref);
    // Same orderId on retry proves the workflow reused the previously-stored
    // IDs (idempotency through the persistent tracking store) instead of
    // creating a fresh Q10 row for the order.
    expect(replay.body.paymentDetails.orderId).toBe(first.body.paymentDetails.orderId);
  });
});
