import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { join } from 'path';

const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

// HTML pages served outside the /api prefix. Routes here are listed in the
// global-prefix exclusion in main.ts. The page HTML is identical for all
// three routes — the client-side JS reads the token from the URL.
@Controller()
export class SurveyPagesController {
  @Get('pesquisa')
  intro(@Res() res: Response) {
    res.sendFile(join(PUBLIC_DIR, 'pesquisa', 'index.html'));
  }

  @Get('pesquisa/:token')
  withToken(@Res() res: Response) {
    res.sendFile(join(PUBLIC_DIR, 'pesquisa', 'index.html'));
  }

  // Short alias so the WhatsApp message stays compact.
  @Get('p/:token')
  short(@Param('token') token: string, @Res() res: Response) {
    res.redirect(302, `/pesquisa/${token}`);
  }
}
