import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { CreateLeadDto } from '../leads/dto/create-lead.dto';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const emailUser = this.configService.get<string>('EMAIL_USER');
    const emailPass = this.configService.get<string>('EMAIL_PASS');

    if (!emailUser || !emailPass) {
      this.logger.warn(
        '⚠️  Credenciais de email não configuradas. Emails serão apenas logados no console.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });

    this.logger.log('✅ Email service configured successfully');
  }

  async sendLeadNotification(lead: CreateLeadDto): Promise<boolean> {
    const courseNames = {
      business: 'Portugués para Negocios',
      travel: 'Portugués para Viajes',
      exam: 'Preparación para Exámenes',
      general: 'Curso General',
    };

    const countryNames = {
      cr: 'Costa Rica 🇨🇷',
      pa: 'Panamá 🇵🇦',
      sv: 'El Salvador 🇸🇻',
      hn: 'Honduras 🇭🇳',
      ni: 'Nicaragua 🇳🇮',
      gt: 'Guatemala 🇬🇹',
      bz: 'Belize 🇧🇿',
    };

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #0EA5E9, #0369A1); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .info-box { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #0EA5E9; }
    .label { font-weight: bold; color: #0369A1; }
    .value { margin-left: 10px; }
    .footer { text-align: center; padding: 20px; color: #6B7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎓 Novo Lead - GENIUS Academia</h1>
    </div>
    <div class="content">
      <h2>Informações do Lead:</h2>

      <div class="info-box">
        <p><span class="label">👤 Nome:</span><span class="value">${lead.name}</span></p>
        <p><span class="label">📧 Email:</span><span class="value">${lead.email}</span></p>
        <p><span class="label">📱 Telefone:</span><span class="value">${lead.phone}</span></p>
      </div>

      <div class="info-box">
        <p><span class="label">📚 Curso de Interesse:</span><span class="value">${courseNames[lead.course]}</span></p>
        <p><span class="label">🌎 País:</span><span class="value">${countryNames[lead.country]}</span></p>
      </div>

      <div class="info-box">
        <p><span class="label">⏰ Data/Hora:</span><span class="value">${new Date().toLocaleString('es-ES', { timeZone: 'America/Costa_Rica' })}</span></p>
      </div>
    </div>
    <div class="footer">
      <p>GENIUS Academia de Lenguas</p>
      <p>Este email foi gerado automaticamente pelo sistema.</p>
    </div>
  </div>
</body>
</html>
    `;

    const mailOptions = {
      from: this.configService.get<string>('EMAIL_USER'),
      to: 'contato@geniusacademia.com',
      subject: `🎓 Novo Lead: ${lead.name} - ${countryNames[lead.country]}`,
      html: emailHtml,
      text: `
Novo Lead Recebido!

Nome: ${lead.name}
Email: ${lead.email}
Telefone: ${lead.phone}
Curso: ${courseNames[lead.course]}
País: ${countryNames[lead.country]}
Data/Hora: ${new Date().toLocaleString('es-ES', { timeZone: 'America/Costa_Rica' })}
      `,
    };

    try {
      if (this.transporter) {
        await this.transporter.sendMail(mailOptions);
        this.logger.log(`✅ Email enviado para contato@geniusacademia.com`);
        return true;
      } else {
        // Modo de desenvolvimento - apenas log
        this.logger.log('📧 Email (DEV MODE):');
        this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        this.logger.log(`Para: contato@geniusacademia.com`);
        this.logger.log(`Assunto: ${mailOptions.subject}`);
        this.logger.log(`Nome: ${lead.name}`);
        this.logger.log(`Email: ${lead.email}`);
        this.logger.log(`Telefone: ${lead.phone}`);
        this.logger.log(`Curso: ${courseNames[lead.course]}`);
        this.logger.log(`País: ${countryNames[lead.country]}`);
        this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return true;
      }
    } catch (error) {
      this.logger.error(`❌ Erro ao enviar email: ${error.message}`);
      // Não lança erro para não quebrar a aplicação
      // Em produção, você pode querer implementar retry logic
      return false;
    }
  }
}
