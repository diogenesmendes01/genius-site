import { Injectable } from '@nestjs/common';
import { Q10ClientService } from '../q10-client.service';
import { DashboardBaseService } from './dashboard-base.service';
import {
  classifyModality,
  cleanStr,
  currentlyActivePeriods,
  groupCount,
  Item,
  Modality,
  periodKey,
} from './helpers';

// /cursos reports Estado as "Abierto" / "Cerrado" / "Finalizado" — not the
// Activo/Inactivo that /periodos and /estudiantes use. `isActivo` from
// helpers would reject every open course, so we match the /cursos vocabulary
// explicitly here.
const OPEN_COURSE_STATES = new Set(['abierto', 'abierta', 'activo', 'active', 'true', '1']);
function isOpenCourse(estado: unknown): boolean {
  if (estado === true) return true;
  return OPEN_COURSE_STATES.has(cleanStr(estado).toLowerCase());
}

/**
 * Turmas (course sections) view — built on top of /cursos, which turned out
 * to be the "gold" endpoint for this tenant. Each course record ships with
 * Cupo_maximo + Cantidad_estudiantes_matriculados, so we can compute the
 * one metric the operator actually asked for (ocupação) without crawling
 * /estudiantes for every class.
 *
 * Alerting is intentionally simple — the operator will refine thresholds
 * once they've stared at real numbers for a week. Particulares are not
 * cadastradas in Q10 yet (confirmed with the user); once they are, they'll
 * surface here automatically via /cursos and we'll split them out by
 * modality === 'Desconocida' + Nombre_pensum.
 */
@Injectable()
export class TurmasService extends DashboardBaseService {
  protected readonly logPrefix = 'turmas';

  // Thresholds chosen by conservation — easy to tune once real data lands.
  private readonly UNDERBOOKED_ABSOLUTE = 5;   // < 5 students = subutilized
  private readonly OVERBOOKED_PERCENT = 90;    // >= 90% cupo = quase cheio

  constructor(q10: Q10ClientService) {
    super(q10);
  }

  async turmas() {
    const errors: Record<string, string> = {};
    const degraded: Record<string, string> = {};

    // Cap /cursos at 5k: course catalog is bounded, conservative safety limit.
    const [periodos, cursos] = await Promise.all([
      this.tryFetch<Item>('periods', '/periodos', errors),
      this.tryFetch<Item>('courses', '/cursos', errors, undefined, {
        maxRecords: 5_000,
        degraded,
      }),
    ]);

    const active = currentlyActivePeriods(periodos);
    const activeKeys = new Set(active.map((p) => periodKey(p)));

    // Only consider courses in an active period AND with Estado = Abierto.
    // Q10 keeps historic courses (Cerrado/Finalizado) in the same endpoint;
    // the Turmas tab is about *what's happening now*.
    const currentCourses = cursos.filter((c) => {
      const period = cleanStr(c.Consecutivo_periodo);
      const matchesPeriod = activeKeys.size === 0 || activeKeys.has(period);
      return matchesPeriod && isOpenCourse(c.Estado);
    });

    if (currentCourses.length === 0 && cursos.length > 0) {
      degraded.currentCourses = 'No hay cursos en estado activo para los períodos vigentes';
    }

    const enriched = currentCourses.map((c) => {
      const cupo = Number(c.Cupo_maximo) || 0;
      const matriculados = Number(c.Cantidad_estudiantes_matriculados) || 0;
      const ocupacion = cupo > 0 ? Math.round((matriculados / cupo) * 100) : null;
      const modality: Modality = classifyModality(c.Nombre);
      // "NN X - City" → "City" (may be undefined if the pattern doesn't match).
      const cityMatch = cleanStr(c.Nombre).match(/-\s*(.+)$/);
      const city = cityMatch ? cityMatch[1].trim() : 'Sin clase asignada';
      return {
        Codigo: cleanStr(c.Codigo),
        Consecutivo: cleanStr(c.Consecutivo),
        Nombre: cleanStr(c.Nombre),
        Nivel: cleanStr(c.Nombre_asignatura),
        Sede: cleanStr(c.Nombre_sede_jornada),
        Docente: cleanStr(c.Nombre_docente),
        CodigoDocente: cleanStr(c.Codigo_docente),
        Periodo: cleanStr(c.Nombre_periodo),
        FechaInicio: cleanStr(c.Fecha_inicio).slice(0, 10),
        FechaFin: cleanStr(c.Fecha_fin).slice(0, 10),
        Estado: cleanStr(c.Estado),
        cupo,
        matriculados,
        ocupacion,
        disponibles: Math.max(0, cupo - matriculados),
        modality,
        city,
      };
    });

    // ─── Alerts — two buckets: overbooked and underbooked ───
    const overbooked = enriched.filter(
      (e) => e.ocupacion !== null && e.ocupacion >= this.OVERBOOKED_PERCENT,
    );
    const underbooked = enriched.filter(
      (e) => e.matriculados > 0 && e.matriculados < this.UNDERBOOKED_ABSOLUTE,
    );
    const empty = enriched.filter((e) => e.matriculados === 0);

    // ─── Distributions ───
    const byModality = groupCount(enriched, (e) => e.modality);
    const byCity = groupCount(enriched, (e) => e.city);
    const bySede = groupCount(enriched, (e) => e.Sede || 'Sin sede');
    const byNivel = groupCount(enriched, (e) => e.Nivel || 'Sin nivel');

    // ─── Teachers: one row per Codigo_docente, with course count + total seats ───
    const teacherMap = new Map<string, {
      codigo: string;
      nombre: string;
      cursos: number;
      estudiantes: number;
      cupoTotal: number;
    }>();
    for (const e of enriched) {
      if (!e.CodigoDocente) continue;
      const row = teacherMap.get(e.CodigoDocente) ?? {
        codigo: e.CodigoDocente,
        nombre: e.Docente || '—',
        cursos: 0,
        estudiantes: 0,
        cupoTotal: 0,
      };
      row.cursos += 1;
      row.estudiantes += e.matriculados;
      row.cupoTotal += e.cupo;
      teacherMap.set(e.CodigoDocente, row);
    }
    const teachersByLoad = [...teacherMap.values()].sort(
      (a, b) => b.cursos - a.cursos || b.estudiantes - a.estudiantes,
    );

    // ─── Aggregate numbers for the KPI strip ───
    const totalCupo = enriched.reduce((a, e) => a + e.cupo, 0);
    const totalMatriculados = enriched.reduce((a, e) => a + e.matriculados, 0);
    const ocupacionMedia = totalCupo > 0
      ? Math.round((totalMatriculados / totalCupo) * 100)
      : null;

    return {
      generatedAt: new Date().toISOString(),
      partial: Object.keys(errors).length > 0,
      errors,
      degraded,
      summary: {
        totalCursos: enriched.length,
        totalCupo,
        totalMatriculados,
        ocupacionMedia,
        overbookedCount: overbooked.length,
        underbookedCount: underbooked.length,
        emptyCount: empty.length,
        docentesActivos: teacherMap.size,
      },
      distributions: {
        byModality,
        byCity,
        bySede,
        byNivel,
      },
      alerts: {
        overbooked: overbooked
          .slice()
          .sort((a, b) => (b.ocupacion ?? 0) - (a.ocupacion ?? 0))
          .slice(0, 20),
        underbooked: underbooked
          .slice()
          .sort((a, b) => a.matriculados - b.matriculados)
          .slice(0, 20),
        empty: empty.slice(0, 20),
      },
      courses: enriched
        .slice()
        .sort((a, b) => (b.ocupacion ?? 0) - (a.ocupacion ?? 0)),
      teachers: teachersByLoad.slice(0, 30),
      // Surface gaps explicitly — the UI shows these as footer notes so the
      // operator knows *why* the numbers might be incomplete.
      notes: {
        particulares: 'Aulas particulares no están cadastradas en Q10 — no contabilizadas.',
        cancelamentos: 'Cancelaciones no son registradas en Q10 — el churn se calcula por ausencia entre períodos.',
      },
    };
  }
}
