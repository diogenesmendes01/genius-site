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

function withinLastDays(value: unknown, days: number): boolean {
  const d = parseDate(value);
  if (!d) return false;
  const ms = days * 24 * 60 * 60 * 1000;
  return Date.now() - d.getTime() <= ms;
}

function isActive(status: unknown): boolean {
  if (typeof status !== 'string') return false;
  const s = status.toLowerCase();
  return s.includes('activ') || s.includes('confirm') || s === 'pagado';
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

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly q10: Q10ClientService) {}

  /**
   * Fetch a Q10 resource and, if it fails, record the error under `key` in
   * `errors` so callers can distinguish a legitimately empty list from an
   * upstream failure. This replaces the previous `.catch(() => [])` pattern,
   * which made ERP outages look like healthy zero-KPI dashboards.
   */
  private async tryFetch<T>(
    key: string,
    path: string,
    errors: Record<string, string>,
  ): Promise<T[]> {
    try {
      return safeArray(await this.q10.get(path)) as T[];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors[key] = message;
      this.logger.warn(`[dashboard] ${path} failed: ${message}`);
      return [];
    }
  }

  async overview(rangeDays = 30) {
    const errors: Record<string, string> = {};
    // Tracks per-KPI notes when a value had to be derived from a fallback
    // source instead of the primary endpoint. The frontend can surface
    // these as caveats next to the affected numbers so operators know the
    // figure came from a degraded path (e.g. lifetime total instead of a
    // range-filtered sum).
    const degraded: Record<string, string> = {};

    const [
      students,
      opps,
      deals,
      enrolls,
      orders,
      payments,
      pending,
      estadoCuenta,
    ] = await Promise.all([
      this.tryFetch<Item>('students', '/estudiantes', errors),
      this.tryFetch<Item>('opportunities', '/oportunidades', errors),
      this.tryFetch<Item>('deals', '/negocios', errors),
      this.tryFetch<Item>('enrollments', '/matriculasProgramas', errors),
      this.tryFetch<Item>('orders', '/ordenespago', errors),
      this.tryFetch<Item>('payments', '/pagos', errors),
      this.tryFetch<Item>('pendingPayments', '/pagospendientes', errors),
      // Financial fallback source. Many Q10 subscription plans (including
      // our production plan) do NOT expose /pagos or /pagospendientes —
      // only /estadocuentaestudiantes. When the primary endpoints fail we
      // derive outstanding-debt and lifetime-paid figures from here so the
      // dashboard still shows meaningful numbers instead of zeros. The
      // sibling Q10 WhatsApp Chrome extension hit the same limitation and
      // documented it in its background/service-worker.js.
      this.tryFetch<Item>('accountStatements', '/estadocuentaestudiantes', errors),
    ]);

    // ─── Students ───
    const activeStudents = students.filter((s) => isActive(s.Estado));
    const newStudentsInRange = students.filter((s) =>
      withinLastDays(s.Fecha_creacion ?? s.Fecha_matricula, rangeDays),
    );

    // ─── CRM ───
    const oppsWon = opps.filter((o) =>
      String(o.Estado ?? '').toLowerCase().includes('inscri'),
    ).length;
    const oppsLost = opps.filter((o) =>
      String(o.Estado ?? '').toLowerCase().includes('perdi'),
    ).length;
    const oppsOpen = Math.max(0, opps.length - oppsWon - oppsLost);
    const conversionRate =
      opps.length > 0 ? Math.round((oppsWon / opps.length) * 100) : 0;

    // ─── Financial ───
    const paidInRange = payments.filter((p) => withinLastDays(p.Fecha_pago, rangeDays));
    const estadoCuentaAvailable = !errors['accountStatements'];

    // revenueInRange: prefer /pagos (supports Fecha_pago range filter). Fall
    // back to /estadocuentaestudiantes.Total_pagado (a lifetime figure, NOT
    // range-filtered — the degraded note makes that caveat explicit so the
    // frontend can badge the KPI).
    let revenueInRange = sum(paidInRange, 'Valor');
    if (errors['payments'] && estadoCuentaAvailable) {
      revenueInRange = sum(estadoCuenta, 'Total_pagado');
      degraded['revenueInRange'] =
        'Derived from estadocuentaestudiantes (lifetime total, not range-filtered)';
    }

    // outstandingDebt: prefer /pagospendientes (Valor per pending item). Fall
    // back to /estadocuentaestudiantes.Saldo (current balance due per student).
    let outstandingDebt = sum(pending, 'Valor');
    if (errors['pendingPayments'] && estadoCuentaAvailable) {
      outstandingDebt = sum(estadoCuenta, 'Saldo');
      degraded['outstandingDebt'] =
        'Derived from estadocuentaestudiantes (Saldo aggregate)';
    }

    // overduePending: requires per-item Fecha_vencimiento. estadoCuenta has
    // no due-date field, so there is no viable fallback — we surface 0 and
    // explain why via the degraded note.
    const overduePending = pending.filter((p) => {
      const due = parseDate(p.Fecha_vencimiento);
      return due !== null && due.getTime() < Date.now();
    });
    if (errors['pendingPayments']) {
      degraded['overduePending'] =
        'Unavailable: estadocuentaestudiantes has no due-date field';
    }

    const ordersPending = orders.filter((o) =>
      String(o.Estado ?? '').toLowerCase().includes('pend'),
    );

    // ─── Funnel ───
    const funnel = {
      opportunities: opps.length,
      enrollments: enrolls.length,
      paidEnrollments: orders.filter((o) =>
        String(o.Estado ?? '').toLowerCase().includes('pagad'),
      ).length,
    };

    // revenueByDay: requires per-payment dates. When /pagos fails there is
    // no viable fallback (estadoCuenta has no Fecha_pago), so we emit an
    // empty series and flag the chart as degraded.
    const revenueByDay = errors['payments']
      ? []
      : this.bucketByDay(paidInRange, 'Fecha_pago', 'Valor', rangeDays);
    if (errors['payments']) {
      degraded['revenueByDay'] =
        'Unavailable: estadocuentaestudiantes has no per-payment dates';
    }
    const newStudentsByDay = this.bucketByDay(
      newStudentsInRange,
      'Fecha_creacion',
      null,
      rangeDays,
    );

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
        newStudentsInRange: newStudentsInRange.length,
        oppsOpen,
        oppsWon,
        oppsLost,
        conversionRate,
        revenueInRange,
        outstandingDebt,
        overduePending: overduePending.length,
        ordersPending: ordersPending.length,
        activeDeals: deals.length,
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
        pendingPayments: pending.slice(0, 10),
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
