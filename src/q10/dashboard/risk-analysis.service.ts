import { Injectable } from '@nestjs/common';
import {
  cefrIndex,
  cleanStr,
  expectedLevelAdvance,
  Item,
  Modality,
  monthsBetween,
  studentFullName,
} from './helpers';

/**
 * Thresholds for flagging at-risk students. Exported so tuning lives in a
 * single place and can be referenced from tests / docs if needed.
 */
export const ABSENCE_THRESHOLD = 20;   // % inasistencia above which we flag
export const GRADE_THRESHOLD = 0.6;    // Promedio_evaluacion below which we flag
export const STALL_MULTIPLIER = 1.5;   // behind expected progression × this = stalled

/**
 * Shape produced by the enrichment step in AcademicService. Kept loose on
 * `primary` because this service doesn't consume that field — it's included
 * for symmetry with the caller's type.
 */
export interface EnrichedStudent {
  student: Item;
  modality: Modality;
  inasistencia: number;
  promedio: number;
  cursoNombre: string;
  primary?: Item;
}

export interface RiskFlag {
  Codigo: string;
  nombre: string;
  nivel: string;
  modality: Modality;
  curso: string;
  mesesMatriculado: number;
  inasistencia: number;
  promedio: number;
  flags: string[];
}

@Injectable()
export class RiskAnalysisService {
  static readonly ABSENCE_THRESHOLD = ABSENCE_THRESHOLD;
  static readonly GRADE_THRESHOLD = GRADE_THRESHOLD;
  static readonly STALL_MULTIPLIER = STALL_MULTIPLIER;

  /**
   * Compute risk flags for the enriched student list. Pure function — no I/O,
   * no DI beyond the class itself. Returns the full sorted list; the caller
   * is responsible for slicing (e.g. top-N for the API payload).
   *
   * Sort order: by flag count desc, ties broken by inasistencia desc — matches
   * the previous inline behavior in AcademicService.
   */
  computeRiskFlags(enriched: EnrichedStudent[]): RiskFlag[] {
    return enriched
      .map(({ student, modality, inasistencia, promedio, cursoNombre }) => {
        const months = monthsBetween(student.Fecha_matricula) ?? 0;
        const expectedIdx =
          modality === 'Desconocida' ? null : expectedLevelAdvance(modality, months);
        const currentIdx = cefrIndex(student.Nombre_nivel);
        const behindLevels =
          expectedIdx !== null && currentIdx !== null
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
        } satisfies RiskFlag;
      })
      .filter((r): r is RiskFlag => r !== null)
      .sort((a, b) => b.flags.length - a.flags.length || b.inasistencia - a.inasistencia);
  }
}
