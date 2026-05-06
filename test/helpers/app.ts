import { RequestMethod, ValidationPipe, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser = require('cookie-parser');
import { AppModule } from '../../src/app.module';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // Mirror main.ts: survey HTML routes live outside /api so the URLs stay
  // short for WhatsApp. Keeping the test app aligned with prod prevents
  // route collisions between SurveyPagesController and PublicSurveyController.
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'pesquisa', method: RequestMethod.GET },
      { path: 'pesquisa/:token', method: RequestMethod.GET },
      { path: 'p/:token', method: RequestMethod.GET },
    ],
  });
  await app.init();
  return app;
}

/** POST /api/auth/login as the seeded admin and return the cookie header. */
export async function loginAsAdmin(app: INestApplication): Promise<string> {
  const request = require('supertest');
  const resp = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    })
    .expect(201);
  const setCookie = resp.headers['set-cookie'];
  if (!setCookie || setCookie.length === 0) {
    throw new Error('login did not set a cookie');
  }
  return setCookie[0].split(';')[0];
}
