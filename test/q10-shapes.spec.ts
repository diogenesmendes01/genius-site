import { Test } from '@nestjs/testing';
import { AcademicService } from '../src/q10/dashboard/academic.service';
import { FinancialService } from '../src/q10/dashboard/financial.service';
import { RiskAnalysisService } from '../src/q10/dashboard/risk-analysis.service';
import { TurmasService } from '../src/q10/dashboard/turmas.service';
import { Q10ClientService } from '../src/q10/q10-client.service';

/**
 * Regression tests for the empirical Q10 contracts we observed via two live
 * probes. Each suite pipes a fixture that mirrors the redacted probe output
 * through the real service and asserts the behaviour downstream consumers
 * rely on.
 */

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

const activePeriod = {
  Consecutivo: 'P-NOW',
  Nombre: 'Período Activo',
  Estado: 'Activo',
  Fecha_inicio: new Date(now - 10 * DAY).toISOString(),
  Fecha_fin: new Date(now + 30 * DAY).toISOString(),
};

const makeQ10 = (responses: Record<string, any[] | (() => any[])>) =>
  ({
    getAll: jest.fn(async (path: string) => {
      const v = responses[path];
      if (typeof v === 'function') return v();
      return v ?? [];
    }),
  } as any);

const buildTurmas = (responses: Record<string, any[] | (() => any[])>) =>
  new TurmasService(makeQ10(responses));

const buildFinancial = (responses: Record<string, any[] | (() => any[])>) =>
  new FinancialService(makeQ10(responses));

const buildAcademic = async (responses: Record<string, any[] | (() => any[])>) => {
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

describe('TurmasService — real /cursos shape from probe', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses an overbooked course (Cantidad_estudiantes_matriculados > Cupo_maximo)', async () => {
    const overbookedCourse = {
      Consecutivo: 13,
      Codigo: '11 - A1',
      Nombre: '11 R - Recife',
      Nombre_asignatura: 'A1',
      Nombre_sede_jornada: 'Principal - Mañana',
      Codigo_docente: '221556167578',
      Nombre_docente: 'Teacher X',
      Cupo_maximo: 16,
      Cantidad_estudiantes_matriculados: 17, // overbooked — real edge case
      Estado: 'Abierto',
      Consecutivo_periodo: 'P-NOW',
      Nombre_periodo: '2026',
      Fecha_inicio: '2026-03-17T00:00:00',
      Fecha_fin: '2026-06-09T00:00:00',
    };

    const svc = buildTurmas({
      '/periodos': [activePeriod],
      '/cursos': [overbookedCourse],
    });

    const result = await svc.turmas();

    expect(result.alerts.overbooked).toHaveLength(1);
    expect(result.alerts.overbooked[0].Codigo).toBe('11 - A1');
    expect(result.alerts.overbooked[0].ocupacion).toBe(106); // Math.round(17/16*100)
    expect(result.summary.totalCupo).toBe(16);
    expect(result.summary.totalMatriculados).toBe(17);
  });
});

describe('FinancialService — /pagos with null Codigo_programa and zero Valor_pagado', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('tolerates null programa + zero-valued payments without NaN', async () => {
    // Mirrors the probe: 100% null Codigo_programa and a mix of real + zero
    // payments. We assert the pipeline doesn't choke and that the null
    // programa groups under "Sin programa" in revenueByConcept.
    const pagos = [
      {
        // Real-ish payment — still has null Codigo_programa but a Nombre_programa
        // so the bucket carries a label.
        Codigo_persona: 'P-001',
        Codigo_programa: null,
        Nombre_programa: 'Curso de Portugués',
        Nombre_producto: 'Mensualidad 14 R - Recife',
        Valor_pagado: 350,
        Fecha_pago: new Date(now - 5 * DAY).toISOString(),
      },
      {
        // Edge case: both programa fields null and a zero value.
        Codigo_persona: 'P-002',
        Codigo_programa: null,
        Nombre_programa: null,
        Nombre_producto: 'Matrícula',
        Valor_pagado: 0,
        Fecha_pago: new Date(now - 2 * DAY).toISOString(),
      },
    ];

    const svc = buildFinancial({
      '/periodos': [activePeriod],
      '/pagos': pagos,
      '/estudiantes': [],
      '/pagosPendientes': [],
    });

    const result = await svc.financial(12);

    // Nothing is NaN anywhere in the summary.
    for (const [key, value] of Object.entries(result.summary)) {
      if (typeof value === 'number') {
        expect(Number.isNaN(value)).toBe(false);
      }
      void key;
    }

    // Null programa → "Sin programa" bucket.
    expect(result.charts.revenueByConcept).toHaveProperty('Sin programa');
    expect(result.charts.revenueByConcept['Sin programa']).toBe(0);

    // totalRevenue reflects the single real payment.
    expect(result.summary.totalRevenue).toBe(350);

    // No hard assertion on payingStudents — issue #12 may change this — but
    // it must at least be a finite number.
    expect(Number.isFinite(result.summary.payingStudents)).toBe(true);
  });
});

describe('AcademicService — /evaluaciones with 0-10 scale Promedio_evaluacion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not choke on 0-10 values; surfaces them in riskFlags (grade threshold bug tracked in issue #12)', async () => {
    const students = [
      {
        Codigo_estudiante: 'S-01',
        Primer_nombre: 'Student',
        Primer_apellido: 'A',
        Nombre_nivel: 'A2',
        Fecha_matricula: new Date(now - 5 * 30.44 * DAY).toISOString().slice(0, 10),
      },
      {
        Codigo_estudiante: 'S-02',
        Primer_nombre: 'Student',
        Primer_apellido: 'B',
        Nombre_nivel: 'A2',
        Fecha_matricula: new Date(now - 5 * 30.44 * DAY).toISOString().slice(0, 10),
      },
    ];
    const evaluaciones = [
      {
        Codigo_estudiante: 'S-01',
        Nombre_curso: '01 R - Recife',
        Porcentaje_inasistencia: 30, // triggers flag regardless of grade scale
        Promedio_evaluacion: 6.1, // 0-10 scale
        Porcentaje_evaluado: 80,
      },
      {
        Codigo_estudiante: 'S-02',
        Nombre_curso: '01 R - Recife',
        Porcentaje_inasistencia: 30,
        Promedio_evaluacion: 1.4, // 0-10 scale
        Porcentaje_evaluado: 80,
      },
    ];

    const svc = await buildAcademic({
      '/periodos': [activePeriod],
      '/docentes': [],
      '/estudiantes': students,
      '/evaluaciones': evaluaciones,
    });

    const result = await svc.academic();

    // Pipeline did not throw and returned the promedio values verbatim.
    const promedios = result.riskFlags.map((r) => r.promedio).sort((a, b) => a - b);
    expect(promedios).toEqual([1.4, 6.1]);
  });
});

describe('TurmasService — /cursos filter vocabulary regression guard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('only counts Estado="Abierto"; filters Cerrado and Finalizado (do not reinstate generic isActivo)', async () => {
    const cursos = [
      {
        Codigo: 'OPEN',
        Consecutivo_periodo: 'P-NOW',
        Nombre: '01 R - Recife',
        Estado: 'Abierto',
        Cupo_maximo: 10,
        Cantidad_estudiantes_matriculados: 5,
      },
      {
        Codigo: 'CLOSED',
        Consecutivo_periodo: 'P-NOW',
        Nombre: '02 R - Recife',
        Estado: 'Cerrado',
        Cupo_maximo: 10,
        Cantidad_estudiantes_matriculados: 8,
      },
      {
        Codigo: 'FINISHED',
        Consecutivo_periodo: 'P-NOW',
        Nombre: '03 R - Recife',
        Estado: 'Finalizado',
        Cupo_maximo: 10,
        Cantidad_estudiantes_matriculados: 9,
      },
    ];

    const svc = buildTurmas({
      '/periodos': [activePeriod],
      '/cursos': cursos,
    });

    const result = await svc.turmas();

    expect(result.summary.totalCursos).toBe(1);
    expect(result.courses[0].Codigo).toBe('OPEN');
  });
});
