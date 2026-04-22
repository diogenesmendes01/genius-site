import { HttpException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EnrollmentDto } from './dto/enrollment.dto';
import { Q10ClientService } from './q10-client.service';
import { TrackingService } from './tracking.service';

type StepResult = { step: number; name: string; status: 'ok' | 'reused'; id?: string };

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  /**
   * Per-`ref` in-flight promise map. Two concurrent POST /api/q10/enrollment
   * requests with the same `ref` would otherwise both see `tracking.get(ref)`
   * return null, race past the idempotency check and POST /contactos twice
   * to Q10 — a real TOCTOU pointed out in review #7.
   *
   * Limitation: this only protects within one Node process. On a
   * multi-instance deploy we would need either a SQLite `BEGIN IMMEDIATE`
   * transaction around the claim or a Redis/Postgres advisory lock. The
   * current Coolify deploy is single-container, so this is enough today,
   * and the limitation is documented inline so we don't forget when scaling.
   */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly q10: Q10ClientService,
    private readonly tracking: TrackingService,
  ) {}

  /**
   * Full 5-step enrollment workflow (contact → student → inscripción →
   * matrícula → orden de pago). Idempotent per `ref`: if a previous run
   * partially succeeded, the IDs it created are reused and only the
   * remaining steps execute, which avoids duplicating rows in the Q10 ERP.
   */
  async run(req: EnrollmentDto) {
    const ref = req.ref ?? `ENR-${randomUUID().slice(0, 8).toUpperCase()}`;

    // Serialize concurrent same-ref requests. The first caller starts the
    // workflow; subsequent callers await the same promise and receive the
    // same response (they won't trigger a second set of Q10 POSTs).
    const existing = this.inFlight.get(ref);
    if (existing) return existing as ReturnType<typeof this.runInternal>;

    const p = this.runInternal(ref, req).finally(() => this.inFlight.delete(ref));
    this.inFlight.set(ref, p);
    return p;
  }

  private async runInternal(ref: string, req: EnrollmentDto) {
    // Fast path: if a previous completed run already has an orderId,
    // return it without touching Q10 again. The public response shape
    // stays stable so retries from the form look identical to the first
    // submission.
    const prior = await this.tracking.get(ref);
    if (prior?.status === 'filled' && prior.paymentOrderId) {
      this.logger.log(`[enrollment:${ref}] returning cached result (status=filled)`);
      return {
        success: true as const,
        ref,
        status: 'filled' as const,
        message: 'Enrollment already completed',
        paymentDetails: {
          orderId: prior.paymentOrderId,
          amount: req.payment?.Valor ?? 0,
          concept: req.payment?.Concepto_pago ?? 'Matrícula',
          dueDate: req.payment?.Fecha_vencimiento ?? '',
        },
      };
    }

    const steps: StepResult[] = [];

    // Reuse IDs from a previous partial run so retries don't duplicate records.
    let contactId = prior?.contactId;
    let studentId = prior?.studentId;
    let enrollmentId = prior?.enrollmentId;
    let matriculaId = prior?.matriculaId;
    let paymentOrderId = prior?.paymentOrderId;

    try {
      // ── Step 1: Contact ──
      if (contactId) {
        steps.push({ step: 1, name: 'contact', status: 'reused', id: contactId });
      } else {
        const contact: any = await this.q10.post('/contactos', {
          Nombres: req.personal.Nombres,
          Apellidos: req.personal.Apellidos,
          Correo_electronico: req.personal.Correo_electronico,
          Telefono: req.personal.Telefono,
          Numero_documento: req.personal.Numero_documento,
          Tipo_documento: req.personal.Tipo_documento ?? 'DPI',
          Nacionalidad: req.personal.Nacionalidad ?? '',
        });
        contactId = contact?.Codigo_contacto ?? contact?.Codigo ?? contact?.Id ?? contact?.id;
        steps.push({ step: 1, name: 'contact', status: 'ok', id: contactId });
        await this.persist(ref, req, { contactId }, steps);
        this.logger.log(`[enrollment:${ref}] contact ${contactId}`);
      }

      // ── Step 2: Student ──
      if (studentId) {
        steps.push({ step: 2, name: 'student', status: 'reused', id: studentId });
      } else {
        const student: any = await this.q10.post('/estudiantes', {
          Nombres: req.personal.Nombres,
          Apellidos: req.personal.Apellidos,
          Correo_electronico: req.personal.Correo_electronico,
          Telefono: req.personal.Telefono,
          Numero_documento: req.personal.Numero_documento,
          Tipo_documento: req.personal.Tipo_documento ?? 'DPI',
          Nacionalidad: req.personal.Nacionalidad ?? '',
          Fecha_nacimiento: req.personal.Fecha_nacimiento ?? '',
          Genero: req.personal.Genero ?? '',
          Codigo_contacto: contactId,
        });
        studentId = student?.Codigo_estudiante ?? student?.Codigo ?? student?.Id ?? student?.id;
        steps.push({ step: 2, name: 'student', status: 'ok', id: studentId });
        await this.persist(ref, req, { contactId, studentId }, steps);
        this.logger.log(`[enrollment:${ref}] student ${studentId}`);
      }

      // ── Step 3: Inscripción ──
      if (enrollmentId) {
        steps.push({ step: 3, name: 'enrollment', status: 'reused', id: enrollmentId });
      } else {
        const inscripcion: any = await this.q10.post('/inscripciones', {
          Codigo_estudiante: studentId,
          Codigo_programa: req.program.Codigo_programa,
          Codigo_periodo: req.program.Codigo_periodo,
          Codigo_sede: req.program.Codigo_sede ?? '',
        });
        enrollmentId = inscripcion?.Codigo_inscripcion ?? inscripcion?.Codigo ?? inscripcion?.Id;
        steps.push({ step: 3, name: 'enrollment', status: 'ok', id: enrollmentId });
        await this.persist(ref, req, { contactId, studentId, enrollmentId }, steps);
        this.logger.log(`[enrollment:${ref}] inscripcion ${enrollmentId}`);
      }

      // ── Step 4: Matrícula ──
      if (matriculaId) {
        steps.push({ step: 4, name: 'matricula', status: 'reused', id: matriculaId });
      } else {
        const matricula: any = await this.q10.post('/matriculasProgramas', {
          Codigo_estudiante: studentId,
          Codigo_programa: req.program.Codigo_programa,
          Codigo_periodo: req.program.Codigo_periodo,
          Codigo_sede: req.program.Codigo_sede ?? '',
          Codigo_inscripcion: enrollmentId,
        });
        matriculaId = matricula?.Codigo_matricula ?? matricula?.Codigo ?? matricula?.Id;
        steps.push({ step: 4, name: 'matricula', status: 'ok', id: matriculaId });
        await this.persist(ref, req, { contactId, studentId, enrollmentId, matriculaId }, steps);
        this.logger.log(`[enrollment:${ref}] matricula ${matriculaId}`);
      }

      // ── Step 5: Orden de pago ──
      if (paymentOrderId) {
        steps.push({ step: 5, name: 'payment_order', status: 'reused', id: paymentOrderId });
      } else {
        const order: any = await this.q10.post('/ordenespago', {
          Codigo_estudiante: studentId,
          Codigo_matricula: matriculaId,
          Concepto_pago: req.payment?.Concepto_pago ?? 'Matrícula',
          Valor: req.payment?.Valor ?? 0,
          Fecha_vencimiento: req.payment?.Fecha_vencimiento ?? '',
          Estado: 'Pendiente',
        });
        paymentOrderId = order?.Codigo_orden ?? order?.Codigo ?? order?.Id;
        steps.push({ step: 5, name: 'payment_order', status: 'ok', id: paymentOrderId });
        this.logger.log(`[enrollment:${ref}] orden ${paymentOrderId}`);
      }

      await this.tracking.upsert({
        ref,
        status: 'filled',
        asesor: req.asesor ?? null,
        studentName: `${req.personal.Nombres} ${req.personal.Apellidos}`,
        email: req.personal.Correo_electronico,
        contactId,
        studentId,
        enrollmentId,
        matriculaId,
        paymentOrderId,
        completedSteps: steps,
      });

      // Redacted response for the public form: only what the matrícula UI
      // actually renders. The full step-by-step trace + every Q10 ID
      // remains queryable through the admin tracking endpoint
      // (GET /api/q10/tracking, JWT-guarded). Public response intentionally
      // omits `ids`, `steps` and any internal Q10 identifier — review #7
      // raised this as a privacy / surface-area concern.
      return {
        success: true,
        ref,
        status: 'filled' as const,
        message: 'Enrollment completed successfully',
        paymentDetails: {
          // The orderId stays visible because the form prints it back to the
          // student as a payment reference number — they need it to pay.
          orderId: paymentOrderId,
          amount: req.payment?.Valor ?? 0,
          concept: req.payment?.Concepto_pago ?? 'Matrícula',
          dueDate: req.payment?.Fecha_vencimiento ?? '',
        },
      };
    } catch (err) {
      const failedStep =
        steps.filter((s) => s.status === 'ok' || s.status === 'reused').length + 1;
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`[enrollment:${ref}] failed at step ${failedStep}: ${message}`);

      await this.tracking.upsert({
        ref,
        status: 'error',
        asesor: req.asesor ?? null,
        studentName: `${req.personal.Nombres} ${req.personal.Apellidos}`,
        email: req.personal.Correo_electronico,
        contactId,
        studentId,
        enrollmentId,
        matriculaId,
        paymentOrderId,
        error: message,
        failedStep,
        completedSteps: steps,
      });

      if (err instanceof HttpException) throw err;
      // Public-facing failure response, redacted for the same reason as
      // the success path: no Q10 IDs, no step-by-step trace, no
      // partial-progress list. The full diagnostic stays in the tracking
      // record (admin-only).
      throw new HttpException(
        {
          success: false,
          ref,
          status: 'error' as const,
          message: 'Hubo un problema procesando la matrícula. Por favor intenta nuevamente con la misma referencia.',
          failedStep,
        },
        502,
      );
    }
  }

  private async persist(
    ref: string,
    req: EnrollmentDto,
    ids: {
      contactId?: string;
      studentId?: string;
      enrollmentId?: string;
      matriculaId?: string;
      paymentOrderId?: string;
    },
    steps: StepResult[],
  ): Promise<void> {
    await this.tracking.upsert({
      ref,
      status: 'opened',
      asesor: req.asesor ?? null,
      studentName: `${req.personal.Nombres} ${req.personal.Apellidos}`,
      email: req.personal.Correo_electronico,
      ...ids,
      completedSteps: steps,
    });
  }
}
