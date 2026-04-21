import { Injectable, Logger } from '@nestjs/common';
import { Q10ClientService } from './q10-client.service';

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

function isActivo(status: unknown): boolean {
  if (status === true) return true;
  if (typeof status !== 'string') return false;
  return status.toLowerCase().includes('activ');
}

function sum(list: Item[], field: string): number {
  return list.reduce((acc, x) => acc + (Number(x[field]) || 0), 0);
}

function groupCount<T extends Item>(list: T[], field: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of list) {
    const key = String(item[field] ?? 'Sin especificar');
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

/**
 * Extract the consecutive ID from a /periodos record. Q10 exposes it under
 * `Consecutivo` (the canonical field), and some endpoints surface it as
 * `Consecutivo_periodo` when the consecutive belongs to a nested resource.
 * `Codigo`/`Id` only used as last resort — those are human-readable labels
 * (e.g. "PER-2026-I") and passing them to /estudiantes as Periodo yields
 * zero rows on most Q10 plans.
 */
function periodKey(p: Item): string {
  return String(
    p.Consecutivo ?? p.Consecutivo_periodo ?? p.Codigo ?? p.Id ?? '',
  );
}

/**
 * Best-effort "effective creation date" for a student — tries Fecha_creacion
 * first, falls back to Fecha_matricula. Centralised so filter + chart bucketing
 * use the same derived field; otherwise a student matched via Fecha_matricula
 * would pass the range filter but contribute 0 to the bucket grouped by
 * Fecha_creacion, making `kpis.newStudentsInRange` smaller than the chart.
 */
function effectiveStudentDate(s: Item): string | null {
  const v = s.Fecha_creacion ?? s.Fecha_matricula ?? null;
  return typeof v === 'string' ? v : null;
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
      // ~50 records Q10 returns on a single unpaginated call. safeArray
      // normalises any unexpected wrapper shape to [].
      return safeArray(await this.q10.getAll(path, params)) as T[];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors[key] = message;
      this.logger.warn(`[dashboard] ${path} failed: ${message}`);
      return [];
    }
  }

  /**
   * Endpoint usage follows Q10-JACK-API.md and the Q10 support confirmation
   * (ticket with Diógenes): this institution runs the "pagos regulares"
   * financial model, so:
   *
   *   FINANCIAL sources USED:
   *     - /pagos?Fecha_inicio&Fecha_fin       (actual payments in range)
   *     - /pagosPendientes?Consecutivo_periodo (outstanding per period — P caps!)
   *     - /estadocuentaestudiantes             (consolidated per-student balance)
   *
   *   FINANCIAL sources NOT applicable to this plan (Q10 reply):
   *     - /ordenespago, /facturas             (other financial models only)
   *
   *   STUDENT list requires ?Periodo={Consecutivo} — we fan out over active
   *   periods and dedupe.
   *
   *   CRM sources (/oportunidades, /negocios) require Fecha_inicio+Fecha_fin;
   *   we use a wide window for KPIs that need the full historical dataset.
   *
   *   /matriculasProgramas is POST-only per the doc; "enrollments" in the
   *   funnel derives from the active-period student count (equivalent for
   *   this school — a student in an active period = a matrícula).
   */
  async overview(rangeDays = 30) {
    const errors: Record<string, string> = {};
    const degraded: Record<string, string> = {};
    const ALL_TIME = { Fecha_inicio: '1900-01-01', Fecha_fin: '2099-12-31' };

    // Range window for /pagos — server-side filtered so we don't drag lifetime.
    const rangeEnd = new Date();
    const rangeStart = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
    const RANGE = {
      Fecha_inicio: isoDate(rangeStart),
      Fecha_fin: isoDate(rangeEnd),
    };

    // Non-dependent sources in parallel
    const [periodos, contactos, opps, deals, estadoCuenta, pagos] = await Promise.all([
      this.tryFetch<Item>('periods', '/periodos', errors),
      this.tryFetch<Item>('contacts', '/contactos', errors),
      this.tryFetch<Item>('opportunities', '/oportunidades', errors, ALL_TIME),
      this.tryFetch<Item>('deals', '/negocios', errors, ALL_TIME),
      this.tryFetch<Item>('estadoCuenta', '/estadocuentaestudiantes', errors),
      this.tryFetch<Item>('payments', '/pagos', errors, RANGE),
    ]);

    // Students + pending payments — one call per active period
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
          const id = String(s.Codigo_estudiante ?? s.Codigo ?? s.Id ?? '');
          if (!id || seenStudents.has(id)) continue;
          seenStudents.add(id);
          students.push(s);
        }
      }
      pending = pendingLists.flat();
    }

    // ─── Students ───
    const activeStudents = students.filter(
      (s) =>
        isActivo(s.Estado) ||
        String(s.Estado ?? '').toLowerCase().includes('matricul'),
    );

    // ─── CRM ───
    const oppsWon = opps.filter((o) => {
      const e = String(o.Estado ?? '').toLowerCase();
      return e.includes('inscri') || e.includes('ganad');
    }).length;
    const oppsLost = opps.filter((o) =>
      String(o.Estado ?? '').toLowerCase().includes('perdi'),
    ).length;
    const oppsOpen = Math.max(0, opps.length - oppsWon - oppsLost);
    const conversionRate =
      opps.length > 0 ? Math.round((oppsWon / opps.length) * 100) : 0;

    // ─── Financial ───
    // /pagos is already server-side filtered by RANGE (Fecha_inicio/Fecha_fin).
    const revenueInRange = sum(pagos, 'Valor');
    const outstandingDebt = sum(pending, 'Valor');
    const overduePending = pending.filter((p) => {
      const due = parseDate(p.Fecha_vencimiento);
      return due !== null && due.getTime() < Date.now();
    });
    // Consolidated balances from /estadocuentaestudiantes — useful for
    // reconciliation. `studentsWithDebt` is an institution-wide figure
    // (historical + current), so keep it unscoped to mirror the accountant
    // view. `paidEnrollments` is a funnel metric, so it MUST be scoped to
    // students in the currently-active periods — otherwise historical paid
    // students would inflate the funnel above the current-period cohort.
    const studentsWithDebt = estadoCuenta.filter((e) => Number(e.Saldo) > 0);

    const currentStudentIds = new Set(
      students.map((s) => String(s.Codigo_estudiante ?? s.Codigo ?? s.Id ?? '')),
    );
    const paidCurrentStudents = estadoCuenta.filter((e) => {
      if (Number(e.Saldo) !== 0 || Number(e.Total_pagado) <= 0) return false;
      const id = String(e.Codigo_estudiante ?? e.Codigo ?? e.Id ?? '');
      return currentStudentIds.has(id);
    });

    // ─── Funnel (see class doc for why enrollments = students.length) ───
    const funnel = {
      opportunities: opps.length,
      enrollments: students.length,
      paidEnrollments: paidCurrentStudents.length,
    };

    // Normalise the effective creation date once so the filter and the
    // bucketByDay call agree on which field to look at (prevents off-by-one
    // between `kpis.newStudentsInRange` and the chart).
    const studentsWithEffectiveDate = students
      .map((s) => ({ ...s, _EffectiveDate: effectiveStudentDate(s) }))
      .filter((s): s is Item & { _EffectiveDate: string } => {
        const d = parseDate(s._EffectiveDate);
        return d !== null && d.getTime() >= rangeStart.getTime();
      });
    const newStudentsByDay = this.bucketByDay(
      studentsWithEffectiveDate,
      '_EffectiveDate',
      null,
      rangeDays,
    );
    const revenueByDay = this.bucketByDay(pagos, 'Fecha_pago', 'Valor', rangeDays);

    const studentsByProgram = groupCount(students, 'Codigo_programa');
    const studentsBySede = groupCount(students, 'Codigo_sede');
    const opportunitiesByOrigin = groupCount(opps, 'Origen');

    return {
      range: { days: rangeDays, generatedAt: new Date().toISOString() },
      partial: Object.keys(errors).length > 0,
      errors,
      degraded,
      kpis: {
        activeStudents: activeStudents.length,
        totalStudents: students.length,
        newStudentsInRange: newStudentsByDay.reduce((s, p) => s + p.value, 0),
        totalContacts: contactos.length,
        oppsOpen,
        oppsWon,
        oppsLost,
        conversionRate,
        revenueInRange,
        outstandingDebt,
        overduePending: overduePending.length,
        ordersPending: pending.length,
        activeDeals: deals.length,
        studentsWithDebt: studentsWithDebt.length,
      },
      funnel,
      charts: { revenueByDay, newStudentsByDay },
      distributions: {
        studentsByProgram,
        studentsBySede,
        opportunitiesByOrigin,
      },
      recent: {
        students: students.slice(-10).reverse(),
        opportunities: opps.slice(-10).reverse(),
        pendingPayments: pending
          .slice()
          .sort((a, b) => {
            const da = parseDate(a.Fecha_vencimiento)?.getTime() ?? Infinity;
            const db = parseDate(b.Fecha_vencimiento)?.getTime() ?? Infinity;
            return da - db;
          })
          .slice(0, 10),
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
