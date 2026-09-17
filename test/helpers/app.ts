import { ValidationPipe, INestApplication } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser = require('cookie-parser');
import { AppModule } from '../../src/app.module';
import { httpSeo } from '../../src/seo/http-seo.middleware';

export async function createTestApp(): Promise<INestApplication> {
  // ServeStatic chooses its loader during compile(), before createNestApplication.
  // Supply the adapter now so HTTP tests exercise real static routes as production does.
  const adapter = new ExpressAdapter();
  const adapterHost = new HttpAdapterHost();
  adapterHost.httpAdapter = adapter;
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).overrideProvider(HttpAdapterHost).useValue(adapterHost).compile();

  const app = moduleRef.createNestApplication(adapter);
  app.use(httpSeo);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.setGlobalPrefix('api');
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
