#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Q10 Jack API probe — phase 2.
 *
 * Follow-up to scripts/q10-probe.js. Phase 1 mapped which endpoints exist
 * and surfaced HTTP 400s with Spanish error messages revealing required
 * filters. This phase:
 *
 *   1. Seeds IDs from the known-OK endpoints (periodos → estudiante/curso/etc.)
 *   2. Retests the phase-1 400s passing the discovered filter
 *   3. Hits detail endpoints (/resource/{id}) to compare shape vs list
 *   4. Re-probes a handful of hypotheses surfaced by phase 1
 *      (e.g. /pagos with person filter → does Codigo_programa get populated?)
 *
 * GET-only. Never POST/PUT/DELETE. Rate-limited. PII redacted.
 *
 * Run (host):
 *   Q10_API_KEY=<key> node scripts/q10-probe-phase2.js
 *
 * Run (Docker, ephemeral):
 *   docker run --rm \
 *     -e Q10_API_KEY=<key> \
 *     -v "$PWD/scripts:/scripts:ro" \
 *     -v "$PWD/probe-output:/probe-output" \
 *     -w /probe-output \
 *     node:20-slim node /scripts/q10-probe-phase2.js
 *
 * Output goes to $Q10_PROBE_OUTPUT_DIR/phase2 (default ./probe-output/phase2).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────

const API_KEY = process.env.Q10_API_KEY || '';
const BASE_URL = (process.env.Q10_BASE_URL || 'https://api.q10.com/v1').replace(/\/$/, '');
const ROOT_OUT = process.env.Q10_PROBE_OUTPUT_DIR || path.join(process.cwd(), 'probe-output');
const OUT_DIR = path.join(ROOT_OUT, 'phase2');
const PHASE1_SCHEMA_DIR = path.join(ROOT_OUT, 'schema');
const DELAY_MS = Number(process.env.Q10_PROBE_DELAY_MS || 250);
const DRY_RUN = process.argv.includes('--dry-run');

if (!API_KEY && !DRY_RUN) {
  console.error('Q10_API_KEY is required (or pass --dry-run).');
  process.exit(1);
}

// ─── Same PII filter as phase 1 (copied, not imported — scripts stay standalone)

const PII_KEYS = new Set([
  'Nombre', 'Nombres', 'Nombre_completo',
  'Primer_nombre', 'Segundo_nombre',
  'Apellido', 'Apellidos', 'Primer_apellido', 'Segundo_apellido',
  'Email', 'Correo', 'Correo_electronico',
  'Celular', 'Telefono', 'Fijo', 'Movil',
  'Identificacion', 'Documento', 'Pasaporte', 'Cedula',
  'Direccion', 'Barrio', 'Ciudad', 'Municipio', 'Departamento',
  'Fecha_nacimiento',
  'Contraseña', 'Password',
  'Nombre_estudiante', 'Identificacion_estudiante',
  'Nombre_docente', 'Nombre_producto',
]);

function redactObject(obj) {
  if (Array.isArray(obj)) return obj.map(redactObject);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (PII_KEYS.has(k)) out[k] = v == null ? v : (typeof v === 'string' ? '<redacted>' : 0);
      else if (v && typeof v === 'object') out[k] = redactObject(v);
      else out[k] = v;
    }
    return out;
  }
  return obj;
}

// Truncate a 12-digit persona ID to first 6 chars + "..." for safe logging.
function redactPersonaId(id) {
  if (!id || typeof id !== 'string') return id;
  if (id.length <= 6) return id;
  return id.slice(0, 6) + '...';
}

// ─── HTTP helper (NEVER mutates — read-only probe) ────────────────────────
// eslint-disable-next-line no-unused-vars
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

// ─── Envelope + shape inference (compact port of phase 1) ─────────────────

function envelopeOf(body) {
  if (Array.isArray(body)) return { type: 'array', records: body };
  if (body && typeof body === 'object') {
    for (const k of ['items', 'data', 'results', 'list', 'records']) {
      if (Array.isArray(body[k])) return { type: `wrapped:${k}`, records: body[k] };
    }
    // Detail endpoints often return a bare object — wrap it as a 1-record array for analysis.
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

// Load phase-1 field set for a resource so we can diff list vs detail.
function loadPhase1Fields(resource) {
  try {
    const p = path.join(PHASE1_SCHEMA_DIR, `${resource}.json`);
    if (!fs.existsSync(p)) return null;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return j && j.fields ? new Set(Object.keys(j.fields)) : null;
  } catch { return null; }
}

// ─── Seed collection ──────────────────────────────────────────────────────

async function collectSeeds() {
  const seeds = {
    periodoId: null,
    studentId: null,
    cursoId: null,
    docenteId: null,
    administrativoId: null,
  };
  if (DRY_RUN) {
    console.log('(dry-run) seeds would be collected from /periodos, /estudiantes, /cursos, /docentes, /administrativos');
    return seeds;
  }

  const hit = async (label, url, pick) => {
    const r = await httpGet(url);
    const env = envelopeOf(r.body);
    if (r.status >= 200 && r.status < 300 && env.records.length > 0) {
      const value = pick(env.records[0]);
      console.log(`  seed ${label}: ${typeof value === 'string' && value.length > 8 ? redactPersonaId(value) : value}`);
      return value;
    }
    console.log(`  seed ${label}: MISS (status ${r.status}, ${env.type})`);
    return null;
  };

  console.log('Collecting seeds...');
  seeds.periodoId = await hit('periodoId', buildUrl('/periodos'), (r) => r.Consecutivo);
  await sleep();
  if (seeds.periodoId != null) {
    seeds.studentId = await hit(
      'studentId',
      buildUrl('/estudiantes', { Periodo: seeds.periodoId }),
      (r) => r.Codigo_estudiante,
    );
    await sleep();
  }
  seeds.cursoId = await hit('cursoId', buildUrl('/cursos'), (r) => r.Consecutivo);
  await sleep();
  seeds.docenteId = await hit('docenteId', buildUrl('/docentes'), (r) => r.Codigo);
  await sleep();
  seeds.administrativoId = await hit('administrativoId', buildUrl('/administrativos'), (r) => r.Codigo);
  await sleep();
  return seeds;
}

const sleep = () => new Promise((res) => setTimeout(res, DELAY_MS));

// ─── Probe plan (filled with seeds at runtime) ────────────────────────────

function planProbes(seeds) {
  const plan = [];

  // A) Retest the phase-1 400s with the filter we discovered.
  plan.push({ group: 'retest_filters', label: 'niveles?Estado=true', url: buildUrl('/niveles', { Estado: 'true' }) });
  plan.push({ group: 'retest_filters', label: 'niveles?Estado=false', url: buildUrl('/niveles', { Estado: 'false' }) });
  if (seeds.studentId) {
    plan.push({ group: 'retest_filters', label: 'egresos?Codigo_persona=<studentId>', url: buildUrl('/egresos', { Codigo_persona: seeds.studentId }) });
    plan.push({ group: 'retest_filters', label: 'inscripciones?Codigo_persona=<studentId>', url: buildUrl('/inscripciones', { Codigo_persona: seeds.studentId }) });
    plan.push({ group: 'retest_filters', label: 'negocios?Codigo_persona=<studentId>', url: buildUrl('/negocios', { Codigo_persona: seeds.studentId }) });
  }
  if (seeds.periodoId != null) {
    plan.push({ group: 'retest_filters', label: 'inscripciones?Consecutivo_periodo=<periodoId>', url: buildUrl('/inscripciones', { Consecutivo_periodo: seeds.periodoId }) });
  }
  plan.push({ group: 'retest_filters', label: 'negocios?Estado=Ganada', url: buildUrl('/negocios', { Estado: 'Ganada' }) });

  // B) Detail endpoints (list → detail shape comparison).
  if (seeds.studentId && seeds.periodoId != null) {
    plan.push({
      group: 'detail', label: 'estudiantes/{id}',
      url: `${BASE_URL}/estudiantes/${encodeURIComponent(seeds.studentId)}?Periodo=${seeds.periodoId}`,
      resource: 'estudiantes',
    });
  }
  if (seeds.cursoId != null) {
    plan.push({
      group: 'detail', label: 'cursos/{id}',
      url: `${BASE_URL}/cursos/${encodeURIComponent(seeds.cursoId)}`,
      resource: 'cursos',
    });
  }
  if (seeds.docenteId) {
    plan.push({
      group: 'detail', label: 'docentes/{id}',
      url: `${BASE_URL}/docentes/${encodeURIComponent(seeds.docenteId)}`,
      resource: 'docentes',
    });
  }
  if (seeds.periodoId != null) {
    plan.push({
      group: 'detail', label: 'periodos/{id}',
      url: `${BASE_URL}/periodos/${encodeURIComponent(seeds.periodoId)}`,
      resource: 'periodos',
    });
  }
  if (seeds.administrativoId) {
    plan.push({
      group: 'detail', label: 'administrativos/{id}',
      url: `${BASE_URL}/administrativos/${encodeURIComponent(seeds.administrativoId)}`,
      resource: 'administrativos',
    });
  }
  plan.push({ group: 'detail', label: 'programas/01', url: `${BASE_URL}/programas/01`, resource: 'programas' });
  plan.push({ group: 'detail', label: 'sedes/001', url: `${BASE_URL}/sedes/001`, resource: 'sedes' });
  plan.push({ group: 'detail', label: 'asignaturas/01', url: `${BASE_URL}/asignaturas/01`, resource: 'asignaturas' });

  // C) Hypothesis probes — investigate phase-1 anomalies.
  if (seeds.studentId) {
    plan.push({
      group: 'hypothesis',
      label: 'pagos?Codigo_persona=<studentId>',
      url: buildUrl('/pagos', { Fecha_inicio: '2024-01-01', Fecha_fin: '2030-12-31', Codigo_persona: seeds.studentId }),
      note: 'phase-1 showed Codigo_programa 100% null — test if filtering by person populates it',
    });
  }
  if (seeds.periodoId != null) {
    plan.push({
      group: 'hypothesis',
      label: 'inasistencias?Consecutivo_periodo=<periodoId>',
      url: buildUrl('/inasistencias', { Consecutivo_periodo: seeds.periodoId }),
      note: 'confirm /inasistencias stays empty even with valid filter',
    });
  }
  plan.push({
    group: 'hypothesis',
    label: 'oportunidades?Fecha_*',
    url: buildUrl('/oportunidades', { Fecha_inicio: '2024-01-01', Fecha_fin: '2030-12-31' }),
    note: 'phase-1 returned 404 without filter — confirm date filter unblocks',
  });
  plan.push({
    group: 'hypothesis',
    label: 'contactos?Fecha_*',
    url: buildUrl('/contactos', { Fecha_inicio: '2024-01-01', Fecha_fin: '2030-12-31' }),
    note: 'was empty in phase 1 — date filter may help',
  });

  return plan;
}

// ─── Runner ───────────────────────────────────────────────────────────────

async function runProbes(plan) {
  const results = [];
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const tag = `[${i + 1}/${plan.length}]`;
    process.stdout.write(`${tag} ${p.label} ... `);
    if (DRY_RUN) { console.log('(dry-run — skipped)'); results.push({ ...p, skipped: true }); continue; }

    const r = await httpGet(p.url);
    const env = envelopeOf(r.body);
    const fields = analyzeRecords(env.records);
    if (env.records.length > 100) console.log(`\n  ⚠ WARN: endpoint returned ${env.records.length} records — pagination may be ignored.`);

    const rec = {
      group: p.group,
      label: p.label,
      url: p.url,
      note: p.note,
      resource: p.resource,
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
  const safe = {
    periodoId: seeds.periodoId,
    studentId: redactPersonaId(seeds.studentId),
    cursoId: seeds.cursoId,
    docenteId: redactPersonaId(seeds.docenteId),
    administrativoId: redactPersonaId(seeds.administrativoId),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'seeds.json'), JSON.stringify(safe, null, 2));
}

function writeSummary(seeds, results) {
  const lines = [];
  lines.push(`# Q10 probe — phase 2 — ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Base URL: \`${BASE_URL}\``);
  lines.push(`Seeds (redacted): \`${JSON.stringify({
    periodoId: seeds.periodoId,
    studentId: redactPersonaId(seeds.studentId),
    cursoId: seeds.cursoId,
    docenteId: redactPersonaId(seeds.docenteId),
    administrativoId: redactPersonaId(seeds.administrativoId),
  })}\``);
  lines.push('');

  const byGroup = {};
  for (const r of results) {
    const g = r.group || 'misc';
    (byGroup[g] = byGroup[g] || []).push(r);
  }

  const classify = (r) => {
    if (r.status >= 400 && r.status < 500) return '⛔ rejected';
    if (r.status >= 500) return '💥 server error';
    if (r.envelope === 'array' && r.count === 0) return '📭 empty';
    if (r.envelope === 'object') return '📄 object (detail)';
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

  // Per-endpoint field summary + list-vs-detail diff.
  lines.push('## Per-endpoint field summary');
  lines.push('');
  for (const r of results) {
    if (!r.fields || Object.keys(r.fields).length === 0) continue;
    lines.push(`### ${r.label}`);
    lines.push('');
    if (r.note) lines.push(`> ${r.note}`);
    lines.push('');

    // List-vs-detail diff for detail endpoints.
    if (r.group === 'detail' && r.resource) {
      const p1 = loadPhase1Fields(r.resource);
      if (p1) {
        const detailKeys = new Set(Object.keys(r.fields));
        const onlyInDetail = [...detailKeys].filter((k) => !p1.has(k));
        const onlyInList = [...p1].filter((k) => !detailKeys.has(k));
        if (onlyInDetail.length > 0 || onlyInList.length > 0) {
          lines.push(`**List-vs-detail diff** (vs \`${r.resource}\` list from phase 1):`);
          if (onlyInDetail.length > 0) lines.push(`- Only in detail: ${onlyInDetail.map((k) => `\`${k}\``).join(', ')}`);
          if (onlyInList.length > 0) lines.push(`- Only in list: ${onlyInList.map((k) => `\`${k}\``).join(', ')}`);
          lines.push('');
        } else {
          lines.push('_List and detail shapes are identical._');
          lines.push('');
        }
      } else {
        lines.push(`_No phase-1 schema found for \`${r.resource}\` — skipping diff._`);
        lines.push('');
      }
    }

    lines.push('| Field | Types | null% | Enum / sample |');
    lines.push('|---|---|---:|---|');
    for (const [name, info] of Object.entries(r.fields)) {
      const nullPct = r.count > 0 ? Math.round((info.nullCount / r.count) * 100) : 0;
      const enumRepr = info.enumValues.length <= 10 && info.enumValues.length > 0
        ? info.enumValues.map((v) => `\`${v}\``).join(', ')
        : (info.enumValues.length > 10 ? `<${info.enumValues.length}+ distinct>` : '—');
      lines.push(`| ${name} | ${info.types.join(', ')} | ${nullPct}% | ${enumRepr} |`);
    }
    lines.push('');
  }

  // Errors section.
  lines.push('## Errors & unexpected responses');
  lines.push('');
  const problems = results.filter((r) => r.status >= 400);
  if (problems.length === 0) {
    lines.push('_None — all probed endpoints returned 2xx._');
  } else {
    for (const r of problems) {
      lines.push(`### \`${r.label}\``);
      lines.push(`- HTTP ${r.status}`);
      if (r.errorBody) lines.push(`- Body: \`${JSON.stringify(r.errorBody).slice(0, 300)}\``);
      lines.push('');
    }
  }

  ensureDir(OUT_DIR);
  fs.writeFileSync(path.join(OUT_DIR, 'SUMMARY.md'), lines.join('\n'));
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  ensureDir(OUT_DIR);
  console.log(`Q10 probe phase 2 → ${OUT_DIR}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(DRY_RUN ? '(dry-run — no HTTP calls will be made)' : '');

  const seeds = await collectSeeds();
  if (!DRY_RUN) writeSeeds(seeds);

  const plan = planProbes(seeds);
  console.log(`\nPlanned probes: ${plan.length}`);
  if (DRY_RUN) {
    for (const p of plan) console.log(`  - [${p.group}] ${p.label}`);
    console.log('\n(dry-run ends here — no HTTP, no output files).');
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
