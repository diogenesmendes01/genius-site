import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { User } from './auth/user.entity';
import { EmailModule } from './email/email.module';
import { HealthController } from './health/health.controller';
import { LeadsModule } from './leads/leads.module';
import { TrackingEntryEntity } from './q10/tracking-entry.entity';
import { Q10Module } from './q10/q10.module';

const bootstrapLogger = new Logger('AppModule');

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // 100 requests per minute per IP
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // SQLite for users + enrollment tracking. File lives at DATABASE_PATH —
    // mount a persistent volume there in production, otherwise the entire
    // store (admin user, in-flight enrollment IDs) vanishes on restart and
    // breaks idempotency for retries (review feedback).
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const isProd = cfg.get<string>('NODE_ENV') === 'production';
        // We keep `synchronize: true` for now — first deploy creates tables,
        // and the schema is small. Migrations are tracked as a v2 follow-up;
        // when we add them, flip this to `!isProd` and drop a migrations dir.
        if (isProd) {
          bootstrapLogger.warn(
            'TypeORM synchronize=true in production: keeps schema in sync ' +
            'with entities, but a destructive entity rename would drop data. ' +
            'Plan to switch to migrations before non-additive schema changes.',
          );
        }
        return {
          type: 'better-sqlite3',
          database: cfg.get<string>('DATABASE_PATH') ?? './data/genius.sqlite',
          entities: [User, TrackingEntryEntity],
          synchronize: true,
        };
      },
    }),

    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/',
      exclude: ['/api/(.*)'],
    }),

    AuthModule,
    Q10Module,
    LeadsModule,
    EmailModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
