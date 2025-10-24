import { Injectable, Logger } from '@nestjs/common';
import { CreateLeadDto } from './dto/create-lead.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(private readonly emailService: EmailService) {}

  async create(createLeadDto: CreateLeadDto) {
    this.logger.log(`📝 Novo lead recebido: ${createLeadDto.name}`);

    // Enviar email
    const emailSent = await this.emailService.sendLeadNotification(
      createLeadDto,
    );

    // Aqui você poderia salvar no banco de dados
    // Ex: await this.leadsRepository.save(createLeadDto);

    return {
      success: true,
      message: 'Lead recebido com sucesso!',
      data: {
        name: createLeadDto.name,
        email: createLeadDto.email,
        emailSent,
      },
    };
  }
}
