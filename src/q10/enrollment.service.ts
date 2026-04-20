import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Q10ClientService } from './q10-client.service';
import { TrackingService } from './tracking.service';

export interface EnrollmentRequest {
  ref?: string;
  asesor?: string;
  personal: {
    Nombres: string;
    Apellidos: string;
    Correo_electronico: string;
    Telefono: string;
    Tipo_documento?: string;
    Numero_documento: string;
    Nacionalidad?: string;
    Fecha_nacimiento?: string;
    Genero?: string;
  };
  program: {
    Codigo_programa: string;
    Codigo_periodo: string;
    Codigo_sede?: string;
  };
  payment?: {
    Concepto_pago?: string;
    Valor?: number;
    Fecha_vencimiento?: string;
  };
}

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    private readonly q10: Q10ClientService,
    private readonly tracking: TrackingService,
  ) {}

  /**
   * Full 5-step enrollment workflow:
   *   contact → student → inscripcion → matricula → orden de pago
   * Persists tracking state at every step so we can diagnose failures.
   */
  async run(req: EnrollmentRequest) {
    if (!req?.personal || !req?.program) {
      throw new BadRequestException({
        error: 'Missing required fields',
        required: ['personal', 'program'],
      });
    }

    const ref =
      req.ref ?? `ENR-${randomUUID().slice(0, 8).toUpperCase()}`;
    const steps: Array<{ step: number; name: string; status: string; id?: string }> = [];

    try {
      // Step 1: Contact
      const contactPayload = {
        Nombres: req.personal.Nombres,
        Apellidos: req.personal.Apellidos,
        Correo_electronico: req.personal.Correo_electronico,
        Telefono: req.personal.Telefono,
        Numero_documento: req.personal.Numero_documento,
        Tipo_documento: req.personal.Tipo_documento ?? 'DPI',
        Nacionalidad: req.personal.Nacionalidad ?? '',
      };
      const contact: any = await this.q10.post('/contactos', contactPayload);
      const contactId = contact?.Codigo_contacto ?? contact?.Codigo ?? contact?.Id ?? contact?.id;
      steps.push({ step: 1, name: 'contact', status: 'ok', id: contactId });
      this.logger.log(`[enrollment:${ref}] contact ${contactId}`);

      // Step 2: Student
      const studentPayload = {
        ...contactPayload,
        Fecha_nacimiento: req.personal.Fecha_nacimiento ?? '',
        Genero: req.personal.Genero ?? '',
        Codigo_contacto: contactId,
      };
      const student: any = await this.q10.post('/estudiantes', studentPayload);
      const studentId =
        student?.Codigo_estudiante ?? student?.Codigo ?? student?.Id ?? student?.id;
      steps.push({ step: 2, name: 'student', status: 'ok', id: studentId });
      this.logger.log(`[enrollment:${ref}] student ${studentId}`);

      // Step 3: Inscripción
      const inscripcionPayload = {
        Codigo_estudiante: studentId,
        Codigo_programa: req.program.Codigo_programa,
        Codigo_periodo: req.program.Codigo_periodo,
        Codigo_sede: req.program.Codigo_sede ?? '',
      };
      const inscripcion: any = await this.q10.post(
        '/inscripciones',
        inscripcionPayload,
      );
      const enrollmentId =
        inscripcion?.Codigo_inscripcion ?? inscripcion?.Codigo ?? inscripcion?.Id;
      steps.push({ step: 3, name: 'enrollment', status: 'ok', id: enrollmentId });
      this.logger.log(`[enrollment:${ref}] inscripcion ${enrollmentId}`);

      // Step 4: Matrícula
      const matriculaPayload = {
        Codigo_estudiante: studentId,
        Codigo_programa: req.program.Codigo_programa,
        Codigo_periodo: req.program.Codigo_periodo,
        Codigo_sede: req.program.Codigo_sede ?? '',
        Codigo_inscripcion: enrollmentId,
      };
      const matricula: any = await this.q10.post(
        '/matriculasProgramas',
        matriculaPayload,
      );
      const matriculaId =
        matricula?.Codigo_matricula ?? matricula?.Codigo ?? matricula?.Id;
      steps.push({ step: 4, name: 'matricula', status: 'ok', id: matriculaId });
      this.logger.log(`[enrollment:${ref}] matricula ${matriculaId}`);

      // Step 5: Orden de pago
      const paymentPayload = {
        Codigo_estudiante: studentId,
        Codigo_matricula: matriculaId,
        Concepto_pago: req.payment?.Concepto_pago ?? 'Matrícula',
        Valor: req.payment?.Valor ?? 0,
        Fecha_vencimiento: req.payment?.Fecha_vencimiento ?? '',
        Estado: 'Pendiente',
      };
      const order: any = await this.q10.post('/ordenespago', paymentPayload);
      const paymentOrderId =
        order?.Codigo_orden ?? order?.Codigo ?? order?.Id;
      steps.push({ step: 5, name: 'payment_order', status: 'ok', id: paymentOrderId });
      this.logger.log(`[enrollment:${ref}] orden ${paymentOrderId}`);

      this.tracking.upsert({
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
      });

      return {
        success: true,
        ref,
        message: 'Enrollment completed successfully',
        ids: {
          contact: contactId,
          student: studentId,
          enrollment: enrollmentId,
          matricula: matriculaId,
          paymentOrder: paymentOrderId,
        },
        steps,
        paymentDetails: {
          orderId: paymentOrderId,
          amount: req.payment?.Valor ?? 0,
          concept: req.payment?.Concepto_pago ?? 'Matrícula',
          dueDate: req.payment?.Fecha_vencimiento ?? '',
        },
      };
    } catch (err) {
      const failedStep = steps.length + 1;
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`[enrollment:${ref}] failed at step ${failedStep}: ${message}`);

      this.tracking.upsert({
        ref,
        status: 'error',
        asesor: req.asesor ?? null,
        error: message,
        failedStep,
        completedSteps: steps,
      });

      if (err instanceof HttpException) throw err;
      throw new HttpException(
        {
          success: false,
          ref,
          error: message,
          failedStep,
          completedSteps: steps,
        },
        502,
      );
    }
  }
}
