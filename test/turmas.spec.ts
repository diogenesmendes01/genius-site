import { TurmasService } from '../src/q10/dashboard/turmas.service';

const DAY = 24 * 60 * 60 * 1000;

const makeQ10 = (responses: Record<string, any[] | (() => any[])>) =>
  ({
    getAll: jest.fn(async (path: string) => {
      const v = responses[path];
      if (typeof v === 'function') return v();
      return v ?? [];
    }),
  } as any);

const now = Date.now();
const activePeriod = {
  Consecutivo: 'P-NOW',
  Estado: 'Activo',
  Fecha_inicio: new Date(now - 10 * DAY).toISOString(),
  Fecha_fin: new Date(now + 30 * DAY).toISOString(),
};
const pastPeriod = {
  Consecutivo: 'P-PAST',
  Estado: 'Activo',
  Fecha_inicio: new Date(now - 400 * DAY).toISOString(),
  Fecha_fin: new Date(now - 300 * DAY).toISOString(),
};

describe('TurmasService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('happy path: summary, distributions and alerts reflect active courses', async () => {
    // 5 courses: 3 in active period (1 regular full, 1 regular empty, 1 semi
    // underbooked), 1 in past period (should be ignored), 1 closed.
    const cursos = [
      {
        Codigo: 'C1',
        Consecutivo: 'C1',
        Consecutivo_periodo: 'P-NOW',
        Nombre: '14 R - Recife',
        Estado: 'Activo',
        Cupo_maximo: 10,
        Cantidad_estudiantes_matriculados: 10, // 100% → overbooked
        Codigo_docente: 'T1',
        Nombre_docente: 'Teacher One',
      },
      {
        Codigo: 'C2',
        Consecutivo: 'C2',
        Consecutivo_periodo: 'P-NOW',
        Nombre: '08 S - San José',
        Estado: 'Activo',
        Cupo_maximo: 10,
        Cantidad_estudiantes_matriculados: 3, // 30% → underbooked (0<3<5)
        Codigo_docente: 'T2',
        Nombre_docente: 'Teacher Two',
      },
      {
        Codigo: 'C3',
        Consecutivo: 'C3',
        Consecutivo_periodo: 'P-NOW',
        Nombre: '15 R - Panamá',
        Estado: 'Activo',
        Cupo_maximo: 10,
        Cantidad_estudiantes_matriculados: 0, // empty
        Codigo_docente: 'T1',
        Nombre_docente: 'Teacher One',
      },
      {
        // Belongs to past period — filtered out.
        Codigo: 'C-OLD',
        Consecutivo: 'C-OLD',
        Consecutivo_periodo: 'P-PAST',
        Nombre: '01 R - Recife',
        Estado: 'Activo',
        Cupo_maximo: 10,
        Cantidad_estudiantes_matriculados: 9,
        Codigo_docente: 'T3',
        Nombre_docente: 'Teacher Three',
      },
      {
        // Estado != Activo — filtered out.
        Codigo: 'C-CLOSED',
        Consecutivo: 'C-CLOSED',
        Consecutivo_periodo: 'P-NOW',
        Nombre: '02 R - Recife',
        Estado: 'Cerrado',
        Cupo_maximo: 10,
        Cantidad_estudiantes_matriculados: 7,
        Codigo_docente: 'T4',
        Nombre_docente: 'Teacher Four',
      },
    ];

    const q10 = makeQ10({
      '/periodos': [activePeriod, pastPeriod],
      '/cursos': cursos,
    });
    const svc = new TurmasService(q10);

    const result = await svc.turmas();

    expect(result.summary.totalCursos).toBe(3);
    // 13 matriculated / 30 total cupo = 43%
    expect(result.summary.ocupacionMedia).toBe(43);
    expect(result.summary.overbookedCount).toBe(1);
    expect(result.summary.underbookedCount).toBe(1);
    expect(result.summary.emptyCount).toBe(1);

    expect(result.distributions.byModality['Regular']).toBe(2);
    expect(result.distributions.byModality['Semi Intensivo']).toBe(1);

    // overbooked sorted desc by ocupacion
    expect(result.alerts.overbooked).toHaveLength(1);
    expect(result.alerts.overbooked[0].Codigo).toBe('C1');

    // underbooked sorted asc by matriculados
    expect(result.alerts.underbooked).toHaveLength(1);
    expect(result.alerts.underbooked[0].Codigo).toBe('C2');

    expect(result.partial).toBe(false);
  });

  it('falls through period filter when /periodos returns empty', async () => {
    const cursos = [
      {
        Codigo: 'X1',
        Consecutivo: 'X1',
        Consecutivo_periodo: 'WHATEVER',
        Nombre: '99 R - NoWhere',
        Estado: 'Activo',
        Cupo_maximo: 10,
        Cantidad_estudiantes_matriculados: 5,
      },
    ];
    const q10 = makeQ10({ '/periodos': [], '/cursos': cursos });
    const svc = new TurmasService(q10);

    const result = await svc.turmas();
    expect(result.summary.totalCursos).toBe(1);
  });

  it('populates errors.courses and marks partial when /cursos throws', async () => {
    const q10 = makeQ10({
      '/periodos': [activePeriod],
      '/cursos': () => {
        throw new Error('boom');
      },
    });
    const svc = new TurmasService(q10);

    const result = await svc.turmas();
    expect(result.errors.courses).toMatch(/boom/);
    expect(result.summary.totalCursos).toBe(0);
    expect(result.partial).toBe(true);
  });

  it('teacher aggregation rolls up by Codigo_docente', async () => {
    const cursos = [
      {
        Codigo: 'A',
        Consecutivo_periodo: 'P-NOW',
        Nombre: '01 R - City',
        Estado: 'Activo',
        Cupo_maximo: 10,
        Cantidad_estudiantes_matriculados: 4,
        Codigo_docente: 'DOC-99',
        Nombre_docente: 'Ana',
      },
      {
        Codigo: 'B',
        Consecutivo_periodo: 'P-NOW',
        Nombre: '02 R - City',
        Estado: 'Activo',
        Cupo_maximo: 10,
        Cantidad_estudiantes_matriculados: 6,
        Codigo_docente: 'DOC-99',
        Nombre_docente: 'Ana',
      },
      {
        Codigo: 'C',
        Consecutivo_periodo: 'P-NOW',
        Nombre: '03 R - City',
        Estado: 'Activo',
        Cupo_maximo: 10,
        Cantidad_estudiantes_matriculados: 2,
        Codigo_docente: 'DOC-99',
        Nombre_docente: 'Ana',
      },
    ];
    const q10 = makeQ10({
      '/periodos': [activePeriod],
      '/cursos': cursos,
    });
    const svc = new TurmasService(q10);

    const result = await svc.turmas();
    expect(result.teachers).toHaveLength(1);
    const ana = result.teachers[0];
    expect(ana.codigo).toBe('DOC-99');
    expect(ana.cursos).toBe(3);
    expect(ana.estudiantes).toBe(12);
  });
});
