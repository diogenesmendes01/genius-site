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
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Q10ClientService } from './q10-client.service';
import { EnrollmentService, EnrollmentRequest } from './enrollment.service';
import { TrackingService, TrackingStatus } from './tracking.service';

/**
 * Exposes /api/q10/* — the frontend form and the dashboard hit these paths.
 *
 * - Named routes map to friendly JSON shapes (catalogs, contacts, students, …)
 * - /enrollment runs the 5-step workflow
 * - /tracking/* drives the matricula form progress indicator
 * - Everything else falls through to a generic Q10 proxy (last handler)
 */
@Controller('q10')
export class Q10Controller {
  constructor(
    private readonly q10: Q10ClientService,
    private readonly enrollmentSvc: EnrollmentService,
    private readonly tracking: TrackingService,
  ) {}

  // ─────────── Catalogs (aggregated) ───────────
  @Get('catalogs')
  async catalogs() {
    const [programas, periodos, sedes] = await Promise.all([
      this.q10.get('/programas'),
      this.q10.get('/periodos'),
      this.q10.get('/sedes'),
    ]);
    return { programas, periodos, sedes };
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

  // ─────────── Enrollment ───────────
  @Post('enrollment')
  enroll(@Body() body: EnrollmentRequest) {
    return this.enrollmentSvc.run(body);
  }

  // ─────────── Tracking (in-memory) ───────────
  @Get('tracking')
  listTracking() {
    const entries = this.tracking.list();
    return { count: entries.length, entries };
  }

  @Get('tracking/:ref')
  getTracking(@Param('ref') ref: string) {
    const entry = this.tracking.get(ref);
    if (entry) return entry;
    return {
      ref,
      status: 'pending' as TrackingStatus,
      message: 'Link generated but form not yet opened',
      createdAt: null,
      updatedAt: null,
    };
  }

  @Post('tracking')
  upsertTracking(
    @Body()
    body: {
      ref: string;
      status?: TrackingStatus;
      asesor?: string;
      studentName?: string;
      email?: string;
    },
  ) {
    return this.tracking.upsert(body);
  }

  // ─────────── Webhook (no-op logger) ───────────
  @Post('webhook/form-completed')
  webhook(@Body() payload: unknown) {
    console.log('[webhook] form-completed:', JSON.stringify(payload));
    return { received: true, timestamp: new Date().toISOString() };
  }

  // ─────────── Generic Q10 proxy catch-all ───────────
  // Must be the last handler — matches anything not routed above so the
  // dashboard can reach arbitrary Q10 endpoints without us adding handlers.
  @All('*')
  async proxy(
    @Req() req: Request,
    @Res() res: Response,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
  ) {
    const path = '/' + (req.params[0] ?? '');
    const { status, data } = await this.q10.raw(req.method, path, query, body);
    res.status(status).json(data);
  }
}
