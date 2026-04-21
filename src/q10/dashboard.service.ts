import { Injectable, Logger } from '@nestjs/common';
import { Q10ClientService } from './q10-client.service';
import {
  cleanStr,
  currentlyActivePeriods,
  isoDate,
  Item,
  parseDate,
  periodKey,
  safeArray,
  studentFullName,
  sum,
} from './dashboard/helpers';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly q10: Q10ClientService) {}

  private async tryFetch<T>(
    key: string,
    path: string,
    errors: Record<string, string>,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    try {
      return safeArray(await this.q10.getAll(path, params)) as T[];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors[key] = message;
      this.logger.warn(`[dashboard] ${path} failed: ${message}`);
      return [];
    }
  }

  /**
   * Visión general — the main tab. Keeps the original field mapping aligned
   * with the live Q10 tenant (Costa Rica, ETDH, "pagos regulares" model).
   * Deeper drill-downs live on the sibling services: AcademicService,
   * FinancialService, CommercialService.
   */
  async overview(rangeDays = 30) {
    const errors: Record<string, string> = {};
    const degraded: Record<string, string> = {};
    const ALL_TIME = { Fecha_inicio: '1900-01-01', Fecha_fin: '2099-12-31' };

    const rangeEnd = new Date();
    const rangeStart = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
    const RANGE = {
      Fecha_inicio: isoDate(rangeStart),
      Fecha_fin: isoDate(rangeEnd),
    };

    const [periodos, contactos, opps, pagos] = await Promise.all([
      this.tryFetch<Item>('periods', '/periodos', errors),
      this.tryFetch<Item>('contacts', '/contactos', errors),
      this.tryFetch<Item>('opportunities', '/oportunidades', errors, ALL_TIME),
      this.tryFetch<Item>('payments', '/pagos', errors, RANGE),
    ]);

    const active = currentlyActivePeriods(periodos);
    let students: Item[] = [];
    let pending: Item[] = [];

    if (active.length === 0) {
      if (periodos.length === 0) {
        degraded.students = 'No se pudo cargar /periodos — lista de estudiantes vacía';
        degraded.pendingPayments = 'No se pudo cargar /periodos — pagos pendientes no disponibles';
      } else {
        degraded.students = 'No hay períodos activos';
        degraded.pendingPayments = 'No hay períodos activos';
      }
    } else {
      const [studentLists, pendingLists] = await Promise.all([
        Promise.all(
          active.map((p) =>
            this.tryFetch<Item>('students', '/estudiantes', errors, {
              Periodo: periodKey(p),
            }),
          ),
        ),
        Promise.all(
          active.map((p) =>
            this.tryFetch<Item>('pendingPayments', '/pagosPendientes', errors, {
              Consecutivo_periodo: periodKey(p),
            }),
          ),
        ),
      ]);

      const seenStudents = new Set<string>();
      for (const list of studentLists) {
        for (const s of list) {
          const id = cleanStr(s.Codigo_estudiante);
          if (!id || seenStudents.has(id)) continue;
          seenStudents.add(id);
          students.push(s);
        }
      }
      pending = pendingLists.flat();
    }

    const newEnrollmentsThisPeriod = students.filter(
      (s) => cleanStr(s.Condicion_matricula).toLowerCase() === 'nuevo',
    ).length;

    const newStudentsInRange = students.filter((s) => {
      const d = parseDate(s.Fecha_matricula);
      return d !== null && d.getTime() >= rangeStart.getTime();
    });

    // Conversion rate, real this time — /oportunidades carries Negocio_favorito
    // with Estado_negocio (see raw Q10 dump: "Presentación"/"Ganada"/etc).
    const oppsTotal = opps.length;
    const oppsWon = opps.filter((o) => {
      const e = cleanStr(o.Negocio_favorito?.Estado_negocio).toLowerCase();
      return e.includes('ganad');
    }).length;
    const conversionRateDegraded =
      oppsTotal === 0 || oppsTotal < Math.max(5, students.length * 0.1);
    if (conversionRateDegraded) {
      degraded.conversionRate =
        oppsTotal === 0
          ? 'Sin oportunidades en el CRM'
          : `Sólo ${oppsTotal} oportunidades para ${students.length} matrículas — CRM subutilizado`;
    }
    // When oppsTotal is meaningful (not degraded), compute the actual rate.
    // Previously this branch returned literal `0` when degraded, but the UI
    // already hides the card in that case — keeping it `null` is unambiguous.
    const conversionRate = conversionRateDegraded
      ? null
      : Math.round((oppsWon / oppsTotal) * 100);

    const revenueInRange = sum(pagos, 'Valor_pagado');
    const outstandingDebt = sum(pending, 'Valor_saldo');
    degraded.overduePending =
      '/pagosPendientes no expone Fecha_vencimiento en este plan';

    const currentStudentIds = new Set(
      students.map((s) => cleanStr(s.Codigo_estudiante)).filter(Boolean),
    );
    const paidCodigos = new Set(
      pagos.map((p) => cleanStr(p.Codigo_persona)).filter(Boolean),
    );
    const paidCurrentCount = [...paidCodigos].filter((id) =>
      currentStudentIds.has(id),
    ).length;

    const funnel = {
      opportunities: oppsTotal,
      enrollments: students.length,
      paidEnrollments: paidCurrentCount,
    };

    const newStudentsByDay = this.bucketByDay(
      newStudentsInRange,
      'Fecha_matricula',
      null,
      rangeDays,
    );
    const revenueByDay = this.bucketByDay(
      pagos,
      'Fecha_pago',
      'Valor_pagado',
      rangeDays,
    );

    return {
      range: { days: rangeDays, generatedAt: new Date().toISOString() },
      partial: Object.keys(errors).length > 0,
      errors,
      degraded,
      kpis: {
        activeStudents: students.length,
        totalStudents: students.length,
        newEnrollmentsThisPeriod,
        newStudentsInRange: newStudentsInRange.length,
        totalContacts: contactos.length,
        oppsTotal,
        oppsWon,
        conversionRate,
        revenueInRange,
        outstandingDebt,
        ordersPending: pending.length,
        // Renamed from `paidStudents` for clarity (review #7): this counts
        // active-period students with at least one payment in the range,
        // not "students with their tuition fully paid".
        studentsWithPaymentThisPeriod: paidCurrentCount,
      },
      funnel,
      charts: { revenueByDay, newStudentsByDay },
      recent: {
        students: students
          .slice(-10)
          .reverse()
          .map((s) => ({
            Codigo: cleanStr(s.Codigo_estudiante),
            Nombres: [s.Primer_nombre, s.Segundo_nombre]
              .map(cleanStr)
              .filter(Boolean)
              .join(' '),
            Apellidos: [s.Primer_apellido, s.Segundo_apellido]
              .map(cleanStr)
              .filter(Boolean)
              .join(' '),
            Codigo_programa:
              cleanStr(s.Nombre_programa) || cleanStr(s.Codigo_programa),
            Codigo_sede: cleanStr(s.Nombre_sede) || cleanStr(s.Codigo_sede),
            Estado: cleanStr(s.Condicion_matricula) || 'Matriculado',
          })),
        pendingPayments: pending.slice(0, 10).map((p) => {
          const e =
            p.Estudiante && typeof p.Estudiante === 'object' ? p.Estudiante : {};
          return {
            Nombres: studentFullName(e) || '—',
            Apellidos: '',
            Concepto: cleanStr(p.Nombre_producto),
            Valor: Number(p.Valor_saldo) || 0,
            Fecha_vencimiento: `Período ${cleanStr(p.Nombre_periodo) || '—'}`,
          };
        }),
      },
    };
  }

  private bucketByDay(
    list: Item[],
    dateField: string,
    valueField: string | null,
    days: number,
  ): Array<{ date: string; value: number }> {
    const buckets = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const item of list) {
      const d = parseDate(item[dateField]);
      if (!d) continue;
      const key = d.toISOString().slice(0, 10);
      if (!buckets.has(key)) continue;
      const current = buckets.get(key) ?? 0;
      const increment = valueField ? Number(item[valueField]) || 0 : 1;
      buckets.set(key, current + increment);
    }
    return Array.from(buckets.entries()).map(([date, value]) => ({ date, value }));
  }
}
