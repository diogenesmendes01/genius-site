import { Injectable, Logger } from '@nestjs/common';
import { Q10ClientService } from '../q10/q10-client.service';

export interface StudentForSurvey {
  aluno_codigo: string;
  aluno_nome: string;
  turma_codigo: string;
  turma_nome: string;
  professor_nome: string | null;
}

interface Q10Student {
  Codigo_estudiante?: string;
  Codigo?: string;
  Id?: string;
  Nombres?: string;
  Apellidos?: string;
  Codigo_programa?: string;
  Estado?: string;
  Activo?: string | boolean;
}

interface Q10Program {
  Codigo?: string;
  Id?: string;
  Nombre?: string;
}

interface Q10Course {
  Codigo_programa?: string;
  Nombre_docente?: string;
  Codigo_docente?: string;
  Estado?: string;
}

const ACTIVE_STATES = new Set(['activo', 'activa', 'true', '1', 'active']);
function isActiveStudent(s: Q10Student): boolean {
  if (s.Activo === true) return true;
  const flag = String(s.Activo ?? s.Estado ?? '').toLowerCase();
  return ACTIVE_STATES.has(flag);
}

function studentId(s: Q10Student): string {
  return String(s.Codigo_estudiante ?? s.Codigo ?? s.Id ?? '');
}

function fullName(s: Q10Student): string {
  return [s.Nombres, s.Apellidos].filter(Boolean).join(' ').trim();
}

/**
 * Resolves the list of students that should receive a survey for a given
 * month, along with their class / teacher attribution.
 *
 * Note on the data model: Q10 (the source of truth) does not expose a clean
 * student → course join in the endpoints we currently wrap. We therefore
 * group students by `Codigo_programa` and treat the program as the "turma".
 * Professor name is best-effort: we look at the courses in that program and
 * pick the most-frequent teacher. When the operator needs finer granularity
 * (e.g. per-section turmas), they'll need to adjust either Q10's data or
 * this resolver — flagged in the PR description.
 */
@Injectable()
export class StudentSourceService {
  private readonly logger = new Logger(StudentSourceService.name);

  constructor(private readonly q10: Q10ClientService) {}

  async fetchActiveStudentsForSurvey(): Promise<StudentForSurvey[]> {
    const [students, programs, courses] = await Promise.all([
      this.q10.getAll<Q10Student>('/estudiantes').catch((err) => {
        this.logger.error(`/estudiantes fetch failed: ${(err as Error).message}`);
        throw err;
      }),
      this.q10.getAll<Q10Program>('/programas').catch(() => [] as Q10Program[]),
      this.q10.getAll<Q10Course>('/cursos').catch(() => [] as Q10Course[]),
    ]);

    const programNameByCode = new Map<string, string>();
    for (const p of programs) {
      const code = String(p.Codigo ?? p.Id ?? '');
      const name = String(p.Nombre ?? '').trim();
      if (code && name) programNameByCode.set(code, name);
    }

    // Most-frequent teacher per program. We iterate `cursos`, count teacher
    // occurrences inside each program, and pick the dominant one.
    const teacherCounts = new Map<string, Map<string, number>>();
    for (const c of courses) {
      const prog = String(c.Codigo_programa ?? '');
      const teacher = String(c.Nombre_docente ?? '').trim();
      if (!prog || !teacher) continue;
      const inner = teacherCounts.get(prog) ?? new Map<string, number>();
      inner.set(teacher, (inner.get(teacher) ?? 0) + 1);
      teacherCounts.set(prog, inner);
    }
    const dominantTeacherByProgram = new Map<string, string | null>();
    for (const [prog, counts] of teacherCounts) {
      let best: string | null = null;
      let bestCount = 0;
      for (const [name, n] of counts) {
        if (n > bestCount) {
          best = name;
          bestCount = n;
        }
      }
      dominantTeacherByProgram.set(prog, best);
    }

    const out: StudentForSurvey[] = [];
    for (const s of students) {
      if (!isActiveStudent(s)) continue;
      const id = studentId(s);
      if (!id) continue;
      const turmaCodigo = String(s.Codigo_programa ?? '');
      if (!turmaCodigo) continue;
      out.push({
        aluno_codigo: id,
        aluno_nome: fullName(s) || id,
        turma_codigo: turmaCodigo,
        turma_nome: programNameByCode.get(turmaCodigo) ?? turmaCodigo,
        professor_nome: dominantTeacherByProgram.get(turmaCodigo) ?? null,
      });
    }

    return out;
  }
}
