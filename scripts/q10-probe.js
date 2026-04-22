#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Q10 Jack API probe — read-only reconnaissance.
 *
 * Goal: hit endpoints we haven't verified yet, dump their actual shape
 *       (redacted, no PII), and surface findings to extend our empirical
 *       knowledge notes in Q10-JACK-API.md.
 *
 * What this script does:
 *   - GET-only. NEVER issues POST/PUT/DELETE.
 *   - Requests Limit=5 records per endpoint (enough to infer shape).
 *   - Rate-limited to 1 request every ~250ms so we don't hammer Q10.
 *   - Extracts envelope type (array / wrapped {items,data,results} / error).
 *   - Infers per-field types, null% and low-cardinality enum values.
 *   - Redacts PII (names, emails, phones, addresses, DOBs) before writing to disk.
 *   - Writes per-endpoint schema + a consolidated SUMMARY.md.
 *
 * Run (host):
 *   Q10_API_KEY=<key> node scripts/q10-probe.js
 *
 * Run (Docker, ephemeral):
 *   docker run --rm \
 *     -e Q10_API_KEY=<key> \
 *     -v "$PWD/scripts:/scripts" \
 *     -v "$PWD/probe-output:/probe-output" \
 *     -w /probe-output \
 *     node:20-slim node /scripts/q10-probe.js
 *
 * Run (inside this project's compose):
 *   docker compose exec app node /app/scripts/q10-probe.js
 *   (only works if scripts/ is baked into the image; otherwise use the
 *   ephemeral form above so no image rebuild is needed.)
 *
 * Output goes to $Q10_PROBE_OUTPUT_DIR (default ./probe-output).
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ─── Config ────────────────────────────────────────────────────────────────

const API_KEY = process.env.Q10_API_KEY || '';
const BASE_URL = (process.env.Q10_BASE_URL || 'https://api.q10.com/v1').replace(/\/$/, '');
const OUT_DIR = process.env.Q10_PROBE_OUTPUT_DIR || path.join(process.cwd(), 'probe-output');
const DELAY_MS = Number(process.env.Q10_PROBE_DELAY_MS || 250);
const SAMPLE_LIMIT = Number(process.env.Q10_PROBE_LIMIT || 5);
const DRY_RUN = process.argv.includes('--dry-run');

if (!API_KEY && !DRY_RUN) {
  console.error('Q10_API_KEY is required (or pass --dry-run to just list endpoints).');
  process.exit(1);
}

// ─── Endpoints to probe ───────────────────────────────────────────────────
//
// Grouped by "have we touched this in the dashboard yet?":
//   - knownOk:      we already consume these; probe confirms shape is stable.
//   - unknown:      never touched — the high-value targets for this probe.
//   - details:      detail-by-id endpoints to compare vs list shape.
//   - filterProbes: endpoints we know, but with new filter combinations.

const endpoints = [
  // ─── Confirmed OK (sanity check) ───
  { group: 'knownOk', path: '/periodos' },
  { group: 'knownOk', path: '/estudiantes' },
  { group: 'knownOk', path: '/docentes' },
  { group: 'knownOk', path: '/contactos' },
  { group: 'knownOk', path: '/oportunidades' },
  { group: 'knownOk', path: '/cursos' },
  { group: 'knownOk', path: '/pagos', params: { Fecha_inicio: '2024-01-01', Fecha_fin: '2030-12-31' } },
  { group: 'knownOk', path: '/pagosPendientes' },
  { group: 'knownOk', path: '/evaluaciones', params: { Programa: '01' } },

  // ─── Verified empty/rejected (confirm the regression) ───
  { group: 'knownOk', path: '/inasistencias' },
  { group: 'knownOk', path: '/estadocuentaestudiantes' },

  // ─── Unknown — the core of this probe ───
  { group: 'unknown', path: '/administrativos' },
  { group: 'unknown', path: '/asignaturas' },
  { group: 'unknown', path: '/aulas' },
  { group: 'unknown', path: '/aulasVirtuales' },
  { group: 'unknown', path: '/anosLectivos' },
  { group: 'unknown', path: '/areas' },
  { group: 'unknown', path: '/barrios' },
  { group: 'unknown', path: '/cargasAcademicas' },
  { group: 'unknown', path: '/codeudores' },
  { group: 'unknown', path: '/colegios' },
  { group: 'unknown', path: '/cursosRotativos' },
  { group: 'unknown', path: '/descuentos' },
  { group: 'unknown', path: '/egresos' },
  { group: 'unknown', path: '/encuestas' },
  { group: 'unknown', path: '/especialidades' },
  { group: 'unknown', path: '/facturas' },
  { group: 'unknown', path: '/familiares' },
  { group: 'unknown', path: '/grados' },
  { group: 'unknown', path: '/horarios' },
  { group: 'unknown', path: '/indicadores' },
  { group: 'unknown', path: '/inscripciones' },
  { group: 'unknown', path: '/institucionesEducativas' },
  { group: 'unknown', path: '/jornadas' },
  { group: 'unknown', path: '/matriculas' },
  { group: 'unknown', path: '/negocios' },
  { group: 'unknown', path: '/niveles' },
  { group: 'unknown', path: '/perfiles' },
  { group: 'unknown', path: '/usuarios' },
  { group: 'unknown', path: '/pensiones' },
  { group: 'unknown', path: '/planesDePago' },
  { group: 'unknown', path: '/practicasLaborales' },
  { group: 'unknown', path: '/programas' },
  { group: 'unknown', path: '/renovacion' },
  { group: 'unknown', path: '/sedes' },
  { group: 'unknown', path: '/otrosIngresos' },

  // ─── Filter exploration on known endpoints ───
  { group: 'filterProbes', path: '/estudiantes', params: { Activo: 'true' }, label: 'estudiantes?Activo=true' },
  { group: 'filterProbes', path: '/estudiantes', params: { Activo: 'false' }, label: 'estudiantes?Activo=false' },
  { group: 'filterProbes', path: '/cursos', params: { Estado: 'Abierto' }, label: 'cursos?Estado=Abierto' },
  { group: 'filterProbes', path: '/cursos', params: { Estado: 'Cerrado' }, label: 'cursos?Estado=Cerrado' },
  { group: 'filterProbes', path: '/pagos', label: 'pagos (no date filter)' },
  { group: 'filterProbes', path: '/oportunidades', params: { Estado: 'Ganada' }, label: 'oportunidades?Estado=Ganada' },
];

// ─── PII redaction ────────────────────────────────────────────────────────

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
// These are considered low-risk and kept as-is (useful for classification):
//   Estado, Tipo, Genero, Nombre_programa, Nombre_curso, Nombre_sede,
//   Nombre_nivel, Nombre_jornada, Nombre_asignatura, Nombre_periodo,
//   Codigo_*, Consecutivo_*, Valor_*, Cupo_*, Cantidad_*, Fecha_*
// (Fecha_nacimiento is the PII exception since it's a DOB.)

function redact(value) {
  if (value == null) return value;
  if (typeof value === 'string') return value ? '<redacted>' : '';
  if (typeof value === 'number') return 0;
  return value;
}

function redactObject(obj) {
  if (Array.isArray(obj)) return obj.map(redactObject);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (PII_KEYS.has(k)) {
        out[k] = redact(v);
      } else if (v && typeof v === 'object') {
        out[k] = redactObject(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return obj;
}

// ─── Schema inference ─────────────────────────────────────────────────────
//
// For each endpoint we compute:
//   - envelope: 'array' | 'wrapped:items' | 'wrapped:data' | 'wrapped:results' |
//               'empty' | 'error' | 'unexpected'
//   - count: number of records returned in the sample
//   - fields: { [name]: { types: Set<string>, nullCount: number,
//                        sampleValues: unique low-cardinality values (<=10) } }

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
      if (!fields[k]) {
        fields[k] = {
          types: new Set(),
          nullCount: 0,
          enumValues: new Set(),
          distinctCount: 0,
        };
      }
      const f = fields[k];
      const t = inferType(v);
      f.types.add(t);
      if (v == null) f.nullCount++;
      if (!PII_KEYS.has(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) {
        if (f.enumValues.size < 10) f.enumValues.add(String(v));
        f.distinctCount = Math.max(f.distinctCount, f.enumValues.size);
      }
    }
  }
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = {
      types: [...v.types].sort(),
      nullCount: v.nullCount,
      enumValues: v.enumValues.size <= 10 ? [...v.enumValues].sort() : `<${v.distinctCount}+ distinct>`,
    };
  }
  return out;
}

function envelopeOf(body) {
  if (Array.isArray(body)) return { type: 'array', records: body };
  if (body && typeof body === 'object') {
    for (const k of ['items', 'data', 'results', 'list', 'records']) {
      if (Array.isArray(body[k])) return { type: `wrapped:${k}`, records: body[k] };
    }
    if (body.error || body.message || body.Error) return { type: 'error', records: [], errorBody: body };
    return { type: 'unexpected', records: [], unexpectedBody: body };
  }
  return { type: 'empty', records: [] };
}

// ─── HTTP ────────────────────────────────────────────────────────────────

function buildUrl(p, params) {
  const url = new URL(BASE_URL + p);
  const full = { Limit: SAMPLE_LIMIT, Offset: 1, ...(params || {}) };
  for (const [k, v] of Object.entries(full)) {
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

async function probeOne(endpoint) {
  const label = endpoint.label || endpoint.path + (endpoint.params ? '?' + new URLSearchParams(endpoint.params).toString() : '');
  const safeName = label.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const url = buildUrl(endpoint.path, endpoint.params);

  if (DRY_RUN) {
    return { ok: true, label, safeName, status: 0, envelope: 'skipped', count: 0, fields: {}, note: 'dry-run' };
  }

  const started = Date.now();
  let status = 0;
  let body = null;
  let err = null;
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'Api-Key': API_KEY, 'Accept': 'application/json' },
    });
    status = resp.status;
    const text = await resp.text();
    try {
      body = text ? JSON.parse(text) : null;
    } catch (parseErr) {
      err = `non-JSON response (first 120 chars: ${text.slice(0, 120)})`;
    }
  } catch (netErr) {
    err = `network error: ${netErr && netErr.message ? netErr.message : netErr}`;
  }
  const elapsed = Date.now() - started;

  if (err) {
    return { ok: false, label, safeName, url, status, elapsed, envelope: 'error', count: 0, fields: {}, error: err };
  }

  const env = envelopeOf(body);
  const fields = analyzeRecords(env.records);

  return {
    ok: status >= 200 && status < 300,
    label,
    safeName,
    url,
    status,
    elapsed,
    envelope: env.type,
    count: env.records.length,
    fields,
    errorBody: env.errorBody,
    unexpectedBody: env.unexpectedBody,
    sample: redactObject(env.records.slice(0, 2)),
  };
}

// ─── Output ──────────────────────────────────────────────────────────────

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function writeSchema(result) {
  const dir = path.join(OUT_DIR, 'schema');
  ensureDir(dir);
  const file = path.join(dir, `${result.safeName}.json`);
  fs.writeFileSync(file, JSON.stringify({
    label: result.label,
    url: result.url,
    status: result.status,
    elapsed_ms: result.elapsed,
    envelope: result.envelope,
    count: result.count,
    fields: result.fields,
    error: result.error,
    errorBody: result.errorBody,
    unexpectedBody: result.unexpectedBody,
    sample: result.sample,
  }, null, 2));
}

function writeSummary(results) {
  ensureDir(OUT_DIR);
  const byGroup = {};
  for (const r of results) {
    const g = r.group || 'uncategorized';
    (byGroup[g] = byGroup[g] || []).push(r);
  }

  const lines = [];
  lines.push(`# Q10 probe — ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Base URL: \`${BASE_URL}\``);
  lines.push(`Sample limit: ${SAMPLE_LIMIT} records per endpoint`);
  lines.push(`Rate limit: ~${DELAY_MS}ms between calls`);
  lines.push('');

  const classify = (r) => {
    if (!r.ok && r.envelope === 'error') return r.status >= 400 && r.status < 500 ? '⛔ rejected' : '💥 server error';
    if (r.envelope === 'array' && r.count === 0) return '📭 empty';
    if (r.envelope.startsWith('wrapped:')) return '📦 wrapped';
    if (r.envelope === 'array' && r.count > 0) return '✅ ok';
    if (r.envelope === 'unexpected') return '⚠️ unexpected';
    return '❓ unknown';
  };

  for (const [group, list] of Object.entries(byGroup)) {
    lines.push(`## ${group}`);
    lines.push('');
    lines.push('| Endpoint | Status | Envelope | Records | Elapsed | Classification |');
    lines.push('|---|---:|---|---:|---:|---|');
    for (const r of list) {
      lines.push(`| \`${r.label}\` | ${r.status || '—'} | ${r.envelope} | ${r.count} | ${r.elapsed || 0}ms | ${classify(r)} |`);
    }
    lines.push('');
  }

  lines.push('## Per-endpoint field summary');
  lines.push('');
  for (const r of results) {
    if (!r.ok || r.count === 0) continue;
    lines.push(`### ${r.label}`);
    lines.push('');
    lines.push('| Field | Types | null% | Enum / sample |');
    lines.push('|---|---|---:|---|');
    for (const [name, info] of Object.entries(r.fields)) {
      const nullPct = r.count > 0 ? Math.round((info.nullCount / r.count) * 100) : 0;
      const enumRepr = Array.isArray(info.enumValues)
        ? info.enumValues.map((v) => `\`${v}\``).join(', ')
        : info.enumValues;
      lines.push(`| ${name} | ${info.types.join(', ')} | ${nullPct}% | ${enumRepr || '—'} |`);
    }
    lines.push('');
  }

  lines.push('## Errors & unexpected responses');
  lines.push('');
  const problems = results.filter((r) => !r.ok || r.envelope === 'unexpected');
  if (problems.length === 0) {
    lines.push('_None — all endpoints returned a known envelope shape._');
  } else {
    for (const r of problems) {
      lines.push(`### \`${r.label}\``);
      lines.push('');
      lines.push(`- HTTP ${r.status} (${r.envelope})`);
      if (r.error) lines.push(`- Error: \`${r.error}\``);
      if (r.errorBody) lines.push(`- Body: \`${JSON.stringify(r.errorBody).slice(0, 200)}\``);
      if (r.unexpectedBody) lines.push(`- Keys: \`${Object.keys(r.unexpectedBody).slice(0, 10).join(', ')}\``);
      lines.push('');
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'SUMMARY.md'), lines.join('\n'));
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  ensureDir(OUT_DIR);
  console.log(`Q10 probe → ${OUT_DIR}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Endpoints: ${endpoints.length}`);
  console.log(DRY_RUN ? '(dry-run — no HTTP calls will be made)' : '');

  const results = [];
  for (let i = 0; i < endpoints.length; i++) {
    const ep = endpoints[i];
    const tag = `[${i + 1}/${endpoints.length}]`;
    process.stdout.write(`${tag} ${ep.label || ep.path} ... `);
    const r = await probeOne(ep);
    r.group = ep.group;
    results.push(r);
    console.log(`${r.status || '—'} ${r.envelope} (${r.count} records, ${r.elapsed || 0}ms)${r.error ? ' ⚠ ' + r.error : ''}`);
    if (!DRY_RUN) writeSchema(r);
    if (!DRY_RUN && DELAY_MS > 0) await new Promise((res) => setTimeout(res, DELAY_MS));
  }

  writeSummary(results);
  console.log('');
  console.log(`Summary written to ${path.join(OUT_DIR, 'SUMMARY.md')}`);
  console.log(`Per-endpoint schemas in ${path.join(OUT_DIR, 'schema/')}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
