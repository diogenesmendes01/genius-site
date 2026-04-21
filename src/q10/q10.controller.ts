import {
  All,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EnrollmentDto } from './dto/enrollment.dto';
import { UpsertTrackingDto } from './dto/tracking.dto';
import { EnrollmentService } from './enrollment.service';
import { Q10ClientService } from './q10-client.service';
import { TrackingService } from './tracking.service';

/**
 * Public routes the matrícula form needs: read-only catalog lookup,
 * creating tracking entries, running enrollment. Everything else that
 * touches the ERP lives on {@link Q10AdminController} behind the JWT guard.
 */
@Controller('q10')
export class Q10PublicController {
  constructor(
    private readonly q10: Q10ClientService,
    private readonly enrollmentSvc: EnrollmentService,
    private readonly tracking: TrackingService,
  ) {}

  @Get('catalogs')
  async catalogs() {
    const [programas, periodos, sedes] = await Promise.all([
      this.q10.get('/programas'),
      this.q10.get('/periodos'),
      this.q10.get('/sedes'),
    ]);
    return { programas, periodos, sedes };
  }

  @Post('enrollment')
  enroll(@Body() body: EnrollmentDto) {
    return this.enrollmentSvc.run(body);
  }

  @Post('tracking')
  upsertTracking(@Body() body: UpsertTrackingDto) {
    return this.tracking.upsert(body);
  }

  @Get('tracking/:ref')
  getTracking(@Param('ref') ref: string) {
    const entry = this.tracking.get(ref);
    if (entry) return entry;
    return {
      ref,
      status: 'pending' as const,
      message: 'Link generated but form not yet opened',
      createdAt: null,
      updatedAt: null,
    };
  }

  @Post('webhook/form-completed')
  webhook(@Body() payload: unknown) {
    console.log('[webhook] form-completed:', JSON.stringify(payload));
    return { received: true, timestamp: new Date().toISOString() };
  }
}

/**
 * Admin-only Q10 routes (CRUD on contacts/students/opportunities/financial
 * plus the generic catch-all proxy). All require a valid session cookie
 * because a logged-out caller must not be able to read PII or mutate ERP
 * records through our Api-Key.
 */
@Controller('q10')
@UseGuards(JwtAuthGuard)
export class Q10AdminController {
  constructor(
    private readonly q10: Q10ClientService,
    private readonly tracking: TrackingService,
  ) {}

  // ─────────── Tracking list (audit) ───────────
  @Get('tracking')
  listTracking() {
    const entries = this.tracking.list();
    return { count: entries.length, entries };
  }

  // ─────────── Contacts ───────────
  @Get('contacts')
  listContacts(@Query() q: Record<string, unknown>) {
    return this.q10.get('/contactos', q);
  }
  @Get('contacts/:id')
  getContact(@Param('id') id: string) {
    return this.q10.get(`/contactos/${id}`);
  }
  @Post('contacts')
  createContact(@Body() body: unknown) {
    return this.q10.post('/contactos', body);
  }
  @Put('contacts/:id')
  updateContact(@Param('id') id: string, @Body() body: unknown) {
    return this.q10.put(`/contactos/${id}`, body);
  }

  // ─────────── Students ───────────
  @Get('students')
  listStudents(@Query() q: Record<string, unknown>) {
    return this.q10.get('/estudiantes', q);
  }
  @Get('students/:id')
  getStudent(@Param('id') id: string) {
    return this.q10.get(`/estudiantes/${id}`);
  }
  @Post('students')
  createStudent(@Body() body: unknown) {
    return this.q10.post('/estudiantes', body);
  }
  @Put('students/:id')
  updateStudent(@Param('id') id: string, @Body() body: unknown) {
    return this.q10.put(`/estudiantes/${id}`, body);
  }

  // ─────────── Opportunities ───────────
  @Get('opportunities')
  listOpportunities(@Query() q: Record<string, unknown>) {
    return this.q10.get('/oportunidades', q);
  }
  @Get('opportunities/:id')
  getOpportunity(@Param('id') id: string) {
    return this.q10.get(`/oportunidades/${id}`);
  }
  @Post('opportunities')
  createOpportunity(@Body() body: unknown) {
    return this.q10.post('/oportunidades', body);
  }
  @Put('opportunities/:id')
  updateOpportunity(@Param('id') id: string, @Body() body: unknown) {
    return this.q10.put(`/oportunidades/${id}`, body);
  }

  // ─────────── Financial ───────────
  @Get('financial/orders')
  listOrders(@Query() q: Record<string, unknown>) {
    return this.q10.get('/ordenespago', q);
  }
  @Get('financial/orders/:id')
  getOrder(@Param('id') id: string) {
    return this.q10.get(`/ordenespago/${id}`);
  }
  @Post('financial/orders')
  createOrder(@Body() body: unknown) {
    return this.q10.post('/ordenespago', body);
  }
  @Get('financial/concepts')
  listConcepts() {
    return this.q10.get('/conceptosdepago');
  }

  /**
   * Generic Q10 proxy catch-all (admin only). Must be the last handler so
   * nothing above falls through. We derive the upstream path from
   * `req.originalUrl` to keep subpaths and query strings intact — the old
   * `req.params[0]` trick stopped working with path-to-regexp 8.
   */
  @All('*path')
  async proxy(
    @Req() req: Request,
    @Res() res: Response,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
  ) {
    // originalUrl → `/api/q10/<upstream>[?...]`. Strip prefix and any query.
    const upstream = req.originalUrl
      .replace(/^\/api\/q10/, '')
      .split('?')[0];
    if (!upstream || upstream === '/') {
      return res.status(400).json({ error: 'Missing Q10 path' });
    }
    const { status, data } = await this.q10.raw(req.method, upstream, query, body);
    res.status(status).json(data);
  }
}
