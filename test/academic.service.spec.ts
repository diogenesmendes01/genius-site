import { Test } from '@nestjs/testing';
import { AcademicService } from '../src/q10/dashboard/academic.service';
import { RiskAnalysisService } from '../src/q10/dashboard/risk-analysis.service';
import { Q10ClientService } from '../src/q10/q10-client.service';

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
  Nombre: 'Período Activo',
  Estado: 'Activo',
  Fecha_inicio: new Date(now - 10 * DAY).toISOString(),
  Fecha_fin: new Date(now + 30 * DAY).toISOString(),
};

/** Build an ISO YYYY-MM-DD for N months ago. 30.44 days/month matches
 *  the helpers `monthsBetween` conversion factor. */
const monthsAgoIso = (months: number): string => {
  const ms = months * 30.44 * DAY;
  return new Date(now - ms).toISOString().slice(0, 10);
};

/** Build the fixture set for one student with the given evaluation row. */
const buildFixtures = (
  students: any[],
  evaluaciones: any[],
) => ({
  '/periodos': [activePeriod],
  '/docentes': [] as any[],
  '/estudiantes': students,
  '/evaluaciones': evaluaciones,
});

const buildService = async (responses: Record<string, any[] | (() => any[])>) => {
  const q10 = makeQ10(responses);
  const moduleRef = await Test.createTestingModule({
    providers: [
      AcademicService,
      RiskAnalysisService,
      { provide: Q10ClientService, useValue: q10 },
    ],
  }).compile();
  return moduleRef.get(AcademicService);
};

describe('AcademicService — riskFlags', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not flag a student with clean metrics (happy path)', async () => {
    const students = [
      {
        Codigo_estudiante: 'S-CLEAN',
        Primer_nombre: 'Ana',
        Primer_apellido: 'Silva',
        Nombre_nivel: 'A2',
        // 5 months in Regular → expected index 1 (A2). Current A2 → on track.
        Fecha_matricula: monthsAgoIso(5),
      },
    ];
    const evaluaciones = [
      {
        Codigo_estudiante: 'S-CLEAN',
        Nombre_curso: '01 R - Recife',
        Porcentaje_inasistencia: 5,
        Promedio_evaluacion: 8.5,
        Porcentaje_evaluado: 80,
      },
    ];

    const svc = await buildService(buildFixtures(students, evaluaciones));
    const result = await svc.academic();

    expect(result.riskFlags).toHaveLength(0);
    expect(result.summary.atRiskCount).toBe(0);
  });

  it('flags a student with inasistencia above 20% ("35% faltas")', async () => {
    const students = [
      {
        Codigo_estudiante: 'S-ABS',
        Primer_nombre: 'Bruno',
        Primer_apellido: 'Costa',
        Nombre_nivel: 'A2',
        Fecha_matricula: monthsAgoIso(5),
      },
    ];
    const evaluaciones = [
      {
        Codigo_estudiante: 'S-ABS',
        Nombre_curso: '01 R - Recife',
        Porcentaje_inasistencia: 35,
        Promedio_evaluacion: 8.5,
        Porcentaje_evaluado: 80,
      },
    ];

    const svc = await buildService(buildFixtures(students, evaluaciones));
    const result = await svc.academic();

    expect(result.riskFlags).toHaveLength(1);
    expect(result.riskFlags[0].flags).toEqual(
      expect.arrayContaining([expect.stringContaining('35% faltas')]),
    );
  });

  it('flags a student with promedio below threshold ("nota 4.0/10")', async () => {
    const students = [
      {
        Codigo_estudiante: 'S-LOW',
        Primer_nombre: 'Carla',
        Primer_apellido: 'Dias',
        Nombre_nivel: 'A2',
        Fecha_matricula: monthsAgoIso(5),
      },
    ];
    const evaluaciones = [
      {
        Codigo_estudiante: 'S-LOW',
        Nombre_curso: '01 R - Recife',
        Porcentaje_inasistencia: 5,
        Promedio_evaluacion: 4.0,
        Porcentaje_evaluado: 80,
      },
    ];

    const svc = await buildService(buildFixtures(students, evaluaciones));
    const result = await svc.academic();

    expect(result.riskFlags).toHaveLength(1);
    expect(result.riskFlags[0].flags).toEqual(
      expect.arrayContaining([expect.stringContaining('nota 4.0/10')]),
    );
  });

  it('does NOT flag a student with promedio = 0 as a low-grade case', async () => {
    const students = [
      {
        Codigo_estudiante: 'S-NODATA',
        Primer_nombre: 'Diego',
        Primer_apellido: 'Esposito',
        Nombre_nivel: 'A2',
        Fecha_matricula: monthsAgoIso(5),
      },
    ];
    const evaluaciones = [
      {
        Codigo_estudiante: 'S-NODATA',
        Nombre_curso: '01 R - Recife',
        Porcentaje_inasistencia: 5,
        Promedio_evaluacion: 0,
        Porcentaje_evaluado: 80,
      },
    ];

    const svc = await buildService(buildFixtures(students, evaluaciones));
    const result = await svc.academic();

    // No flags at all — promedio=0 means "no data", inasistencia is fine,
    // and A2 at 5 months Regular is on track.
    expect(result.riskFlags).toHaveLength(0);
    expect(result.summary.atRiskCount).toBe(0);
  });

  it('flags a stalled Regular student (6 months, still A1)', async () => {
    const students = [
      {
        Codigo_estudiante: 'S-STALL',
        Primer_nombre: 'Elena',
        Primer_apellido: 'Ferreira',
        Nombre_nivel: 'A1',
        // 6 months / 3 months-per-level Regular = expected index 2 (B1)
        Fecha_matricula: monthsAgoIso(6),
      },
    ];
    const evaluaciones = [
      {
        Codigo_estudiante: 'S-STALL',
        Nombre_curso: '01 R - Recife',
        Porcentaje_inasistencia: 5,
        Promedio_evaluacion: 8.5,
        Porcentaje_evaluado: 80,
      },
    ];

    const svc = await buildService(buildFixtures(students, evaluaciones));
    const result = await svc.academic();

    expect(result.riskFlags).toHaveLength(1);
    expect(result.riskFlags[0].flags).toEqual(
      expect.arrayContaining([expect.stringContaining('nivel(es) atrás')]),
    );
  });

  it('does NOT add a stalled-progression flag for Desconocida modality', async () => {
    const students = [
      {
        Codigo_estudiante: 'S-UNK',
        Primer_nombre: 'Fabio',
        Primer_apellido: 'Gomes',
        Nombre_nivel: 'A1',
        Fecha_matricula: monthsAgoIso(12),
      },
    ];
    // Unrecognised course string → classifyModality returns 'Desconocida'.
    const evaluaciones = [
      {
        Codigo_estudiante: 'S-UNK',
        Nombre_curso: 'Curso raro sin patrón',
        Porcentaje_inasistencia: 5,
        Promedio_evaluacion: 8.5,
        Porcentaje_evaluado: 80,
      },
    ];

    const svc = await buildService(buildFixtures(students, evaluaciones));
    const result = await svc.academic();

    // No flags — stalled branch is gated on modality !== 'Desconocida'.
    expect(result.riskFlags).toHaveLength(0);
    expect(result.summary.atRiskCount).toBe(0);
  });

  it('sorts riskFlags by flag count desc, tie-broken by inasistencia desc', async () => {
    const students = [
      {
        // 1 flag, high inasistencia
        Codigo_estudiante: 'S-ONE-HIGH',
        Primer_nombre: 'Gabriela',
        Primer_apellido: 'Hernández',
        Nombre_nivel: 'A2',
        Fecha_matricula: monthsAgoIso(5),
      },
      {
        // 3 flags — should be first
        Codigo_estudiante: 'S-THREE',
        Primer_nombre: 'Hugo',
        Primer_apellido: 'Iriarte',
        Nombre_nivel: 'A1',
        Fecha_matricula: monthsAgoIso(6),
      },
      {
        // 1 flag, lower inasistencia — breaks tie against S-ONE-HIGH
        Codigo_estudiante: 'S-ONE-LOW',
        Primer_nombre: 'Irene',
        Primer_apellido: 'Juárez',
        Nombre_nivel: 'A2',
        Fecha_matricula: monthsAgoIso(5),
      },
    ];
    const evaluaciones = [
      {
        Codigo_estudiante: 'S-ONE-HIGH',
        Nombre_curso: '01 R - Recife',
        Porcentaje_inasistencia: 40,
        Promedio_evaluacion: 8.5,
        Porcentaje_evaluado: 80,
      },
      {
        // 3 flags: faltas + low grade + stalled
        Codigo_estudiante: 'S-THREE',
        Nombre_curso: '01 R - Recife',
        Porcentaje_inasistencia: 25,
        Promedio_evaluacion: 3.0,
        Porcentaje_evaluado: 80,
      },
      {
        Codigo_estudiante: 'S-ONE-LOW',
        Nombre_curso: '01 R - Recife',
        Porcentaje_inasistencia: 22,
        Promedio_evaluacion: 8.5,
        Porcentaje_evaluado: 80,
      },
    ];

    const svc = await buildService(buildFixtures(students, evaluaciones));
    const result = await svc.academic();

    expect(result.riskFlags).toHaveLength(3);
    expect(result.riskFlags[0].Codigo).toBe('S-THREE');
    expect(result.riskFlags[0].flags.length).toBe(3);
    expect(result.riskFlags[1].Codigo).toBe('S-ONE-HIGH');
    expect(result.riskFlags[2].Codigo).toBe('S-ONE-LOW');
    expect(result.riskFlags[1].inasistencia).toBeGreaterThan(
      result.riskFlags[2].inasistencia,
    );
  });

  it('summary.atRiskCount matches riskFlags.length', async () => {
    const students = [
      {
        Codigo_estudiante: 'S-FLAGGED-1',
        Primer_nombre: 'Julia',
        Primer_apellido: 'Klein',
        Nombre_nivel: 'A2',
        Fecha_matricula: monthsAgoIso(5),
      },
      {
        Codigo_estudiante: 'S-FLAGGED-2',
        Primer_nombre: 'Kevin',
        Primer_apellido: 'Lopes',
        Nombre_nivel: 'A2',
        Fecha_matricula: monthsAgoIso(5),
      },
      {
        Codigo_estudiante: 'S-CLEAN-2',
        Primer_nombre: 'Laura',
        Primer_apellido: 'Matos',
        Nombre_nivel: 'A2',
        Fecha_matricula: monthsAgoIso(5),
      },
    ];
    const evaluaciones = [
      {
        Codigo_estudiante: 'S-FLAGGED-1',
        Nombre_curso: '01 R - Recife',
        Porcentaje_inasistencia: 50,
        Promedio_evaluacion: 8.5,
        Porcentaje_evaluado: 80,
      },
      {
        Codigo_estudiante: 'S-FLAGGED-2',
        Nombre_curso: '01 R - Recife',
        Porcentaje_inasistencia: 5,
        Promedio_evaluacion: 3.5,
        Porcentaje_evaluado: 80,
      },
      {
        Codigo_estudiante: 'S-CLEAN-2',
        Nombre_curso: '01 R - Recife',
        Porcentaje_inasistencia: 5,
        Promedio_evaluacion: 8.5,
        Porcentaje_evaluado: 80,
      },
    ];

    const svc = await buildService(buildFixtures(students, evaluaciones));
    const result = await svc.academic();

    expect(result.summary.atRiskCount).toBe(result.riskFlags.length);
    expect(result.summary.atRiskCount).toBe(2);
  });
});
