import { Controller, Post, Body, Logger } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';

@Controller('leads')
export class LeadsController {
  private readonly logger = new Logger(LeadsController.name);

  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  async create(@Body() createLeadDto: CreateLeadDto) {
    this.logger.log(`📬 POST /api/leads - ${createLeadDto.name}`);
    return this.leadsService.create(createLeadDto);
  }
}
