import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser = require('cookie-parser');
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { AppModule } from './app.module';

/**
 * Refuse to start in production with placeholder/missing security secrets.
 * Catches the classic deploy mistake of leaving `.env.example` defaults in
 * place (review #7 finding).
 */
function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const missing: string[] = [];
  const placeholder: string[] = [];

  const jwt = process.env.JWT_SECRET ?? '';
  if (!jwt) missing.push('JWT_SECRET');
  else if (jwt.length < 32 || jwt.startsWith('change-me')) placeholder.push('JWT_SECRET');

  const adminPass = process.env.ADMIN_PASSWORD ?? '';
  // ADMIN_PASSWORD is only consumed once (admin seed on first boot). After
  // that the operator can remove it; we therefore only flag the placeholder
  // value, not the absence.
  if (adminPass && adminPass.startsWith('change-me')) placeholder.push('ADMIN_PASSWORD');

  const origins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins.length === 0) missing.push('ALLOWED_ORIGINS');

  if (missing.length || placeholder.length) {
    const lines: string[] = [
      'Refusing to start in production: insecure environment configuration.',
    ];
    if (missing.length) lines.push(`  Missing: ${missing.join(', ')}`);
    if (placeholder.length) lines.push(`  Still set to placeholder values: ${placeholder.join(', ')}`);
    lines.push('  Set the variables above (see .env.example) and redeploy.');
    console.error(lines.join('\n'));
    process.exit(1);
  }
}

async function bootstrap() {
  assertProductionEnv();

  // Make sure the SQLite data directory exists before TypeORM tries to open it.
  const dbPath = process.env.DATABASE_PATH ?? './data/genius.sqlite';
  mkdirSync(dirname(dbPath), { recursive: true });

  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const isProd = process.env.NODE_ENV === 'production';

  app.enableCors({
    origin: (origin, callback) => {
      // Same-origin / server-to-server / curl: no Origin header → allow.
      if (!origin) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      // In dev with no allowlist set, accept any origin to keep the loop
      // tight. In production `assertProductionEnv()` guarantees `allowed`
      // is non-empty, so we never fall through to "allow everyone".
      if (!isProd && allowed.length === 0) return callback(null, true);
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
