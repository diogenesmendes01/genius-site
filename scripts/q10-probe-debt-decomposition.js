#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Q10 Jack API probe — debt decomposition.
 *
 * Goal: verify empirically whether the R$ 7.567,95 "outstanding debt" in the
 * dashboard is contaminated by unpaid enrollment proposals (matrícula que a
 * pessoa nunca pagou, logo nunca virou aluno) vs real debt from active
 * students.
 *
 * Decomposes /pagosPendientes into three buckets:
 *   A) Person IS in /estudiantes of an active period → REAL active debtor
 *   B) Person NOT in /estudiantes but has /pagos > 0 → ex-student w/ residual
 *   C) Person NOT in /estudiantes and no /pagos       → ghost/proposal
 *
 * Also splits each bucket by product (Matrícula vs Mensualidad vs otros).
 *
 * GET-only. PII redacted. No mutations.
 *
 * Run:  Q10_API_KEY=<key> node scripts/q10-probe-debt-decomposition.js
 * Dry:  node scripts/q10-probe-debt-decomposition.js --dry-run
 *
 * Output: $Q10_PROBE_OUTPUT_DIR/debt-decomposition
 *         (default ./probe-output/debt-decomposition)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Load .env if present (so you can just run node ... without env prefix)
try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) {
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        process.env[m[1]] = v;
      }
    }
  }
} catch (_) { /* ignore */ }

// ─── Config ────────────────────────────────────────────────────────────────

const API_KEY = process.env.Q10_API_KEY || '';
const BASE_URL = (process.env.Q10_BASE_URL || 'https://api.q10.com/v1').replace(/\/$/, '');
const ROOT_OUT = process.env.Q10_PROBE_OUTPUT_DIR || path.join(process.cwd(), 'probe-output');
const OUT_DIR = path.join(ROOT_OUT, 'debt-decomposition');
const DELAY_MS = Number(process.env.Q10_PROBE_DELAY_MS || 200);
const DRY_RUN = process.argv.includes('--dry-run');

if (!API_KEY && !DRY_RUN) {
  console.error('Q10_API_KEY is required (or pass --dry-run).');
  process.exit(1);
}

// ─── HTTP helper (GET-only) ───────────────────────────────────────────────

async function httpGet(fullUrl) {
  const started = Date.now();
  try {
    const resp = await fetch(fullUrl, {
      method: 'GET',
      headers: { 'Api-Key': API_KEY, 'Accept': 'application/json' },
    });
    const text = await resp.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { _raw: text.slice(0, 200) }; }
    return { status: resp.status, body, elapsed: Date.now() - started };
  } catch (netErr) {
    return { status: 0, body: null, elapsed: Date.now() - started, error: String(netErr) };
  }
}

function buildUrl(p, params) {
  const url = new URL(BASE_URL + p);
  const full = { Limit: 500, Offset: 1, ...(params || {}) };
  for (const [k, v] of Object.entries(full)) url.searchParams.set(k, String(v));
  return url.toString();
}

function envelopeOf(body) {
  if (Array.isArray(body)) return { records: body };
  if (body && typeof body === 'object') {
    for (const k of ['items', 'data', 'results', 'list', 'records']) {
      if (Array.isArray(body[k])) return { records: body[k] };
    }
  }
  return { records: [] };
}

const sleep = () => new Promise((res) => setTimeout(res, DELAY_MS));

async function getAll(urlPath, params) {
  const all = [];
  let offset = 1;
  const pageSize = 500;
  for (let i = 0; i < 50; i++) {
    const r = await httpGet(buildUrl(urlPath, { ...params, Limit: pageSize, Offset: offset }));
    const env = envelopeOf(r.body);
    if (env.records.length === 0) break;
    all.push(...env.records);
    if (env.records.length < pageSize) break;
    offset += pageSize;
    await sleep();
  }
  return all;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function cleanStr(v) {
  if (v == null) return '';
  return String(v).trim();
}

function partialId(id) {
  const s = cleanStr(id);
  if (s.length <= 4) return s;
  return s.slice(0, 2) + '***' + s.slice(-2);
}

function isActivo(estado) {
  if (estado === true || estado === 1) return true;
  if (typeof estado === 'string') {
    const s = estado.toLowerCase();
    return s === 'activo' || s === 'true' || s === '1' || s === 'abierto';
  }
  return false;
}

function classifyProduct(nombre) {
  const n = cleanStr(nombre).toLowerCase();
  if (n.includes('matr')) return 'matricula';
  if (n.includes('mensual')) return 'mensualidad';
  if (n) return 'otro';
  return 'sin_nombre';
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function isoMinusMonths(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('Q10 debt-decomposition probe\n');

  if (DRY_RUN) {
    console.log('(dry-run) would fetch /periodos, /pagos, /estudiantes, /pagosPendientes');
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ── 1. /periodos → find active ones ──
  console.log('Fetching /periodos...');
  let r = await httpGet(buildUrl('/periodos'));
  let env = envelopeOf(r.body);
  const periodos = env.records;
  const activos = periodos.filter((p) => isActivo(p.Estado));
  console.log(`  ${periodos.length} períodos, ${activos.length} activos`);
  await sleep();

  if (activos.length === 0) {
    console.error('No active periods — aborting.');
    return;
  }

  // ── 2. /pagos (last 12 months) ──
  console.log('\nFetching /pagos (12m)...');
  const pagos = await getAll('/pagos', {
    Fecha_inicio: isoMinusMonths(12),
    Fecha_fin: isoToday(),
  });
  console.log(`  ${pagos.length} pagos`);

  // ── 3. /estudiantes + /pagosPendientes (per active period) ──
  const estudiantes = [];
  const pending = [];
  for (const p of activos) {
    const periodoId = p.Consecutivo;
    console.log(`\nPeriodo ${periodoId} (${cleanStr(p.Nombre)})`);

    console.log('  /estudiantes...');
    const sList = await getAll('/estudiantes', { Periodo: periodoId });
    console.log(`    ${sList.length} estudiantes`);
    estudiantes.push(...sList);
    await sleep();

    console.log('  /pagosPendientes...');
    const pList = await getAll('/pagosPendientes', { Consecutivo_periodo: periodoId });
    console.log(`    ${pList.length} pending`);
    pending.push(...pList);
    await sleep();
  }

  // ── 4. Build indexes ──
  const activeStudentIds = new Set(
    estudiantes.map((s) => cleanStr(s.Codigo_estudiante)).filter(Boolean),
  );

  // Distinguish ZERO-value payments (possibly voided) from real payments
  const paidRealIds = new Set();
  const paidAnyIds = new Set();
  for (const p of pagos) {
    const code = cleanStr(p.Codigo_persona);
    if (!code) continue;
    paidAnyIds.add(code);
    if ((Number(p.Valor_pagado) || 0) > 0) paidRealIds.add(code);
  }

  console.log(`\n--- Indexes ---`);
  console.log(`  active students: ${activeStudentIds.size}`);
  console.log(`  distinct persons in /pagos (any): ${paidAnyIds.size}`);
  console.log(`  distinct persons in /pagos (Valor_pagado > 0): ${paidRealIds.size}`);
  console.log(`  inflated by 0-value: ${paidAnyIds.size - paidRealIds.size}`);

  // ── 5. Classify each pending record ──
  const buckets = {
    A_active_debtor: { records: [], label: 'Aluno ativo com dívida' },
    B_ex_student: { records: [], label: 'Ex-aluno (não ativo, mas já pagou algo)' },
    C_ghost: { records: [], label: 'Proposta fantasma (nunca pagou, nem ativo)' },
  };

  for (const rec of pending) {
    const code = cleanStr(rec.Estudiante?.Codigo_persona);
    const isActive = code && activeStudentIds.has(code);
    const hasPaid = code && paidRealIds.has(code);
    if (isActive) buckets.A_active_debtor.records.push(rec);
    else if (hasPaid) buckets.B_ex_student.records.push(rec);
    else buckets.C_ghost.records.push(rec);
  }

  // ── 6. Compute totals by product type ──
  const summary = {};
  for (const [key, b] of Object.entries(buckets)) {
    const byProduct = { matricula: 0, mensualidad: 0, otro: 0, sin_nombre: 0 };
    const byProductCount = { matricula: 0, mensualidad: 0, otro: 0, sin_nombre: 0 };
    const personas = new Set();
    let total = 0;
    for (const rec of b.records) {
      const saldo = Number(rec.Valor_saldo) || 0;
      const type = classifyProduct(rec.Nombre_producto);
      byProduct[type] += saldo;
      byProductCount[type] += 1;
      total += saldo;
      const code = cleanStr(rec.Estudiante?.Codigo_persona);
      if (code) personas.add(code);
    }
    summary[key] = {
      label: b.label,
      records: b.records.length,
      personas: personas.size,
      total,
      byProduct,
      byProductCount,
    };
  }

  // ── 7. Pick suspicious samples from bucket C (ghosts) ──
  const ghostSamples = buckets.C_ghost.records.slice(0, 10).map((rec) => ({
    codigoPersona: partialId(rec.Estudiante?.Codigo_persona),
    producto: cleanStr(rec.Nombre_producto),
    periodo: cleanStr(rec.Nombre_periodo),
    valorSaldo: Number(rec.Valor_saldo) || 0,
    valorTotal: Number(rec.Valor_total) || 0,
    valorPagado: Number(rec.Valor_pagado) || 0,
  }));

  const activeSamples = buckets.A_active_debtor.records
    .slice(0, 5)
    .map((rec) => ({
      codigoPersona: partialId(rec.Estudiante?.Codigo_persona),
      producto: cleanStr(rec.Nombre_producto),
      valorSaldo: Number(rec.Valor_saldo) || 0,
      valorTotal: Number(rec.Valor_total) || 0,
      valorPagado: Number(rec.Valor_pagado) || 0,
    }));

  // ── 8. Report ──
  const totalPending = pending.length;
  const totalSaldo = pending.reduce((a, p) => a + (Number(p.Valor_saldo) || 0), 0);

  const report = {
    generatedAt: new Date().toISOString(),
    input: {
      periodosActivos: activos.length,
      pagos: pagos.length,
      estudiantes: estudiantes.length,
      pagosPendientes: pending.length,
    },
    headline: {
      totalDeudaReportada: totalSaldo,
      totalRegistros: totalPending,
      pagantesInfladosPorZero: paidAnyIds.size - paidRealIds.size,
    },
    buckets: summary,
    samples: {
      ghosts: ghostSamples,
      activeDebtors: activeSamples,
    },
    recommendation: {
      realOutstandingDebt: summary.A_active_debtor.total + summary.B_ex_student.total,
      fakeDebtFromGhosts: summary.C_ghost.total,
      reductionIfGhostsRemoved:
        totalSaldo > 0
          ? Math.round((summary.C_ghost.total / totalSaldo) * 100)
          : 0,
    },
  };

  const reportPath = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // ── 9. Print summary to console ──
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  DEBT DECOMPOSITION RESULT`);
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`Total pending records:    ${totalPending}`);
  console.log(`Total reported debt:      $ ${totalSaldo.toFixed(2)}`);
  console.log(``);
  for (const [key, s] of Object.entries(summary)) {
    const pct = totalSaldo > 0 ? ((s.total / totalSaldo) * 100).toFixed(1) : '0.0';
    console.log(`${key}`);
    console.log(`  ${s.label}`);
    console.log(`  records: ${s.records}  |  personas: ${s.personas}  |  total: $ ${s.total.toFixed(2)} (${pct}%)`);
    console.log(`  por produto:`);
    console.log(`    matrícula:   $ ${s.byProduct.matricula.toFixed(2)} (${s.byProductCount.matricula} reg)`);
    console.log(`    mensualidad: $ ${s.byProduct.mensualidad.toFixed(2)} (${s.byProductCount.mensualidad} reg)`);
    console.log(`    otro:        $ ${s.byProduct.otro.toFixed(2)} (${s.byProductCount.otro} reg)`);
    console.log(`    sin_nombre:  $ ${s.byProduct.sin_nombre.toFixed(2)} (${s.byProductCount.sin_nombre} reg)`);
    console.log(``);
  }
  console.log(`─── Recomendação ───`);
  console.log(`  Dívida real (A+B):        $ ${report.recommendation.realOutstandingDebt.toFixed(2)}`);
  console.log(`  Dívida fantasma (C):      $ ${report.recommendation.fakeDebtFromGhosts.toFixed(2)}`);
  console.log(`  Redução se filtrar:       ${report.recommendation.reductionIfGhostsRemoved}%`);
  console.log(``);
  console.log(`─── Samples de fantasmas (bucket C) ───`);
  for (const g of ghostSamples) {
    console.log(`  [${g.codigoPersona}] ${g.producto} | saldo=$${g.valorSaldo} pagado=$${g.valorPagado}`);
  }
  console.log(``);
  console.log(`Report JSON: ${reportPath}`);
}

main().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});
