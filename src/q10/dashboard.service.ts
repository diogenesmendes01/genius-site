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

function groupCount<T extends Item>(
  list: T[],
  field: string,
): Record<string, number> {
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
   * Top-level overview — everything the default dashboard needs in one call.
   * Fetches the underlying Q10 resources in parallel; the client's cache
   * keeps repeat requests within `Q10_CACHE_TTL` cheap.
   */
  async overview(rangeDays = 30) {
    const [
      estudiantes,
      oportunidades,
      negocios,
      matriculas,
      ordenesPago,
      pagos,
      pagosPendientes,
    ] = await Promise.all([
      this.q10.get('/estudiantes').catch(() => []),
      this.q10.get('/oportunidades').catch(() => []),
      this.q10.get('/negocios').catch(() => []),
      this.q10.get('/matriculasProgramas').catch(() => []),
      this.q10.get('/ordenespago').catch(() => []),
      this.q10.get('/pagos').catch(() => []),
      this.q10.get('/pagospendientes').catch(() => []),
    ]);

    const students = safeArray(estudiantes);
    const opps = safeArray(oportunidades);
    const deals = safeArray(negocios);
    const enrolls = safeArray(matriculas);
    const orders = safeArray(ordenesPago);
    const payments = safeArray(pagos);
    const pending = safeArray(pagosPendientes);

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
    const oppsOpen = opps.length - oppsWon - oppsLost;
    const conversionRate =
      opps.length > 0 ? Math.round((oppsWon / opps.length) * 100) : 0;

    // ─── Financial ───
    const paidInRange = payments.filter((p) =>
      withinLastDays(p.Fecha_pago, rangeDays),
    );
    const revenueInRange = sum(paidInRange, 'Valor');
    const outstandingDebt = sum(pending, 'Valor');
    const overduePending = pending.filter((p) => {
      const due = parseDate(p.Fecha_vencimiento);
      return due !== null && due.getTime() < Date.now();
    });
    const ordersPending = orders.filter((o) =>
      String(o.Estado ?? '').toLowerCase().includes('pend'),
    );

    // ─── Funnel (lead → opportunity → enrolled → paid) ───
    const funnel = {
      opportunities: opps.length,
      enrollments: enrolls.length,
      paidEnrollments: orders.filter((o) =>
        String(o.Estado ?? '').toLowerCase().includes('pagad'),
      ).length,
    };

    // ─── Charts: revenue over the range, by day ───
    const revenueByDay = this.bucketByDay(paidInRange, 'Fecha_pago', 'Valor', rangeDays);
    const newStudentsByDay = this.bucketByDay(
      newStudentsInRange,
      'Fecha_creacion',
      null,
      rangeDays,
    );

    // ─── Distributions ───
    const studentsByProgram = groupCount(students, 'Codigo_programa');
    const studentsBySede = groupCount(students, 'Codigo_sede');
    const opportunitiesByOrigin = groupCount(opps, 'Origen');

    return {
      range: { days: rangeDays, generatedAt: new Date().toISOString() },
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
      charts: {
        revenueByDay,
        newStudentsByDay,
      },
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
