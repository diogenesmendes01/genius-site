import { Injectable, Logger } from '@nestjs/common';
import { Q10ClientService } from '../q10-client.service';
import {
  ageBucket,
  ageFromBirthdate,
  cleanStr,
  currentlyActivePeriods,
  groupCount,
  Item,
  periodKey,
  previousPeriod,
  safeArray,
} from './helpers';

@Injectable()
export class AcademicService {
  private readonly logger = new Logger(AcademicService.name);

  constructor(private readonly q10: Q10ClientService) {}

  private async tryFetch<T>(
    key: string,
    path: string,
    errors: Record<string, string>,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    try {
      return safeArray(await this.q10.getAll(path, params)) as T[];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors[key] = message;
      this.logger.warn(`[academic] ${path} failed: ${message}`);
      return [];
    }
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

    // ─── Distributions ───
    const byJornada = groupCount(currentStudents, (s) => s.Nombre_jornada);
    const byNivel = groupCount(currentStudents, (s) => s.Nombre_nivel);
    const bySedeJornada = groupCount(currentStudents, (s) => s.Nombre_sedejornada);
    const byProgram = groupCount(currentStudents, (s) => s.Nombre_programa);
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
      },
      retention,
      distributions: {
        byJornada,
        byNivel,
        bySedeJornada,
        byProgram,
        byCondicion,
        byGender: gender,
        byAge: ageDistribution,
      },
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
