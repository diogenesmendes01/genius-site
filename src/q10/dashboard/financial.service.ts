import { Injectable } from '@nestjs/common';
import { Q10ClientService } from '../q10-client.service';
import { DashboardBaseService } from './dashboard-base.service';
import {
  classifyModality,
  classifyProduct,
  cleanStr,
  currentlyActivePeriods,
  groupSum,
  isoDate,
  Item,
  Modality,
  MONTHS_PER_LEVEL,
  monthKey,
  parseDate,
  periodKey,
  studentFullName,
  sum,
} from './helpers';

// Full-course LTV horizon: a student progressing A1 → C1 goes through 5
// levels. Multiply by months-per-level (3 Regular / 1.5 Semi Intensivo)
// to get the expected student lifetime in months. C2 is not offered at
// this tenant (confirmed via /niveles probe).
const CEFR_LEVELS_TO_COMPLETE = 5;

@Injectable()
export class FinancialService extends DashboardBaseService {
  protected readonly logPrefix = 'financial';

  constructor(q10: Q10ClientService) {
    super(q10);
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
   *
   * `from`/`to` are optional ISO dates — when provided, they override the
   * `monthsBack` preset. The dashboard's date picker (Hoy / Últimos 7 /
   * Este mes / fecha seleccionada) sends them straight through.
   */
  async financial(monthsBack = 12, from?: string, to?: string) {
    const errors: Record<string, string> = {};
    const degraded: Record<string, string> = {};

    const now = to ? (parseDate(to) ?? new Date()) : new Date();
    const parsedFrom = from ? parseDate(from) : null;
    const rangeStart = parsedFrom ?? (() => {
      const d = new Date(now);
      d.setMonth(d.getMonth() - monthsBack);
      return d;
    })();

    // `windowMonths` drives how many MRR buckets we emit. When the caller
    // passes an explicit `from`, we recompute from the actual span; otherwise
    // we keep `monthsBack` verbatim so the bucket count matches the request
    // exactly (the e2e test asserts `months=6` → 6 buckets).
    const windowMonths = parsedFrom
      ? Math.max(
          1,
          ((now.getFullYear() - rangeStart.getFullYear()) * 12 +
            (now.getMonth() - rangeStart.getMonth())) + 1,
        )
      : monthsBack;

    // Cap /pagos at 20k: payment rows grow unbounded over long date ranges.
    const [periodos, pagos] = await Promise.all([
      this.tryFetch<Item>('periods', '/periodos', errors),
      this.tryFetch<Item>(
        'payments',
        '/pagos',
        errors,
        {
          Fecha_inicio: isoDate(rangeStart),
          Fecha_fin: isoDate(now),
        },
        { maxRecords: 20_000, degraded },
      ),
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
    for (let i = windowMonths - 1; i >= 0; i--) {
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

    // ─── Ticket (revenue-per-paying-person, filtering voided rows) ───
    // The debt-decomposition probe (2026-04-22) confirmed Valor_pagado=0 is
    // rare in this tenant — but we still guard so any future voided rows
    // don't inflate the paying-student count.
    const revenuePerPerson: Record<string, number> = {};
    for (const p of pagos) {
      const k = cleanStr(p.Codigo_persona);
      const v = Number(p.Valor_pagado) || 0;
      if (!k || v <= 0) continue;
      revenuePerPerson[k] = (revenuePerPerson[k] ?? 0) + v;
    }
    const payingTotals = Object.values(revenuePerPerson);
    const avgTicket = payingTotals.length > 0
      ? totalRevenue / payingTotals.length
      : 0;
    const maxPaid = payingTotals.length > 0 ? Math.max(...payingTotals) : 0;

    // ─── Real LTV (matrícula + mensalidade × meses_CEFR por modalidade) ───
    // A student following the CEFR path (A1 → C1) goes through 5 levels.
    // The company is young so observational LTV would be biased; we use
    // the contractual expectation instead. Revenue is split by product
    // type — matrícula and mensualidade — using classifyProduct(), which
    // handles the pt/es name drift revealed by the 2026-04-22 probe
    // ("Mensalidade $75", "Nivel Regular", custom names like "Adriana 1"
    // all collapse to mensualidad).
    let matriculaSum = 0;
    let matriculaCount = 0;
    let mensualidadSum = 0;
    let mensualidadCount = 0;
    for (const p of pagos) {
      const v = Number(p.Valor_pagado) || 0;
      if (v <= 0) continue;
      const t = classifyProduct(p.Nombre_producto);
      if (t === 'matricula') {
        matriculaSum += v;
        matriculaCount += 1;
      } else if (t === 'mensualidad') {
        mensualidadSum += v;
        mensualidadCount += 1;
      }
    }
    const avgMatricula = matriculaCount > 0 ? matriculaSum / matriculaCount : 0;
    const avgMensualidad = mensualidadCount > 0 ? mensualidadSum / mensualidadCount : 0;
    const ltvByModality: Record<Exclude<Modality, 'Desconocida'>, number> = {
      Regular: avgMatricula + avgMensualidad * (MONTHS_PER_LEVEL.Regular * CEFR_LEVELS_TO_COMPLETE),
      'Semi Intensivo':
        avgMatricula + avgMensualidad * (MONTHS_PER_LEVEL['Semi Intensivo'] * CEFR_LEVELS_TO_COMPLETE),
    };
    // Headline LTV — weighted by the number of distinct paying persons per
    // modality (not a flat 50/50 average) so an imbalanced student mix
    // doesn't skew the KPI. Payer modality comes from the payment's
    // Nombre_producto: a person is Regular if the majority of their paid
    // volume falls in Regular-tagged products, Semi Intensivo otherwise.
    // Desconocida-only payers fall back to the flat average so they still
    // contribute — with "Nivel Regular" and other mis-tagged names the
    // classifier already folds them into one of the real modalities.
    const modalityByPerson: Record<string, { reg: number; int: number }> = {};
    for (const p of pagos) {
      const v = Number(p.Valor_pagado) || 0;
      if (v <= 0) continue;
      const k = cleanStr(p.Codigo_persona);
      if (!k) continue;
      const label = cleanStr(p.Nombre_producto) || cleanStr(p.Nombre_programa);
      const m = classifyModality(label);
      if (m === 'Desconocida') continue;
      if (!modalityByPerson[k]) modalityByPerson[k] = { reg: 0, int: 0 };
      if (m === 'Regular') modalityByPerson[k].reg += v;
      else modalityByPerson[k].int += v;
    }
    let regCount = 0;
    let intCount = 0;
    for (const { reg, int } of Object.values(modalityByPerson)) {
      if (reg > int) regCount += 1;
      else if (int > 0) intCount += 1;
    }
    const totalWeight = regCount + intCount;
    const ltvEstimated =
      totalWeight > 0
        ? (ltvByModality.Regular * regCount +
            ltvByModality['Semi Intensivo'] * intCount) /
          totalWeight
        : (ltvByModality.Regular + ltvByModality['Semi Intensivo']) / 2;

    // ─── Debt reconciliation (filter ghost proposals) ───
    // /pagosPendientes includes rows for enrollment proposals that were
    // never paid ("matrícula fantasma"). The 2026-04-22 probe showed
    // ~47% of the raw debt total is from people who are neither active
    // students nor ever paid anything. We exclude those so the KPI
    // matches real collectable debt.
    const currentStudentIds = new Set(
      currentStudents.map((s) => cleanStr(s.Codigo_estudiante)).filter(Boolean),
    );
    const paidSomething = new Set(Object.keys(revenuePerPerson));
    const realDebt = pending.filter((p) => {
      const code = cleanStr(p.Estudiante?.Codigo_persona);
      if (!code) return false;
      return currentStudentIds.has(code) || paidSomething.has(code);
    });
    const outstandingDebt = sum(realDebt, 'Valor_saldo');
    const inadCodes = new Set<string>();
    for (const p of realDebt) {
      const c = cleanStr(p.Estudiante?.Codigo_persona);
      if (c) inadCodes.add(c);
    }
    const activeWithDebt = [...inadCodes].filter((c) => currentStudentIds.has(c)).length;
    const debtorsTotal = inadCodes.size;
    const ghostDebt = sum(pending, 'Valor_saldo') - outstandingDebt;
    const inadimplenciaRate = currentStudentIds.size > 0
      ? Math.round((activeWithDebt / currentStudentIds.size) * 100)
      : null;

    // ─── Projection (uses realDebt so proposals don't skew the rate) ───
    const projectedThisPeriod = sum(realDebt, 'Valor_total');
    const paidThisPeriod = sum(realDebt, 'Valor_pagado');
    const projectionRate = projectedThisPeriod > 0
      ? Math.round((paidThisPeriod / projectedThisPeriod) * 100)
      : null;

    // ─── Drill-downs (realDebt, not raw pending) ───
    const topDebtors = realDebt
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
      cleanStr(p.Nombre_producto) || 'Sin concepto',
      'Valor_pagado',
    );

    // ─── Revenue segmented by modality (Regular / Semi Intensivo) ───
    // /pagos doesn't carry Nombre_curso, but it does carry Nombre_producto
    // which is shaped like "Mensualidad 14 R - Recife". classifyModality()
    // handles both shapes (product name or course name) since the pattern
    // is identical. Payments whose product doesn't match land in
    // "Desconocida" — useful to spot concepts like "Matrícula" that are
    // modality-agnostic.
    const revenueByModality: Record<Modality, number> = {
      Regular: 0,
      'Semi Intensivo': 0,
      Desconocida: 0,
    };
    for (const p of pagos) {
      const label = cleanStr(p.Nombre_producto) || cleanStr(p.Nombre_programa);
      const m = classifyModality(label);
      revenueByModality[m] += Number(p.Valor_pagado) || 0;
    }

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
      // Data-scope advisory — surfaced by the UI as an info banner so the
      // operator doesn't read these KPIs as a full-company picture while
      // the Costa Rica payments are still being backfilled into the ERP.
      // Drop this once the admin team confirms full coverage.
      scopeNotice: {
        level: 'info',
        title: 'Alcance financiero parcial',
        message:
          'Los pagos de Costa Rica todavía no están registrados en el ERP. Los KPIs financieros reflejan solo la sede Panamá hasta que el equipo administrativo complete la carga retroactiva.',
      },
      summary: {
        monthsBack,
        windowMonths,
        from: isoDate(rangeStart),
        to: isoDate(now),
        totalRevenue,
        outstandingDebt,
        ghostDebt: Math.round(ghostDebt * 100) / 100,
        debtorsTotal,
        payingStudents: payingTotals.length,
        activeWithDebt,
        inadimplenciaRate,
        projectionRate,
        avgTicket: Math.round(avgTicket * 100) / 100,
        avgMatricula: Math.round(avgMatricula * 100) / 100,
        avgMensualidad: Math.round(avgMensualidad * 100) / 100,
        ltvEstimated: Math.round(ltvEstimated * 100) / 100,
        ltvRegular: Math.round(ltvByModality.Regular * 100) / 100,
        ltvIntensivo: Math.round(ltvByModality['Semi Intensivo'] * 100) / 100,
        maxPaid,
        revenueRegular: revenueByModality.Regular,
        revenueIntensivo: revenueByModality['Semi Intensivo'],
        revenueUnclassified: revenueByModality.Desconocida,
      },
      charts: {
        revenueByMonth: revenueSeries,
        revenueByConcept,
        revenueByModality,
      },
      tables: {
        topDebtors,
        recentPayments,
      },
    };
  }
}
