import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser = require('cookie-parser');
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  // Make sure the SQLite data directory exists before TypeORM tries to open it.
  const dbPath = process.env.DATABASE_PATH ?? './data/genius.sqlite';
  mkdirSync(dirname(dbPath), { recursive: true });

  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  const allowed =
    (process.env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowed.length === 0) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api', { exclude: [] });

  const port = process.env.PORT || 3120;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);

  console.log(`🚀 Genius server running at http://${host}:${port}`);
  console.log(`📄 Site: /  |  📝 Matrícula: /matricula  |  📊 Dashboard: /dashboard`);
  console.log(`🔌 API: /api  |  Q10 mock: ${process.env.Q10_MOCK === 'true' ? 'ON' : 'OFF'}`);
}

bootstrap();
