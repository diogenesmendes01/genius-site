#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Quick follow-up: what's actually in the "otro" bucket of /pagosPendientes?
 * Lists distinct Nombre_producto values with totals so we can see what
 * product types are hidden behind the "$646 otro in active debtors" finding.
 */

'use strict';

const fs = require('fs');
const path = require('path');

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
} catch (_) {}

const API_KEY = process.env.Q10_API_KEY || '';
const BASE_URL = (process.env.Q10_BASE_URL || 'https://api.q10.com/v1').replace(/\/$/, '');

async function httpGet(url) {
  const r = await fetch(url, { method: 'GET', headers: { 'Api-Key': API_KEY, 'Accept': 'application/json' } });
  const t = await r.text();
  try { return { body: JSON.parse(t), status: r.status }; } catch { return { body: null, status: r.status }; }
}

function buildUrl(p, params) {
  const url = new URL(BASE_URL + p);
  for (const [k, v] of Object.entries({ Limit: 500, Offset: 1, ...(params || {}) })) {
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function classify(nombre) {
  const n = (nombre || '').toLowerCase();
  if (n.includes('matr')) return 'matricula';
  if (n.includes('mensual')) return 'mensualidad';
  return 'otro';
}

function isActivo(e) {
  return e === true || e === 1 || (typeof e === 'string' && ['activo', 'true', '1', 'abierto'].includes(e.toLowerCase()));
}

(async () => {
  // Fetch periods + active
  const periodosResp = await httpGet(buildUrl('/periodos'));
  const periodos = Array.isArray(periodosResp.body) ? periodosResp.body : [];
  const activos = periodos.filter((p) => isActivo(p.Estado));

  // Collect pending across active periods
  const pending = [];
  for (const p of activos) {
    const r = await httpGet(buildUrl('/pagosPendientes', { Consecutivo_periodo: p.Consecutivo }));
    const arr = Array.isArray(r.body) ? r.body : [];
    pending.push(...arr);
  }

  // Group by Nombre_producto → show count + total saldo
  const groups = {};
  for (const rec of pending) {
    const name = String(rec.Nombre_producto || '(sem nome)').trim();
    const cls = classify(name);
    const saldo = Number(rec.Valor_saldo) || 0;
    if (!groups[name]) groups[name] = { count: 0, total: 0, cls };
    groups[name].count += 1;
    groups[name].total += saldo;
  }

  const sorted = Object.entries(groups).sort(([, a], [, b]) => b.total - a.total);

  console.log('\n═══════ Distinct Nombre_producto em /pagosPendientes ═══════\n');
  console.log('Classe        | Qtd | Total($)  | Produto');
  console.log('──────────────┼─────┼───────────┼────────────────────────────');
  for (const [name, g] of sorted) {
    const avg = g.total / g.count;
    console.log(
      `${g.cls.padEnd(13)} | ${String(g.count).padStart(3)} | ${g.total.toFixed(2).padStart(9)} | ${name}  (avg $${avg.toFixed(2)})`,
    );
  }
  console.log('');

  // Summary by class
  const byClass = {};
  for (const [, g] of sorted) {
    byClass[g.cls] = byClass[g.cls] || { count: 0, total: 0 };
    byClass[g.cls].count += g.count;
    byClass[g.cls].total += g.total;
  }
  console.log('─── Totais por classe ───');
  for (const [cls, v] of Object.entries(byClass)) {
    console.log(`  ${cls.padEnd(13)}: ${v.count} regs | $${v.total.toFixed(2)}`);
  }
})();
