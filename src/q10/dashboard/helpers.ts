/**
 * Shared utilities for the four dashboard services (overview, academic,
 * financial, commercial). Kept as pure functions so the services stay
 * testable without dependency-injection gymnastics.
 */

export type Item = Record<string, any>;

export function safeArray(v: unknown): Item[] {
  if (Array.isArray(v)) return v as Item[];
  if (v && typeof v === 'object') {
    const maybeList = (v as any).items ?? (v as any).data ?? (v as any).results;
    if (Array.isArray(maybeList)) return maybeList;
  }
  return [];
}

export function parseDate(value: unknown): Date | null {
  if (!value || typeof value !== 'string') return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Trim + treat literal "null" strings as empty (Q10 does that sometimes). */
export function cleanStr(v: unknown): string {
  if (v == null) return '';
  const s = String(v).trim();
  return s === 'null' ? '' : s;
}

/**
 * Q10 serialises status as boolean true OR the literal strings "true"/
 * "Activo"/"Active" (mixed casing). We match against an explicit set so
 * `"inactive"`/`"inactivo"` don't sneak through a substring check (review
 * #7 finding).
 */
const ACTIVO_VALUES = new Set(['true', 'activo', 'active', '1']);
export function isActivo(status: unknown): boolean {
  if (status === true) return true;
  return ACTIVO_VALUES.has(cleanStr(status).toLowerCase());
}

export function sum(list: Item[], field: string): number {
  return list.reduce((acc, x) => acc + (Number(x[field]) || 0), 0);
}

export function groupCount<T extends Item>(
  list: T[],
  getter: (item: T) => unknown,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of list) {
    const key = cleanStr(getter(item)) || 'Sin especificar';
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

export function groupSum<T extends Item>(
  list: T[],
  keyGetter: (item: T) => unknown,
  valueField: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of list) {
    const key = cleanStr(keyGetter(item)) || 'Sin especificar';
    const v = Number(item[valueField]) || 0;
    out[key] = (out[key] ?? 0) + v;
  }
  return out;
}

/** Pick periods considered "active right now" — Estado=Activo AND today is
 *  within Fecha_inicio..Fecha_fin. Falls back to all active if none contains
 *  today (e.g. between-term gaps). */
export function currentlyActivePeriods(periodos: Item[]): Item[] {
  const now = Date.now();
  const active = periodos.filter((p) => isActivo(p.Estado));
  const current = active.filter((p) => {
    const start = parseDate(p.Fecha_inicio)?.getTime() ?? -Infinity;
    const end = parseDate(p.Fecha_fin)?.getTime() ?? Infinity;
    return now >= start && now <= end;
  });
  return current.length > 0 ? current : active;
}

/** The most recent period (by Fecha_fin) that isn't in `active`. Used as the
 *  "previous" reference for retention/churn comparisons. */
export function previousPeriod(periodos: Item[], active: Item[]): Item | null {
  const activeConsecutivos = new Set(active.map((p) => cleanStr(p.Consecutivo)));
  const candidates = periodos.filter((p) => !activeConsecutivos.has(cleanStr(p.Consecutivo)));
  if (!candidates.length) return null;
  return candidates.sort((a, b) => {
    const ea = parseDate(a.Fecha_fin)?.getTime() ?? 0;
    const eb = parseDate(b.Fecha_fin)?.getTime() ?? 0;
    return eb - ea;
  })[0];
}

export function periodKey(p: Item): string {
  return (
    cleanStr(p.Consecutivo) ||
    cleanStr(p.Consecutivo_periodo) ||
    cleanStr(p.Codigo) ||
    cleanStr(p.Id)
  );
}

/** Assemble a full name from Q10's split fields. /pagosPendientes nests the
 *  student under `Estudiante` with a pre-joined `Nombre_completo` — we prefer
 *  that when present. */
export function studentFullName(s: Item): string {
  const joined = cleanStr(s.Nombre_completo);
  if (joined) return joined;
  return [s.Primer_nombre, s.Segundo_nombre, s.Primer_apellido, s.Segundo_apellido]
    .map(cleanStr)
    .filter(Boolean)
    .join(' ');
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** Compute age from Fecha_nacimiento (YYYY-MM-DD or ISO). Returns null for
 *  unparseable input. */
export function ageFromBirthdate(value: unknown): number | null {
  const d = parseDate(value);
  if (!d) return null;
  const diff = Date.now() - d.getTime();
  const years = diff / (1000 * 60 * 60 * 24 * 365.25);
  if (years < 0 || years > 120) return null;
  return Math.floor(years);
}

export function ageBucket(age: number): string {
  if (age < 12) return '<12';
  if (age < 18) return '12-17';
  if (age < 25) return '18-24';
  if (age < 35) return '25-34';
  if (age < 50) return '35-49';
  if (age < 65) return '50-64';
  return '65+';
}

// ═══════════════════════════════════════════════════════════════════
// Genius-specific business rules
// ═══════════════════════════════════════════════════════════════════

/** CEFR progression — order matters for "expected level after N months". */
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** Months each modality takes to advance one CEFR level at Genius.
 *  Confirmed by the operator: Regular = 3 months/level, Intensivo = 1.5. */
export const MONTHS_PER_LEVEL = { Regular: 3, 'Semi Intensivo': 1.5 } as const;

export type Modality = 'Regular' | 'Semi Intensivo' | 'Desconocida';

/**
 * Classify a course's modality from its `Nombre_curso`. Pattern observed in
 * the live Q10 tenant: "NN R - City" (Regular) and "NN S - City"
 * (Semi Intensivo) — confirmed across 10 sample courses. "Desconocida"
 * covers anything that doesn't match, so the UI can bucket those into
 * "Sin clasificar" without crashing.
 */
export function classifyModality(nombreCurso: unknown): Modality {
  const s = cleanStr(nombreCurso);
  if (/\s(R|Regular)\s*-/i.test(s)) return 'Regular';
  if (/\s(S|Semi\s*Intensivo|Intensivo)\s*-/i.test(s)) return 'Semi Intensivo';
  return 'Desconocida';
}

export type ProductType = 'matricula' | 'mensualidad' | 'otro';

/**
 * Classify a payment/debt line by its `Nombre_producto`. The tenant has
 * inconsistent product names — some staff register in Spanish
 * ("Mensualidad $50"), others in Portuguese ("Mensalidade $75"), plus
 * custom names like "Nivel Regular" or "Mensalidade Adriana 1". The
 * debt-decomposition probe (2026-04-22) mapped the full distribution;
 * this matcher covers the buckets that actually appear.
 */
export function classifyProduct(nombreProducto: unknown): ProductType {
  const s = cleanStr(nombreProducto).toLowerCase();
  if (!s) return 'otro';
  if (/\bmatr/.test(s)) return 'matricula';
  if (/mensual|mensalid/.test(s)) return 'mensualidad';
  if (/\bnivel\b.*\bregular\b/.test(s)) return 'mensualidad';
  return 'otro';
}

/**
 * Index of a CEFR level (A1=0 … C2=5). Returns null if the string isn't a
 * recognised CEFR code; callers skip those from progression math.
 */
export function cefrIndex(nivel: unknown): number | null {
  const s = cleanStr(nivel).toUpperCase();
  const i = (CEFR_LEVELS as readonly string[]).indexOf(s);
  return i === -1 ? null : i;
}

/**
 * How many CEFR levels a student should have advanced after `months` at the
 * given modality, rounded down. A student Regular at month 7 should be in
 * level index 2 (A1 → A2 → B1 → started B1).
 */
export function expectedLevelAdvance(modality: Modality, months: number): number {
  const m = MONTHS_PER_LEVEL[modality as keyof typeof MONTHS_PER_LEVEL];
  if (!m || months <= 0) return 0;
  return Math.floor(months / m);
}

/** Months between two dates (ISO strings or Date), rounded to one decimal. */
export function monthsBetween(from: unknown, to: unknown = new Date()): number | null {
  const a = parseDate(from);
  const b = to instanceof Date ? to : parseDate(to);
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  return Math.round((ms / (1000 * 60 * 60 * 24 * 30.44)) * 10) / 10;
}
