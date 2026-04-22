import {
  ageBucket,
  ageFromBirthdate,
  cefrIndex,
  classifyModality,
  classifyProduct,
  currentlyActivePeriods,
  expectedLevelAdvance,
  groupCount,
  groupSum,
  isActivo,
  monthsBetween,
} from '../src/q10/dashboard/helpers';

describe('classifyModality', () => {
  it('recognises the short "R" marker as Regular', () => {
    expect(classifyModality('14 R - Recife')).toBe('Regular');
  });

  it('recognises the short "S" marker as Semi Intensivo', () => {
    expect(classifyModality('08 S - San José')).toBe('Semi Intensivo');
  });

  it('recognises the verbose "Regular" form', () => {
    expect(classifyModality('12 Regular - Recife')).toBe('Regular');
  });

  it('recognises the verbose "Semi Intensivo" form', () => {
    expect(classifyModality('05 Semi Intensivo - Panamá')).toBe('Semi Intensivo');
  });

  it('returns Desconocida for unrelated labels like "Matrícula"', () => {
    expect(classifyModality('Matrícula')).toBe('Desconocida');
  });

  it('returns Desconocida for an empty string', () => {
    expect(classifyModality('')).toBe('Desconocida');
  });

  it('returns Desconocida for null input', () => {
    expect(classifyModality(null)).toBe('Desconocida');
  });

  it('is case-insensitive', () => {
    expect(classifyModality('14 r - Recife')).toBe('Regular');
  });
});

describe('classifyProduct', () => {
  // Cases drawn from the live /pagosPendientes probe (2026-04-22) — every
  // distinct Nombre_producto the tenant actually emits today, plus the
  // baseline Spanish forms the doc hints at.
  it('classifies Spanish "Mensualidad $ 50" as mensualidad', () => {
    expect(classifyProduct('Mensualidad $ 50')).toBe('mensualidad');
  });

  it('classifies Portuguese "Mensalidade $75" as mensualidad', () => {
    expect(classifyProduct('Mensalidade $75')).toBe('mensualidad');
  });

  it('classifies "Regular Mensalidade" as mensualidad', () => {
    expect(classifyProduct('Regular Mensalidade')).toBe('mensualidad');
  });

  it('classifies "Nivel Regular" (custom name) as mensualidad', () => {
    expect(classifyProduct('Nivel Regular')).toBe('mensualidad');
  });

  it('classifies "Matricula $20" as matricula', () => {
    expect(classifyProduct('Matricula $20')).toBe('matricula');
  });

  it('classifies "Matrícula única" (with accent) as matricula', () => {
    expect(classifyProduct('Matrícula única')).toBe('matricula');
  });

  it('classifies personalised mensualidade ("Mensalidade Adriana 1") as mensualidad', () => {
    expect(classifyProduct('Mensalidade Adriana 1')).toBe('mensualidad');
  });

  it('returns otro for generic names like "66 Dolares"', () => {
    expect(classifyProduct('66 Dolares')).toBe('otro');
  });

  it('returns otro for personalised names without mensal-root ("Adriana 1")', () => {
    expect(classifyProduct('Adriana 1')).toBe('otro');
  });

  it('returns otro for empty/null input', () => {
    expect(classifyProduct('')).toBe('otro');
    expect(classifyProduct(null)).toBe('otro');
    expect(classifyProduct(undefined)).toBe('otro');
  });

  it('is case-insensitive', () => {
    expect(classifyProduct('MATRICULA')).toBe('matricula');
    expect(classifyProduct('mensualidad extra')).toBe('mensualidad');
  });

  it('does not match mid-word substrings (no false positives)', () => {
    // "Complemento" has no "matr", no "mensal", no "nivel regular".
    expect(classifyProduct('Complemento didáctico')).toBe('otro');
  });
});

describe('cefrIndex', () => {
  it('maps A1..C2 to 0..5', () => {
    expect(cefrIndex('A1')).toBe(0);
    expect(cefrIndex('A2')).toBe(1);
    expect(cefrIndex('B1')).toBe(2);
    expect(cefrIndex('B2')).toBe(3);
    expect(cefrIndex('C1')).toBe(4);
    expect(cefrIndex('C2')).toBe(5);
  });

  it('returns null for unknown levels', () => {
    expect(cefrIndex('D1')).toBeNull();
    expect(cefrIndex('')).toBeNull();
    expect(cefrIndex(null)).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(cefrIndex('a1')).toBe(0);
    expect(cefrIndex('b2')).toBe(3);
  });
});

describe('expectedLevelAdvance', () => {
  it('Regular: 7 months → 2 levels (floor(7/3))', () => {
    expect(expectedLevelAdvance('Regular', 7)).toBe(2);
  });

  it('Semi Intensivo: 7 months → 4 levels (floor(7/1.5))', () => {
    expect(expectedLevelAdvance('Semi Intensivo', 7)).toBe(4);
  });

  it('Desconocida: always 0', () => {
    expect(expectedLevelAdvance('Desconocida', 12)).toBe(0);
    expect(expectedLevelAdvance('Desconocida', 0)).toBe(0);
  });

  it('Regular with 0 months → 0', () => {
    expect(expectedLevelAdvance('Regular', 0)).toBe(0);
  });

  it('Regular with negative months → 0', () => {
    expect(expectedLevelAdvance('Regular', -3)).toBe(0);
  });
});

describe('monthsBetween', () => {
  it('computes ~3 months between 2024-01-01 and 2024-04-01', () => {
    const v = monthsBetween('2024-01-01', '2024-04-01');
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(2.9);
    expect(v!).toBeLessThan(3.1);
  });

  it('returns null for an unparseable "from"', () => {
    expect(monthsBetween('invalid')).toBeNull();
  });

  it('returns null when "from" is null', () => {
    expect(monthsBetween(null)).toBeNull();
  });
});

describe('ageFromBirthdate', () => {
  it('returns a reasonable age for a known past date', () => {
    const age = ageFromBirthdate('2000-01-01');
    expect(age).not.toBeNull();
    expect(age!).toBeGreaterThanOrEqual(24);
    expect(age!).toBeLessThanOrEqual(30);
  });

  it('returns null for unparseable input', () => {
    expect(ageFromBirthdate('not-a-date')).toBeNull();
    expect(ageFromBirthdate(null)).toBeNull();
    expect(ageFromBirthdate(undefined)).toBeNull();
  });

  it('returns null for a future date', () => {
    expect(ageFromBirthdate('2999-01-01')).toBeNull();
  });

  it('returns null for a ~150-year-old date', () => {
    expect(ageFromBirthdate('1870-01-01')).toBeNull();
  });
});

describe('ageBucket', () => {
  it('11 → "<12"', () => {
    expect(ageBucket(11)).toBe('<12');
  });

  it('12 → "12-17"', () => {
    expect(ageBucket(12)).toBe('12-17');
  });

  it('17 → "12-17"', () => {
    expect(ageBucket(17)).toBe('12-17');
  });

  it('18 → "18-24"', () => {
    expect(ageBucket(18)).toBe('18-24');
  });

  it('24 → "18-24"', () => {
    expect(ageBucket(24)).toBe('18-24');
  });

  it('25 → "25-34"', () => {
    expect(ageBucket(25)).toBe('25-34');
  });

  it('50 → "50-64"', () => {
    expect(ageBucket(50)).toBe('50-64');
  });

  it('65 → "65+"', () => {
    expect(ageBucket(65)).toBe('65+');
  });
});

describe('currentlyActivePeriods', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('returns only periods whose range contains today', () => {
    const now = Date.now();
    const periodos = [
      {
        Consecutivo: 'CURR',
        Estado: 'Activo',
        Fecha_inicio: new Date(now - 10 * DAY).toISOString(),
        Fecha_fin: new Date(now + 30 * DAY).toISOString(),
      },
      {
        Consecutivo: 'PAST',
        Estado: 'Activo',
        Fecha_inicio: new Date(now - 200 * DAY).toISOString(),
        Fecha_fin: new Date(now - 100 * DAY).toISOString(),
      },
    ];

    const result = currentlyActivePeriods(periodos);
    expect(result).toHaveLength(1);
    expect(result[0].Consecutivo).toBe('CURR');
  });

  it('falls back to all active when none contain today', () => {
    const now = Date.now();
    const periodos = [
      {
        Consecutivo: 'PAST1',
        Estado: 'Activo',
        Fecha_inicio: new Date(now - 400 * DAY).toISOString(),
        Fecha_fin: new Date(now - 300 * DAY).toISOString(),
      },
      {
        Consecutivo: 'PAST2',
        Estado: 'Activo',
        Fecha_inicio: new Date(now - 200 * DAY).toISOString(),
        Fecha_fin: new Date(now - 100 * DAY).toISOString(),
      },
      {
        Consecutivo: 'INACTIVE',
        Estado: 'Inactivo',
        Fecha_inicio: new Date(now - 50 * DAY).toISOString(),
        Fecha_fin: new Date(now + 50 * DAY).toISOString(),
      },
    ];

    const result = currentlyActivePeriods(periodos);
    // Both Activo-but-past are returned; the Inactivo one is filtered out.
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.Consecutivo).sort()).toEqual(['PAST1', 'PAST2']);
  });
});

describe('groupCount', () => {
  it('counts items grouped by key', () => {
    const items = [{ m: 'A' }, { m: 'B' }, { m: 'A' }, { m: 'A' }];
    expect(groupCount(items, (x) => x.m)).toEqual({ A: 3, B: 1 });
  });

  it('uses "Sin especificar" when the key is empty', () => {
    const items = [{ m: '' }, { m: null }, { m: 'A' }];
    expect(groupCount(items, (x) => x.m)).toEqual({
      'Sin especificar': 2,
      A: 1,
    });
  });
});

describe('groupSum', () => {
  it('sums a numeric field grouped by key', () => {
    const items = [
      { k: 'A', v: 10 },
      { k: 'B', v: 5 },
      { k: 'A', v: 2 },
    ];
    expect(groupSum(items, (x) => x.k, 'v')).toEqual({ A: 12, B: 5 });
  });

  it('uses "Sin especificar" fallback for missing keys', () => {
    const items = [
      { k: '', v: 7 },
      { k: 'A', v: 3 },
    ];
    expect(groupSum(items, (x) => x.k, 'v')).toEqual({
      'Sin especificar': 7,
      A: 3,
    });
  });
});

describe('isActivo', () => {
  it('recognises truthy variants', () => {
    expect(isActivo(true)).toBe(true);
    expect(isActivo('true')).toBe(true);
    expect(isActivo('Activo')).toBe(true);
    expect(isActivo('active')).toBe(true);
    expect(isActivo('1')).toBe(true);
  });

  it('rejects falsy/inactive variants', () => {
    expect(isActivo('inactivo')).toBe(false);
    expect(isActivo('false')).toBe(false);
    expect(isActivo(null)).toBe(false);
    expect(isActivo(undefined)).toBe(false);
    expect(isActivo('')).toBe(false);
  });
});
