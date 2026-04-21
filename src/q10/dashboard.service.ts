import { Injectable, Logger } from '@nestjs/common';
import { Q10ClientService } from './q10-client.service';
import {
  Q10Contact,
  Q10Opportunity,
  Q10Payment,
  Q10PendingPayment,
  Q10Period,
  Q10Student,
} from './dashboard.types';

type Item = Record<string, any>;

function safeArray(v: unknown): Item[] {
  if (Array.isArray(v)) return v as Item[];
  if (v && typeof v === 'object') {
    const maybeList = (v as any).items ?? (v as any).data ?? (v as any).results;
    if (Array.isArray(maybeList)) return maybeList;
  }
  return [];
}

function parseDate(value: unknown): Date | null {
  if (!value || typeof value !== 'string') return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Trim + treat literal "null" strings as empty (Q10 serialises nulls that way). */
function cleanStr(v: unknown): string {
  if (v == null) return '';
  const s = String(v).trim();
  return s === 'null' ? '' : s;
}

/** Q10 serialises booleans as the literal string "true"/"false" sometimes. */
function isActivo(status: unknown): boolean {
  if (status === true) return true;
  const s = cleanStr(status).toLowerCase();
  return s === 'true' || s.includes('activ');
}

function sum(list: Item[], field: string): number {
  return list.reduce((acc, x) => acc + (Number(x[field]) || 0), 0);
}

function groupCount<T extends Item>(
  list: T[],
  getter: (item: T) => unknown,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of list) {
    const key = cleanStr(getter(item)) || 'Sin especificar';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/** Pick periods considered active right now. */
function currentlyActivePeriods(periodos: Item[]): Item[] {
  const now = Date.now();
  const active = periodos.filter((p) => isActivo(p.Estado));
  const current = active.filter((p) => {
    const start = parseDate(p.Fecha_inicio)?.getTime() ?? -Infinity;
    const end = parseDate(p.Fecha_fin)?.getTime() ?? Infinity;
    return now >= start && now <= end;
  });
  return current.length > 0 ? current : active;
}

function periodKey(p: Item): string {
  return (
    cleanStr(p.Consecutivo) ||
    cleanStr(p.Consecutivo_periodo) ||
    cleanStr(p.Codigo) ||
    cleanStr(p.Id)
  );
}

/** Assemble a student full name from Q10's split fields. */
function studentFullName(s: Item): string {
  // /pagosPendientes nests Estudiante with a pre-joined `Nombre_completo`.
  const joined = cleanStr(s.Nombre_completo);
  if (joined) return joined;
  return [s.Primer_nombre, s.Segundo_nombre, s.Primer_apellido, s.Segundo_apellido]
    .map(cleanStr)
    .filter(Boolean)
    .join(' ');
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

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
      // Uses getAll so the dashboard sees the whole dataset, not just the
      // ~50 records Q10 returns on a single unpaginated call.
      return safeArray(await this.q10.getAll(path, params)) as T[];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors[key] = message;
      this.logger.warn(`[dashboard] ${path} failed: ${message}`);
      return [];
    }
  }

  /**
   * Shape and field names are aligned with a live /diagnose run against
   * Genius Idiomas' Q10 tenant (Costa Rica, ETDH, "pagos regulares" model).
   *
   * What this plan exposes:
   *   - /estudiantes?Periodo={Consecutivo}           — Primer_nombre,
   *     Primer_apellido, Nombre_programa, Nombre_sede, Condicion_matricula,
   *     Fecha_matricula, Codigo_estudiante (12 digits).
   *   - /pagos?Fecha_inicio&Fecha_fin                — Codigo_persona (maps
   *     to Codigo_estudiante), Valor_pagado, Fecha_pago, Nombre_estudiante.
   *   - /pagosPendientes?Consecutivo_periodo         — Valor_saldo,
   *     Nombre_producto, Nombre_periodo, Estudiante (nested object with
   *     Codigo_persona + Nombre_completo).
   *   - /oportunidades?Fecha_inicio&Fecha_fin        — Consecutivo_oportunidad,
   *     Nombre_oportunidad, Descripcion_como_se_entero (origin),
   *     Descripcion_medio_contacto.
   *   - /contactos, /periodos, /programas, /sedes,
   *     /mediospublicitarios?Estado=true, /medioscontacto?Estado=true.
   *
   * What this plan DOES NOT expose (verified 2026-04-21):
   *   - /ordenespago, /facturas                      — "no aplica al modelo"
   *   - /estadocuentaestudiantes                     — "no aplica al modelo
   *     financiero correspondiente" (Q10 support initially suggested it,
   *     but the tenant's model forbids it — see diagnostic).
   *   - /negocios                                    — returns 400 on every
   *     param combination tried (noparam, Fecha_inicio/fin, Estado,
   *     Consecutivo_flujo). Not called from here until Q10 clarifies.
   *   - /matriculasProgramas                         — POST-only per the
   *     doc. Funnel `enrollments` = active-period student count.
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

    // Non-dependent sources in parallel. /negocios and /estadocuentaestudiantes
    // are NOT here — this plan rejects both with 400. Re-add if Q10 enables them.
    const [periodos, contactos, opps, pagos] = await Promise.all([
      this.tryFetch<Q10Period>('periods', '/periodos', errors),
      this.tryFetch<Q10Contact>('contacts', '/contactos', errors),
      this.tryFetch<Q10Opportunity>('opportunities', '/oportunidades', errors, ALL_TIME),
      this.tryFetch<Q10Payment>('payments', '/pagos', errors, RANGE),
    ]);

    // Students + pending payments — one call per active period (doc requires
    // Periodo / Consecutivo_periodo).
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
            this.tryFetch<Q10Student>('students', '/estudiantes', errors, {
              Periodo: periodKey(p),
            }),
          ),
        ),
        Promise.all(
          active.map((p) =>
            this.tryFetch<Q10PendingPayment>('pendingPayments', '/pagosPendientes', errors, {
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

    // ─── Students ───
    // Q10 /estudiantes?Periodo=X already filters to the active cohort; every
    // returned record is matriculated. Condicion_matricula tells whether it's
    // a fresh enrollment ("Nuevo") vs a renewal ("Renovado").
    const newEnrollmentsThisPeriod = students.filter(
      (s) => cleanStr(s.Condicion_matricula).toLowerCase() === 'nuevo',
    ).length;

    const newStudentsInRange = students.filter((s) => {
      const d = parseDate(s.Fecha_matricula);
      return d !== null && d.getTime() >= rangeStart.getTime();
    });

    // ─── CRM ───
    // This plan's /oportunidades records don't expose a top-level Estado —
    // the state lives inside Negocio_favorito (nested object). Until we can
    // reliably parse that, we report total opps and mark the conversion-rate
    // KPI as degraded so the UI can hide it.
    const oppsTotal = opps.length;
    const conversionRateDegraded =
      oppsTotal === 0 || oppsTotal < Math.max(5, students.length * 0.1);
    if (conversionRateDegraded) {
      degraded.conversionRate =
        oppsTotal === 0
          ? 'Sin oportunidades en el CRM'
          : `Sólo ${oppsTotal} oportunidades para ${students.length} matrículas — CRM subutilizado, la tasa no es confiable`;
    }

    // ─── Financial ───
    const revenueInRange = sum(pagos, 'Valor_pagado');
    const outstandingDebt = sum(pending, 'Valor_saldo');
    // /pagosPendientes on this plan has no Fecha_vencimiento — overdue count
    // isn't available. Expose that clearly instead of lying with 0.
    degraded.overduePending =
      '/pagosPendientes no expone Fecha_vencimiento en este plan';

    // Students who have at least one payment in the range (intersection
    // between /pagos Codigo_persona and /estudiantes Codigo_estudiante —
    // both are the same 12-digit internal person code).
    const currentStudentIds = new Set(
      students.map((s) => cleanStr(s.Codigo_estudiante)).filter(Boolean),
    );
    const paidCodigos = new Set(
      pagos.map((p) => cleanStr(p.Codigo_persona)).filter(Boolean),
    );
    const paidCurrentCount = [...paidCodigos].filter((id) =>
      currentStudentIds.has(id),
    ).length;

    // ─── Funnel ───
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

    // Display-friendly groupings. Use the `Nombre_*` fields so the UI
    // shows "Curso de Português" instead of the "01" code.
    const studentsByProgram = groupCount(students, (s) => s.Nombre_programa);
    const studentsBySede = groupCount(students, (s) => s.Nombre_sede);
    const opportunitiesByOrigin = groupCount(
      opps,
      (o) => o.Descripcion_como_se_entero,
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
        conversionRate: null,
        revenueInRange,
        outstandingDebt,
        ordersPending: pending.length,
        studentsWithPaymentThisPeriod: paidCurrentCount,
      },
      funnel,
      charts: { revenueByDay, newStudentsByDay },
      distributions: {
        studentsByProgram,
        studentsBySede,
        opportunitiesByOrigin,
      },
      // Normalised shapes — frontend stays simple because we do the
      // field mapping here once instead of scattering it through the UI.
      recent: {
        students: students.slice(-10).reverse().map((s) => ({
          Codigo: cleanStr(s.Codigo_estudiante),
          Nombres: [s.Primer_nombre, s.Segundo_nombre].map(cleanStr).filter(Boolean).join(' '),
          Apellidos: [s.Primer_apellido, s.Segundo_apellido].map(cleanStr).filter(Boolean).join(' '),
          Codigo_programa: cleanStr(s.Nombre_programa) || cleanStr(s.Codigo_programa),
          Codigo_sede: cleanStr(s.Nombre_sede) || cleanStr(s.Codigo_sede),
          Estado: cleanStr(s.Condicion_matricula) || 'Matriculado',
        })),
        opportunities: opps.slice(-10).reverse().map((o) => ({
          Codigo: cleanStr(o.Consecutivo_oportunidad),
          Nombres: cleanStr(o.Nombre_oportunidad),
          Apellidos: '',
          Correo: cleanStr(o.Correo_electronico),
          Telefono: cleanStr(o.Celular ?? o.Telefono),
          Origen: cleanStr(o.Descripcion_como_se_entero),
          Estado: cleanStr(o.Nombre_asesor) ? 'Con asesor' : 'Sin asignar',
        })),
        pendingPayments: pending.slice(0, 10).map((p) => {
          const e = p.Estudiante && typeof p.Estudiante === 'object' ? p.Estudiante : {};
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
