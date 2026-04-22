import { Injectable, Logger } from '@nestjs/common';
import { Q10ClientService } from '../q10-client.service';
import {
  cleanStr,
  currentlyActivePeriods,
  groupSum,
  isoDate,
  Item,
  monthKey,
  parseDate,
  periodKey,
  safeArray,
  studentFullName,
  sum,
} from './helpers';

@Injectable()
export class FinancialService {
  private readonly logger = new Logger(FinancialService.name);

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
      this.logger.warn(`[financial] ${path} failed: ${message}`);
      return [];
    }
  }

  /**
   * Financial deep-dive. All sums use the field names this Q10 plan
   * actually returns (Valor_pagado / Valor_saldo, verified live), not the
   * generic `Valor` that the doc hints at.
   *
   * /estadocuentaestudiantes is NOT called — this tenant rejects it with
   * "no aplica al modelo financiero correspondiente". Reconciliation is
   * done by intersecting /pagos.Codigo_persona with /estudiantes
   * .Codigo_estudiante (both are the same 12-digit internal person code).
   */
  async financial(monthsBack = 12) {
    const errors: Record<string, string> = {};
    const degraded: Record<string, string> = {};

    const now = new Date();
    const rangeStart = new Date(now);
    rangeStart.setMonth(rangeStart.getMonth() - monthsBack);

    const [periodos, pagos] = await Promise.all([
      this.tryFetch<Item>('periods', '/periodos', errors),
      this.tryFetch<Item>('payments', '/pagos', errors, {
        Fecha_inicio: isoDate(rangeStart),
        Fecha_fin: isoDate(now),
      }),
    ]);

    const active = currentlyActivePeriods(periodos);
    let currentStudents: Item[] = [];
    let pending: Item[] = [];

    if (active.length > 0) {
      const [sl, pl] = await Promise.all([
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
      const seen = new Set<string>();
      for (const list of sl) {
        for (const s of list) {
          const id = cleanStr(s.Codigo_estudiante);
          if (id && !seen.has(id)) { seen.add(id); currentStudents.push(s); }
        }
      }
      pending = pl.flat();
    } else {
      degraded.pending = 'Sin períodos activos';
    }

    // ─── MRR monthly trend ───
    const revenueByMonth: Record<string, number> = {};
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      revenueByMonth[monthKey(d)] = 0;
    }
    for (const p of pagos) {
      const d = parseDate(p.Fecha_pago);
      if (!d) continue;
      const k = monthKey(d);
      if (k in revenueByMonth) {
        revenueByMonth[k] += Number(p.Valor_pagado) || 0;
      }
    }
    const revenueSeries = Object.entries(revenueByMonth).map(([month, value]) => ({
      month,
      value,
    }));
    const totalRevenue = sum(pagos, 'Valor_pagado');

    // ─── Ticket + LTV approximation (revenue-per-paying-person) ───
    const revenuePerPerson: Record<string, number> = {};
    for (const p of pagos) {
      const k = cleanStr(p.Codigo_persona);
      if (!k) continue;
      revenuePerPerson[k] = (revenuePerPerson[k] ?? 0) + (Number(p.Valor_pagado) || 0);
    }
    const payingTotals = Object.values(revenuePerPerson);
    const avgTicket = payingTotals.length > 0
      ? totalRevenue / payingTotals.length
      : 0;
    const ltvApprox = payingTotals.length > 0
      ? payingTotals.reduce((a, b) => a + b, 0) / payingTotals.length
      : 0;
    const maxPaid = payingTotals.length > 0 ? Math.max(...payingTotals) : 0;

    // ─── Debt + reconciliation ───
    const outstandingDebt = sum(pending, 'Valor_saldo');
    const currentStudentIds = new Set(
      currentStudents.map((s) => cleanStr(s.Codigo_estudiante)).filter(Boolean),
    );
    const inadCodes = new Set<string>();
    for (const p of pending) {
      const c = cleanStr(p.Estudiante?.Codigo_persona);
      if (c) inadCodes.add(c);
    }
    const activeWithDebt = [...inadCodes].filter((c) => currentStudentIds.has(c)).length;
    const inadimplenciaRate = currentStudentIds.size > 0
      ? Math.round((activeWithDebt / currentStudentIds.size) * 100)
      : null;

    // ─── Projection ───
    const projectedThisPeriod = sum(pending, 'Valor_total');
    const paidThisPeriod = sum(pending, 'Valor_pagado');
    const projectionRate = projectedThisPeriod > 0
      ? Math.round((paidThisPeriod / projectedThisPeriod) * 100)
      : null;

    // ─── Drill-downs ───
    const topDebtors = pending
      .slice()
      .sort((a, b) => (Number(b.Valor_saldo) || 0) - (Number(a.Valor_saldo) || 0))
      .slice(0, 15)
      .map((p) => ({
        estudiante: studentFullName(p.Estudiante ?? {}) || '—',
        codigoPersona: cleanStr(p.Estudiante?.Codigo_persona),
        concepto: cleanStr(p.Nombre_producto),
        periodo: cleanStr(p.Nombre_periodo),
        saldo: Number(p.Valor_saldo) || 0,
        total: Number(p.Valor_total) || 0,
        pagado: Number(p.Valor_pagado) || 0,
      }));

    const revenueByConcept = groupSum(pagos, (p) =>
      cleanStr(p.Nombre_programa) || 'Sin programa',
      'Valor_pagado',
    );

    const recentPayments = pagos
      .slice()
      .sort((a, b) => {
        const da = parseDate(a.Fecha_pago)?.getTime() ?? 0;
        const db = parseDate(b.Fecha_pago)?.getTime() ?? 0;
        return db - da;
      })
      .slice(0, 15)
      .map((p) => ({
        fecha: cleanStr(p.Fecha_pago).slice(0, 10),
        estudiante: cleanStr(p.Nombre_estudiante),
        identificacion: cleanStr(p.Identificacion_estudiante),
        valor: Number(p.Valor_pagado) || 0,
        recibo: cleanStr(p.Numero_recibo_pago),
      }));

    return {
      generatedAt: new Date().toISOString(),
      partial: Object.keys(errors).length > 0,
      errors,
      degraded,
      summary: {
        monthsBack,
        totalRevenue,
        outstandingDebt,
        payingStudents: payingTotals.length,
        activeWithDebt,
        inadimplenciaRate,
        projectionRate,
        avgTicket: Math.round(avgTicket * 100) / 100,
        ltvApprox: Math.round(ltvApprox * 100) / 100,
        maxPaid,
      },
      charts: {
        revenueByMonth: revenueSeries,
        revenueByConcept,
      },
      tables: {
        topDebtors,
        recentPayments,
      },
    };
  }
}
