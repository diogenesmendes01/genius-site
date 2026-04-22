#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Q10 Jack API probe — phase 3 (hypothesis-driven).
 *
 * Follow-up to phases 1 & 2. Phase 3 chases specific open questions the
 * earlier probes couldn't answer:
 *
 *   1. Is /pagos.Codigo_programa ever populated? (phase 1 saw 100% null
 *      in sample; phase 2 used a student with zero pagos so inconclusive.)
 *      Fix: seed Codigo_persona DIRECTLY from /pagos, not /estudiantes.
 *   2. Does /administrativos/{id} work when {id} is Numero_identificacion
 *      instead of Codigo? (Phase 2 got 404 using Codigo.)
 *   3. Do multi-filter queries chain correctly? (Estado + periodo, etc.)
 *   4. How does Q10 respond to malformed inputs? (error taxonomy exploration)
 *   5. What are the pagination boundaries? (Limit ceiling, Offset=0, huge
 *      offsets)
 *   6. Does /oportunidades accept filters other than Fecha_inicio/Fecha_fin?
 *
 * GET-only. Rate-limited. PII redacted.
 *
 * Run:  Q10_API_KEY=<key> node scripts/q10-probe-phase3.js
 * Dry:  node scripts/q10-probe-phase3.js --dry-run
 *
 * Output: $Q10_PROBE_OUTPUT_DIR/phase3 (default ./probe-output/phase3).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────

const API_KEY = process.env.Q10_API_KEY || '';
const BASE_URL = (process.env.Q10_BASE_URL || 'https://api.q10.com/v1').replace(/\/$/, '');
const ROOT_OUT = process.env.Q10_PROBE_OUTPUT_DIR || path.join(process.cwd(), 'probe-output');
const OUT_DIR = path.join(ROOT_OUT, 'phase3');
const DELAY_MS = Number(process.env.Q10_PROBE_DELAY_MS || 250);
const DRY_RUN = process.argv.includes('--dry-run');

if (!API_KEY && !DRY_RUN) {
  console.error('Q10_API_KEY is required (or pass --dry-run).');
  process.exit(1);
}

// ─── PII redaction (same keys as phases 1-2, kept inline so script stays standalone)

const PII_KEYS = new Set([
  'Nombre', 'Nombres', 'Nombre_completo',
  'Primer_nombre', 'Segundo_nombre',
  'Apellido', 'Apellidos', 'Primer_apellido', 'Segundo_apellido',
  'Email', 'Correo', 'Correo_electronico',
  'Celular', 'Telefono', 'Fijo', 'Movil',
  'Identificacion', 'Documento', 'Pasaporte', 'Cedula',
  'Direccion', 'Barrio', 'Ciudad', 'Municipio', 'Departamento',
  'Fecha_nacimiento', 'Contraseña', 'Password',
  'Nombre_estudiante', 'Identificacion_estudiante',
  'Nombre_docente', 'Nombre_producto',
]);

function redact(v) {
  if (v == null) return v;
  if (typeof v === 'string') return v ? '<redacted>' : '';
  if (typeof v === 'number') return 0;
  return v;
}

function redactObject(obj) {
  if (Array.isArray(obj)) return obj.map(redactObject);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (PII_KEYS.has(k)) out[k] = redact(v);
      else if (v && typeof v === 'object') out[k] = redactObject(v);
      else out[k] = v;
    }
    return out;
  }
  return obj;
}

function partialId(id) {
  if (!id || typeof id !== 'string') return id;
  return id.length > 6 ? id.slice(0, 6) + '...' : id;
}

// ─── HTTP helper (GET-ONLY — never mutates) ───────────────────────────────

async function httpGet(fullUrl) {
  // Never HTTP mutate — this is a READ-ONLY probe. Method is hardcoded.
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
  const full = { Limit: 5, Offset: 1, ...(params || {}) };
  for (const [k, v] of Object.entries(full)) url.searchParams.set(k, String(v));
  return url.toString();
}

// ─── Envelope + shape inference ───────────────────────────────────────────

function envelopeOf(body) {
  if (Array.isArray(body)) return { type: 'array', records: body };
  if (body && typeof body === 'object') {
    for (const k of ['items', 'data', 'results', 'list', 'records']) {
      if (Array.isArray(body[k])) return { type: `wrapped:${k}`, records: body[k] };
    }
    if (body.error || body.message || body.Error) return { type: 'error', records: [], errorBody: body };
    return { type: 'object', records: [body] };
  }
  return { type: 'empty', records: [] };
}

function inferType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'object') return 'object';
  return typeof v;
}

function analyzeRecords(records) {
  const fields = {};
  for (const rec of records) {
    if (!rec || typeof rec !== 'object') continue;
    for (const [k, v] of Object.entries(rec)) {
      if (!fields[k]) fields[k] = { types: new Set(), nullCount: 0, enumValues: new Set() };
      fields[k].types.add(inferType(v));
      if (v == null) fields[k].nullCount++;
      if (!PII_KEYS.has(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
        if (fields[k].enumValues.size < 10) fields[k].enumValues.add(String(v));
      }
    }
  }
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = {
      types: [...v.types].sort(),
      nullCount: v.nullCount,
      enumValues: [...v.enumValues].sort(),
    };
  }
  return out;
}

const sleep = () => new Promise((res) => setTimeout(res, DELAY_MS));

// ─── Smart seed collection ────────────────────────────────────────────────
//
// Phase 2 seeded from /estudiantes and picked a student with zero pagos, so
// the /pagos?Codigo_persona hypothesis couldn't be tested. Phase 3 seeds
// DIRECTLY from /pagos — the Codigo_persona of a record there is by
// definition a person who has paid.

async function collectSeeds() {
  const seeds = {
    payingCodigoPersona: null,      // from /pagos — guaranteed to have payments
    administrativoCodigo: null,     // from /administrativos
    administrativoNumeroId: null,   // same admin's Numero_identificacion (for detail retest)
    periodoId: null,
    asesorNumeroId: null,           // Numero_identificacion_asesor from /oportunidades
  };

  if (DRY_RUN) {
    console.log('(dry-run) seeds would be pulled from /pagos, /administrativos, /periodos, /oportunidades');
    return seeds;
  }

  console.log('Collecting seeds...');

  // /periodos first — needed for subsequent probes
  let r = await httpGet(buildUrl('/periodos'));
  let env = envelopeOf(r.body);
  if (env.records[0]) {
    seeds.periodoId = env.records[0].Consecutivo;
    console.log(`  periodoId: ${seeds.periodoId}`);
  } else {
    console.log('  periodoId: MISS');
  }
  await sleep();

  // /pagos — grab Codigo_persona of first record (someone who pays)
  r = await httpGet(buildUrl('/pagos', { Fecha_inicio: '2024-01-01', Fecha_fin: '2030-12-31' }));
  env = envelopeOf(r.body);
  if (env.records[0]) {
    seeds.payingCodigoPersona = env.records[0].Codigo_persona;
    console.log(`  payingCodigoPersona: ${partialId(seeds.payingCodigoPersona)}`);
  } else {
    console.log('  payingCodigoPersona: MISS');
  }
  await sleep();

  // /administrativos — grab both Codigo AND Numero_identificacion so we
  // can test the detail-endpoint hypothesis with both values.
  r = await httpGet(buildUrl('/administrativos'));
  env = envelopeOf(r.body);
  if (env.records[0]) {
    seeds.administrativoCodigo = env.records[0].Codigo;
    seeds.administrativoNumeroId = env.records[0].Numero_identificacion;
    console.log(`  administrativoCodigo: ${partialId(seeds.administrativoCodigo)}`);
    console.log(`  administrativoNumeroId: ${seeds.administrativoNumeroId}`);
  } else {
    console.log('  administrativo seeds: MISS');
  }
  await sleep();

  // /oportunidades — grab asesor Numero_identificacion for filter probes
  r = await httpGet(buildUrl('/oportunidades', { Fecha_inicio: '2024-01-01', Fecha_fin: '2030-12-31' }));
  env = envelopeOf(r.body);
  if (env.records[0]) {
    seeds.asesorNumeroId = env.records[0].Numero_identificacion_asesor;
    console.log(`  asesorNumeroId: ${seeds.asesorNumeroId}`);
  } else {
    console.log('  asesorNumeroId: MISS');
  }
  await sleep();

  return seeds;
}

// ─── Probe plan ───────────────────────────────────────────────────────────

function planProbes(seeds) {
  const plan = [];

  // A) THE big hypothesis — Codigo_programa populated when filtering by paying person
  if (seeds.payingCodigoPersona) {
    plan.push({
      group: 'hypothesis_pagos_programa',
      label: 'pagos?Codigo_persona=<paying>',
      url: buildUrl('/pagos', {
        Fecha_inicio: '2024-01-01',
        Fecha_fin: '2030-12-31',
        Codigo_persona: seeds.payingCodigoPersona,
      }),
      note: 'Phase-1 showed Codigo_programa 100% null. Test with a person we KNOW has pagos.',
    });
  }

  // B) /administrativos detail — try Numero_identificacion instead of Codigo
  if (seeds.administrativoCodigo) {
    plan.push({
      group: 'administrativos_detail',
      label: 'administrativos/{Codigo}',
      url: `${BASE_URL}/administrativos/${encodeURIComponent(seeds.administrativoCodigo)}`,
      note: 'Phase 2 control — we know this 404s.',
    });
  }
  if (seeds.administrativoNumeroId) {
    plan.push({
      group: 'administrativos_detail',
      label: 'administrativos/{Numero_identificacion}',
      url: `${BASE_URL}/administrativos/${encodeURIComponent(seeds.administrativoNumeroId)}`,
      note: 'Hypothesis: detail expects Numero_identificacion, not Codigo.',
    });
    plan.push({
      group: 'administrativos_detail',
      label: 'administrativos/identificacion/{numero}',
      url: `${BASE_URL}/administrativos/identificacion/${encodeURIComponent(seeds.administrativoNumeroId)}`,
      note: 'Alternative path hypothesis.',
    });
  }

  // C) Multi-filter chaining — do they compose correctly?
  plan.push({
    group: 'filter_chaining',
    label: 'cursos?Estado=Abierto&Consecutivo_periodo=<p>',
    url: buildUrl('/cursos', { Estado: 'Abierto', Consecutivo_periodo: seeds.periodoId ?? 2 }),
    note: 'Does Estado + periodo chain?',
  });
  plan.push({
    group: 'filter_chaining',
    label: 'evaluaciones?Programa=01&Consecutivo_periodo=<p>',
    url: buildUrl('/evaluaciones', { Programa: '01', Consecutivo_periodo: seeds.periodoId ?? 2 }),
    note: 'Does Programa + periodo chain?',
  });
  if (seeds.payingCodigoPersona) {
    plan.push({
      group: 'filter_chaining',
      label: 'evaluaciones?Programa=01&Codigo_estudiante=<id>',
      url: buildUrl('/evaluaciones', { Programa: '01', Codigo_estudiante: seeds.payingCodigoPersona }),
      note: 'Single-student evaluaciones query (using paying person as proxy — may not be a student).',
    });
  }
  plan.push({
    group: 'filter_chaining',
    label: 'cursos?Codigo_programa=01',
    url: buildUrl('/cursos', { Codigo_programa: '01' }),
    note: 'Filter cursos by programa explicitly.',
  });

  // D) Error pattern probes — malformed inputs
  plan.push({
    group: 'error_patterns',
    label: 'niveles?Estado=invalid',
    url: buildUrl('/niveles', { Estado: 'invalid' }),
    note: 'What does Q10 say to a non-boolean?',
  });
  plan.push({
    group: 'error_patterns',
    label: 'pagos?Fecha_inicio=not-a-date',
    url: buildUrl('/pagos', { Fecha_inicio: 'not-a-date', Fecha_fin: '2030-12-31' }),
    note: 'Malformed date — what error?',
  });
  plan.push({
    group: 'error_patterns',
    label: 'cursos?Estado=Activo',
    url: buildUrl('/cursos', { Estado: 'Activo' }),
    note: '/cursos uses "Abierto", but does "Activo" silently return empty or reject?',
  });
  plan.push({
    group: 'error_patterns',
    label: 'cursos?Estado=Abierta',
    url: buildUrl('/cursos', { Estado: 'Abierta' }),
    note: 'Feminine variant — case/gender sensitive?',
  });
  plan.push({
    group: 'error_patterns',
    label: 'pagos (backwards dates)',
    url: buildUrl('/pagos', { Fecha_inicio: '2030-01-01', Fecha_fin: '2024-01-01' }),
    note: 'fin before inicio — Q10 swaps them, errors, or returns empty?',
  });

  // E) Pagination boundaries
  plan.push({
    group: 'pagination',
    label: 'cursos?Limit=1000',
    url: buildUrl('/cursos', { Limit: 1000 }),
    note: 'Does Q10 honor large Limit or silently cap?',
  });
  plan.push({
    group: 'pagination',
    label: 'cursos?Offset=0',
    url: buildUrl('/cursos', { Offset: 0 }),
    note: 'Phase 1 used Offset=1 (per WhatsApp plugin hint). Does 0 work or error?',
  });
  plan.push({
    group: 'pagination',
    label: 'cursos?Offset=999999',
    url: buildUrl('/cursos', { Offset: 999999 }),
    note: 'Does huge offset 404/empty?',
  });

  // F) /oportunidades filter discovery
  plan.push({
    group: 'oportunidades_filters',
    label: 'oportunidades?Estado=Ganada',
    url: buildUrl('/oportunidades', { Fecha_inicio: '2024-01-01', Fecha_fin: '2030-12-31', Estado: 'Ganada' }),
    note: 'Filter by funnel state — with dates required.',
  });
  plan.push({
    group: 'oportunidades_filters',
    label: 'oportunidades?Descripcion_como_se_entero=Facebook',
    url: buildUrl('/oportunidades', {
      Fecha_inicio: '2024-01-01',
      Fecha_fin: '2030-12-31',
      Descripcion_como_se_entero: 'Facebook',
    }),
    note: 'Filter by lead origin.',
  });
  if (seeds.asesorNumeroId) {
    plan.push({
      group: 'oportunidades_filters',
      label: 'oportunidades?Numero_identificacion_asesor=<id>',
      url: buildUrl('/oportunidades', {
        Fecha_inicio: '2024-01-01',
        Fecha_fin: '2030-12-31',
        Numero_identificacion_asesor: seeds.asesorNumeroId,
      }),
      note: 'Filter by asesor — useful for per-advisor CRM views.',
    });
  }

  return plan;
}

// ─── Runner ───────────────────────────────────────────────────────────────

async function runProbes(plan) {
  const results = [];
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const tag = `[${i + 1}/${plan.length}]`;
    process.stdout.write(`${tag} ${p.label} ... `);
    if (DRY_RUN) { console.log('(dry-run)'); results.push({ ...p, skipped: true, status: 0, envelope: 'skipped', count: 0, elapsed: 0, fields: {} }); continue; }

    const r = await httpGet(p.url);
    const env = envelopeOf(r.body);
    const fields = analyzeRecords(env.records);
    if (env.records.length > 100) console.log(`\n  ⚠ WARN: ${env.records.length} records — Limit may be ignored.`);

    const rec = {
      group: p.group,
      label: p.label,
      url: p.url,
      note: p.note,
      status: r.status,
      elapsed: r.elapsed,
      envelope: env.type,
      count: env.records.length,
      fields,
      errorBody: env.errorBody,
      sample: redactObject(env.records.slice(0, 2)),
    };

    console.log(`${r.status} ${env.type} (${env.records.length} records, ${r.elapsed}ms)`);
    writeSchema(rec);
    results.push(rec);
    await sleep();
  }
  return results;
}

// ─── Output ───────────────────────────────────────────────────────────────

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function writeSchema(result) {
  const dir = path.join(OUT_DIR, 'schema');
  ensureDir(dir);
  const safe = result.label.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  fs.writeFileSync(path.join(dir, `${safe}.json`), JSON.stringify(result, null, 2));
}

function writeSeeds(seeds) {
  ensureDir(OUT_DIR);
  fs.writeFileSync(path.join(OUT_DIR, 'seeds.json'), JSON.stringify({
    periodoId: seeds.periodoId,
    payingCodigoPersona: partialId(seeds.payingCodigoPersona),
    administrativoCodigo: partialId(seeds.administrativoCodigo),
    administrativoNumeroId: seeds.administrativoNumeroId,
    asesorNumeroId: seeds.asesorNumeroId,
  }, null, 2));
}

function writeSummary(seeds, results) {
  const lines = [];
  lines.push(`# Q10 probe — phase 3 (hypothesis-driven) — ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Base URL: \`${BASE_URL}\``);
  lines.push(`Seeds (redacted): \`${JSON.stringify({
    periodoId: seeds.periodoId,
    payingCodigoPersona: partialId(seeds.payingCodigoPersona),
    administrativoCodigo: partialId(seeds.administrativoCodigo),
    administrativoNumeroId: seeds.administrativoNumeroId,
    asesorNumeroId: seeds.asesorNumeroId,
  })}\``);
  lines.push('');

  const byGroup = {};
  for (const r of results) (byGroup[r.group || 'misc'] = byGroup[r.group || 'misc'] || []).push(r);

  const classify = (r) => {
    if (r.status === 0) return '🌐 network error';
    if (r.status >= 400 && r.status < 500) return '⛔ rejected';
    if (r.status >= 500) return '💥 server error';
    if (r.envelope === 'array' && r.count === 0) return '📭 empty';
    if (r.envelope === 'object') return '📄 detail';
    if (r.envelope === 'array' && r.count > 0) return '✅ ok';
    return '❓ ' + r.envelope;
  };

  for (const [group, list] of Object.entries(byGroup)) {
    lines.push(`## ${group}`);
    lines.push('');
    lines.push('| Endpoint | Status | Envelope | Records | Elapsed | Classification |');
    lines.push('|---|---:|---|---:|---:|---|');
    for (const r of list) {
      lines.push(`| \`${r.label}\` | ${r.status} | ${r.envelope} | ${r.count} | ${r.elapsed}ms | ${classify(r)} |`);
    }
    lines.push('');
  }

  // Per-endpoint details with notes + field tables
  lines.push('## Per-endpoint detail');
  lines.push('');
  for (const r of results) {
    lines.push(`### ${r.label}`);
    lines.push('');
    if (r.note) lines.push(`> **Hypothesis**: ${r.note}`);
    lines.push('');
    lines.push(`- HTTP ${r.status} · envelope \`${r.envelope}\` · ${r.count} records · ${r.elapsed}ms`);
    if (r.errorBody) lines.push(`- Error body: \`${JSON.stringify(r.errorBody).slice(0, 300)}\``);
    lines.push('');
    if (r.fields && Object.keys(r.fields).length > 0) {
      lines.push('| Field | Types | null% | Enum / sample |');
      lines.push('|---|---|---:|---|');
      for (const [name, info] of Object.entries(r.fields)) {
        const nullPct = r.count > 0 ? Math.round((info.nullCount / r.count) * 100) : 0;
        const enumRepr = info.enumValues.length > 0 && info.enumValues.length <= 10
          ? info.enumValues.map((v) => `\`${v}\``).join(', ')
          : (info.enumValues.length > 10 ? `<${info.enumValues.length}+ distinct>` : '—');
        lines.push(`| ${name} | ${info.types.join(', ')} | ${nullPct}% | ${enumRepr} |`);
      }
      lines.push('');
    }
  }

  ensureDir(OUT_DIR);
  fs.writeFileSync(path.join(OUT_DIR, 'SUMMARY.md'), lines.join('\n'));
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  ensureDir(OUT_DIR);
  console.log(`Q10 probe phase 3 → ${OUT_DIR}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(DRY_RUN ? '(dry-run — no HTTP calls will be made)' : '');

  const seeds = await collectSeeds();
  if (!DRY_RUN) writeSeeds(seeds);

  const plan = planProbes(seeds);
  console.log(`\nPlanned probes: ${plan.length}`);
  if (DRY_RUN) {
    for (const p of plan) console.log(`  - [${p.group}] ${p.label}`);
    console.log('\n(dry-run — no HTTP, no output files).');
    return;
  }

  const results = await runProbes(plan);
  writeSummary(seeds, results);

  console.log('');
  console.log(`Summary: ${path.join(OUT_DIR, 'SUMMARY.md')}`);
  console.log(`Schemas: ${path.join(OUT_DIR, 'schema/')}`);
  console.log(`Seeds:   ${path.join(OUT_DIR, 'seeds.json')}`);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
