import { Injectable } from '@nestjs/common';
import { Q10ClientService } from '../q10-client.service';
import { DashboardBaseService } from './dashboard-base.service';
import {
  ageBucket,
  ageFromBirthdate,
  cefrIndex,
  CEFR_LEVELS,
  classifyModality,
  cleanStr,
  currentlyActivePeriods,
  expectedLevelAdvance,
  groupCount,
  Item,
  Modality,
  monthsBetween,
  periodKey,
  previousPeriod,
  studentFullName,
} from './helpers';

@Injectable()
export class AcademicService extends DashboardBaseService {
  protected readonly logPrefix = 'academic';

  constructor(q10: Q10ClientService) {
    super(q10);
  }

  /**
   * Composition of the school + retention across periods. Everything here
   * comes straight out of /estudiantes (34 fields per record) so we don't
   * hit endpoints that are unavailable on this Q10 plan.
   *
   * Retention compares the student list of the currently-active period with
   * the one immediately before it (most recent Fecha_fin) — the classic
   * cohort shape: retained / churned / newcomers. `Condicion_matricula` is
   * NOT used for this because the live dump confirmed it's null for all P1
   * records on this tenant — the field was populated starting from P2.
   */
  async academic() {
    const errors: Record<string, string> = {};
    const degraded: Record<string, string> = {};

    const [periodos, docentes] = await Promise.all([
      this.tryFetch<Item>('periods', '/periodos', errors),
      this.tryFetch<Item>('teachers', '/docentes', errors),
    ]);

    const active = currentlyActivePeriods(periodos);
    const previous = previousPeriod(periodos, active);

    let currentStudents: Item[] = [];
    let previousStudents: Item[] = [];

    if (active.length > 0) {
      const lists = await Promise.all(
        active.map((p) =>
          this.tryFetch<Item>('students', '/estudiantes', errors, {
            Periodo: periodKey(p),
          }),
        ),
      );
      const seen = new Set<string>();
      for (const list of lists) {
        for (const s of list) {
          const id = cleanStr(s.Codigo_estudiante);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          currentStudents.push(s);
        }
      }
    } else {
      degraded.currentStudents = 'Sin períodos activos';
    }

    if (previous) {
      previousStudents = await this.tryFetch<Item>(
        'previousStudents',
        '/estudiantes',
        errors,
        { Periodo: periodKey(previous) },
      );
    } else {
      degraded.retention = 'Sin período anterior para comparar';
    }

    // ─── Retention / churn — set-based comparison ───
    const prevIds = new Set(previousStudents.map((s) => cleanStr(s.Codigo_estudiante)).filter(Boolean));
    const curIds = new Set(currentStudents.map((s) => cleanStr(s.Codigo_estudiante)).filter(Boolean));
    const retained = [...prevIds].filter((id) => curIds.has(id));
    const churned = [...prevIds].filter((id) => !curIds.has(id));
    const newcomers = [...curIds].filter((id) => !prevIds.has(id));

    const retention = {
      previousPeriod: previous ? cleanStr(previous.Nombre) : null,
      currentPeriod: active[0] ? cleanStr(active[0].Nombre) : null,
      previousTotal: prevIds.size,
      currentTotal: curIds.size,
      retained: retained.length,
      churned: churned.length,
      newcomers: newcomers.length,
      retentionRate: prevIds.size > 0 ? Math.round((retained.length / prevIds.size) * 100) : null,
      churnRate: prevIds.size > 0 ? Math.round((churned.length / prevIds.size) * 100) : null,
    };

    // ─── Pull /evaluaciones for faltas + promedio by student ───
    // This endpoint consolidates what /inasistencias should have returned
    // (empty on this tenant) — Cantidad_inasistencia is available here per
    // student-asignatura pairing. Best fallback for attendance signal.
    const evaluations = await this.tryFetch<Item>(
      'evaluations',
      '/evaluaciones',
      errors,
      { Programa: '01' },
    );
    const evalByStudent = new Map<string, Item[]>();
    for (const e of evaluations) {
      const id = cleanStr(e.Codigo_estudiante);
      if (!id) continue;
      if (!evalByStudent.has(id)) evalByStudent.set(id, []);
      evalByStudent.get(id)!.push(e);
    }

    // ─── Join students with their course/modality via /evaluaciones ───
    // Each student can have multiple asignatura rows (they matriculate in
    // several parallel modules). We pick the most recent / primary one by
    // assuming the row with the highest Consecutivo_curso is their active
    // class, then classify modality from its Nombre_curso.
    const enriched = currentStudents.map((s) => {
      const id = cleanStr(s.Codigo_estudiante);
      const evals = evalByStudent.get(id) ?? [];
      // Primary curso: the one with the highest Porcentaje_evaluado so far
      // (= their active/current module).
      const primary = evals.slice().sort(
        (a, b) => (Number(b.Porcentaje_evaluado) || 0) - (Number(a.Porcentaje_evaluado) || 0),
      )[0];
      const modality: Modality = primary
        ? classifyModality(primary.Nombre_curso)
        : 'Desconocida';
      const inasistencia = primary ? Number(primary.Porcentaje_inasistencia) || 0 : 0;
      const promedio = primary ? Number(primary.Promedio_evaluacion) || 0 : 0;
      const cursoNombre = primary ? cleanStr(primary.Nombre_curso) : '';
      return { student: s, modality, inasistencia, promedio, cursoNombre, primary };
    });

    // ─── Distributions ───
    const byJornada = groupCount(currentStudents, (s) => s.Nombre_jornada);
    const byNivel = groupCount(currentStudents, (s) => s.Nombre_nivel);
    const bySedeJornada = groupCount(currentStudents, (s) => s.Nombre_sedejornada);
    const byModality = groupCount(enriched, (e) => e.modality);
    // City-class derived from "NN R - Cidade" pattern in Nombre_curso.
    const byCity = groupCount(enriched, (e) => {
      const m = e.cursoNombre.match(/-\s*(.+)$/);
      return m ? m[1].trim() : 'Sin clase asignada';
    });
    const byCondicion = groupCount(currentStudents, (s) =>
      cleanStr(s.Condicion_matricula) || 'Sin dato',
    );

    // Gender + age
    const gender = groupCount(currentStudents, (s) => {
      const g = cleanStr(s.Genero).toUpperCase();
      if (g === 'F') return 'Femenino';
      if (g === 'M') return 'Masculino';
      return 'No informado';
    });
    const ages = currentStudents
      .map((s) => ageFromBirthdate(s.Fecha_nacimiento))
      .filter((a): a is number => a !== null);
    const ageDistribution: Record<string, number> = {};
    for (const a of ages) {
      const bucket = ageBucket(a);
      ageDistribution[bucket] = (ageDistribution[bucket] ?? 0) + 1;
    }
    const avgAge = ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : null;

    // ─── Risk flags — high-inasistencia, low-grade, level-stalled ───
    // Threshold choices are conservative defaults; operators can refine once
    // they eyeball real data.
    const ABSENCE_THRESHOLD = 20;    // % inasistencia above which we flag
    const GRADE_THRESHOLD = 0.6;     // Promedio_evaluacion below which we flag
    const STALL_MULTIPLIER = 1.5;    // behind expected progression × this = stalled

    const riskFlags = enriched
      .map(({ student, modality, inasistencia, promedio, cursoNombre }) => {
        const months = monthsBetween(student.Fecha_matricula) ?? 0;
        const expectedIdx = modality === 'Desconocida'
          ? null
          : expectedLevelAdvance(modality, months);
        const currentIdx = cefrIndex(student.Nombre_nivel);
        const behindLevels = expectedIdx !== null && currentIdx !== null
          ? Math.max(0, expectedIdx - currentIdx)
          : 0;
        const flags: string[] = [];
        if (inasistencia > ABSENCE_THRESHOLD) flags.push(`${Math.round(inasistencia)}% faltas`);
        if (promedio > 0 && promedio < GRADE_THRESHOLD) flags.push(`nota ${promedio.toFixed(2)}`);
        if (modality !== 'Desconocida' && months >= STALL_MULTIPLIER * 3 && behindLevels > 0) {
          flags.push(`${behindLevels} nivel(es) atrás del esperado`);
        }
        if (flags.length === 0) return null;
        return {
          Codigo: cleanStr(student.Codigo_estudiante),
          nombre: studentFullName(student) || '—',
          nivel: cleanStr(student.Nombre_nivel),
          modality,
          curso: cursoNombre || '—',
          mesesMatriculado: months,
          inasistencia: Math.round(inasistencia),
          promedio,
          flags,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.flags.length - a.flags.length || b.inasistencia - a.inasistencia);

    return {
      generatedAt: new Date().toISOString(),
      partial: Object.keys(errors).length > 0,
      errors,
      degraded,
      summary: {
        totalStudents: currentStudents.length,
        totalTeachers: docentes.length,
        avgAge,
        currentPeriod: retention.currentPeriod,
        atRiskCount: riskFlags.length,
        regularCount: byModality['Regular'] ?? 0,
        intensivoCount: byModality['Semi Intensivo'] ?? 0,
        unclassifiedCount: byModality['Desconocida'] ?? 0,
      },
      retention,
      distributions: {
        byJornada,
        byNivel,
        bySedeJornada,
        byModality,
        byCity,
        byCondicion,
        byGender: gender,
        byAge: ageDistribution,
      },
      // CEFR progression stats — only among classified students.
      progression: {
        levelsOrder: [...CEFR_LEVELS],
        distributionRegular: groupCount(
          enriched.filter((e) => e.modality === 'Regular'),
          (e) => cleanStr(e.student.Nombre_nivel) || 'Sin nivel',
        ),
        distributionIntensivo: groupCount(
          enriched.filter((e) => e.modality === 'Semi Intensivo'),
          (e) => cleanStr(e.student.Nombre_nivel) || 'Sin nivel',
        ),
      },
      riskFlags: riskFlags.slice(0, 30),
      teachers: docentes.slice(0, 20).map((d) => ({
        Codigo: cleanStr(d.Codigo),
        Nombres: [d.Primer_nombre, d.Segundo_nombre].map(cleanStr).filter(Boolean).join(' '),
        Apellidos: [d.Primer_apellido, d.Segundo_apellido].map(cleanStr).filter(Boolean).join(' '),
        Email: cleanStr(d.Email),
        Celular: cleanStr(d.Celular),
        Genero: cleanStr(d.Genero),
      })),
    };
  }
}
