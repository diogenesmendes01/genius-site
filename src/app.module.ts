import { Module } from '@nestjs/common';
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
import { Q10Module } from './q10/q10.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // 100 requests per minute per IP
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // SQLite for users. File lives at DATABASE_PATH (mount a persistent
    // volume at that path in production, otherwise users vanish on restart).
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'better-sqlite3',
        database: cfg.get<string>('DATABASE_PATH') ?? './data/genius.sqlite',
        entities: [User],
        synchronize: true,
      }),
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
