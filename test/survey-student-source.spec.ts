import { StudentSourceService } from '../src/survey/student-source.service';

const makeQ10 = (responses: Record<string, any[]>) =>
  ({
    getAll: jest.fn(async (path: string) => responses[path] ?? []),
  }) as any;

describe('StudentSourceService.fetchActiveStudentsForSurvey', () => {
  it('keeps only active students and emits one entry per aluno_codigo', async () => {
    const q10 = makeQ10({
      '/estudiantes': [
        { Codigo_estudiante: 'EST-001', Nombres: 'Ana', Apellidos: 'García', Codigo_programa: 'P1', Estado: 'Activo' },
        { Codigo_estudiante: 'EST-002', Nombres: 'Bruno', Apellidos: 'Cruz', Codigo_programa: 'P1', Estado: 'Activo' },
        { Codigo_estudiante: 'EST-003', Nombres: 'Cesar', Apellidos: 'Diaz', Codigo_programa: 'P2', Estado: 'Inactivo' },
      ],
      '/programas': [
        { Codigo: 'P1', Nombre: 'Inglés Básico' },
        { Codigo: 'P2', Nombre: 'Inglés Avanzado' },
      ],
      '/cursos': [
        { Codigo_programa: 'P1', Nombre_docente: 'Prof Ana' },
        { Codigo_programa: 'P1', Nombre_docente: 'Prof Ana' },
        { Codigo_programa: 'P1', Nombre_docente: 'Prof Beto' },
      ],
    });

    const svc = new StudentSourceService(q10);
    const out = await svc.fetchActiveStudentsForSurvey();

    expect(out.map((s) => s.aluno_codigo)).toEqual(['EST-001', 'EST-002']);
    expect(out[0]).toEqual({
      aluno_codigo: 'EST-001',
      aluno_nome: 'Ana García',
      turma_codigo: 'P1',
      turma_nome: 'Inglés Básico',
      professor_nome: 'Prof Ana', // dominant teacher in P1 (2 vs 1 occurrences)
    });
  });

  it('deduplicates a student that Q10 returns multiple times', async () => {
    // Same student appears twice — once per program. The contract is one
    // token per aluno per mês, so we keep the first occurrence and drop
    // the rest. The DB-level unique constraint is the second line of
    // defense if a refactor ever skips this dedup.
    const q10 = makeQ10({
      '/estudiantes': [
        { Codigo_estudiante: 'EST-DUP', Nombres: 'Dup', Apellidos: 'A', Codigo_programa: 'P1', Estado: 'Activo' },
        { Codigo_estudiante: 'EST-DUP', Nombres: 'Dup', Apellidos: 'A', Codigo_programa: 'P2', Estado: 'Activo' },
        { Codigo_estudiante: 'EST-OTHER', Nombres: 'Other', Apellidos: 'B', Codigo_programa: 'P1', Estado: 'Activo' },
      ],
      '/programas': [],
      '/cursos': [],
    });

    const svc = new StudentSourceService(q10);
    const out = await svc.fetchActiveStudentsForSurvey();

    expect(out.map((s) => s.aluno_codigo).sort()).toEqual(['EST-DUP', 'EST-OTHER']);
    // Kept the first occurrence's program assignment.
    expect(out.find((s) => s.aluno_codigo === 'EST-DUP')!.turma_codigo).toBe('P1');
  });

  it('skips students without an aluno_codigo or program', async () => {
    const q10 = makeQ10({
      '/estudiantes': [
        { Nombres: 'Sin', Apellidos: 'Codigo', Codigo_programa: 'P1', Estado: 'Activo' },
        { Codigo_estudiante: 'EST-X', Nombres: 'Sin', Apellidos: 'Programa', Estado: 'Activo' },
        { Codigo_estudiante: 'EST-OK', Nombres: 'OK', Apellidos: 'Test', Codigo_programa: 'P1', Estado: 'Activo' },
      ],
      '/programas': [],
      '/cursos': [],
    });

    const svc = new StudentSourceService(q10);
    const out = await svc.fetchActiveStudentsForSurvey();
    expect(out.map((s) => s.aluno_codigo)).toEqual(['EST-OK']);
  });
});
