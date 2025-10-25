import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { LeadsModule } from './leads/leads.module';
import { EmailModule } from './email/email.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    // Configuração de variáveis de ambiente
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Servir arquivos estáticos (frontend)
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/',
    }),

    // Módulos da aplicação
    LeadsModule,
    EmailModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
