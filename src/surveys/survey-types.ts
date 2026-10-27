/**
 * Shared types for every survey served by the engine, plus the generic
 * answer validator. A survey is a `SurveyDefinition`: its steps/questions,
 * the UI strings of its wizard (so each survey can speak its own language),
 * which typed columns it may set and what the dashboard aggregates.
 *
 * Definitions live in survey-config.ts (alumnos) and survey-equipe.ts
 * (equipe) and are registered in survey-registry.ts.
 */

export interface SurveySelectDef {
  /** Column name on survey_responses this select writes to. */
  id: string;
  label: string;
  /** First option is the empty placeholder. */
  options: string[];
  required?: boolean;
}

export interface SurveyConsentDef {
  /** Boolean column on survey_responses. */
  id: string;
  label: string;
}

export interface SurveyShowIf {
  id: string;
  equals?: string;
  includes?: string;
  oneOf?: string[];
}

export interface SurveyQuestion {
  id: string;
  type:
    | 'nps'
    | 'stars'
    | 'scale5'
    | 'radio'
    | 'checks'
    | 'text'
    | 'textarea'
    | 'selects'
    | 'consent';
  store: 'column' | 'answers' | 'ui';
  text?: string;
  required?: boolean;
  /** scale5 / stars: caption for each value 1..5. */
  labels?: string[];
  /**
   * scale5 only: an "it does not apply to me" escape hatch (e.g. "No he
   * necesitado ayuda"). Stored as text, excluded from the averages.
   */
  optOut?: string;
  /** radio / checks: allowed options. */
  options?: string[];
  /** radio presentation hint for the wizard. */
  variant?: 'cards' | 'list';
  placeholder?: string;
  maxLength?: number;
  selects?: SurveySelectDef[];
  checks?: SurveyConsentDef[];
  showIf?: SurveyShowIf;
  /** nps: end-of-scale captions. */
  ends?: [string, string];
}

export interface SurveyStep {
  id: string;
  label: string;
  title: string;
  sub?: string;
  questions: SurveyQuestion[];
}

/** Texts the wizard shell needs, in the survey's own language. */
export interface SurveyUiStrings {
  lang: string;
  loading: string;
  loadError: string;
  forbidden: string;
  back: string;
  next: string;
  submit: string;
  sending: string;
  requiredAlert: string;
  tooMany: string;
  sendError: string;
  thanksTitle: string;
  thanksBody: string;
  doneTitle: string;
  doneBody: string;
  privacy: string;
  /** e.g. "máx. {n} caracteres" */
  charHint: string;
}

export interface SurveySegment {
  label: string;
  options: string[];
}

export interface SurveyDefinition {
  /** URL/DB key: 'alumnos', 'equipe'… */
  key: string;
  /** Human name for the dashboard/report. */
  name: string;
  ui: SurveyUiStrings;
  steps: SurveyStep[];
  /**
   * Typed columns on survey_responses this survey may set (besides nps/csat),
   * with the whitelist of values. Column name → segment.
   */
  segments: Record<string, SurveySegment>;
  /** Columns from `segments` the stats break down by (masked below minGroupN). */
  breakdownBy: string[];
  /** Whether `profesor` (teacher attribution) is accepted. */
  allowProfesor: boolean;
  /** Whether nombre/contacto/contactoOk/testimonioOk are accepted. */
  allowContact: boolean;
  /** Minimum responses before a per-teacher / per-segment number is shown. */
  minGroupN: number;
  /** Whether comments carry segment chips (nivel/modalidad/profesor). */
  commentMeta: boolean;
  /**
   * When true, the per-response list and the CSV export omit the segment
   * columns, so a row (segments + free text) can never identify a person.
   * Segments then exist only aggregated and masked in `breakdowns`.
   */
  strictAnonymity?: boolean;
  /** Open-text questions shown in the comments feed (id → label). */
  comments: Record<string, string>;
  /** scale5 questions averaged in the dashboard (id → label). */
  averages: Record<string, string>;
  /** Single-choice questions charted as distributions (id → label). */
  distributions: Record<string, string>;
  /** Multi-select questions tallied (id → label). */
  multi: Record<string, string>;
  /** Removed question ids still exported in the CSV when answers exist. */
  legacyAnswerIds: string[];
  /**
   * Name of the env var holding a link token. When that env var is set,
   * the config endpoint and submissions require `?t=`/`token` to match.
   */
  accessTokenEnv?: string;
}

/** Questions persisted in survey_answers, keyed by question id. */
export function answerQuestions(def: SurveyDefinition): Map<string, SurveyQuestion> {
  return new Map(
    def.steps
      .flatMap((s) => s.questions)
      .filter((q) => q.store === 'answers')
      .map((q) => [q.id, q]),
  );
}

export interface AnswerValidationResult {
  errors: string[];
  /** Sanitised answers: only known questions, values coerced/trimmed. */
  clean: Record<string, number | string | string[]>;
}

/**
 * Validate the free-form `answers` object of a submission against a survey
 * definition. Unknown question ids, wrong types, out-of-range scale values
 * and options outside the whitelist are all rejected — mirrors what the
 * global ValidationPipe does for the typed DTO fields.
 */
export function validateAnswers(def: SurveyDefinition, input: unknown): AnswerValidationResult {
  const questions = answerQuestions(def);
  const errors: string[] = [];
  const clean: Record<string, number | string | string[]> = {};
  const answers = (input ?? {}) as Record<string, unknown>;

  if (typeof answers !== 'object' || Array.isArray(answers)) {
    return { errors: ['answers debe ser un objeto'], clean };
  }

  for (const [id, raw] of Object.entries(answers)) {
    const q = questions.get(id);
    if (!q) {
      errors.push(`pregunta desconocida: ${id}`);
      continue;
    }
    switch (q.type) {
      case 'scale5': {
        if (q.optOut && raw === q.optOut) {
          clean[id] = raw;
          break;
        }
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 1 || n > 5) {
          errors.push(`${id}: valor fuera de la escala 1-5`);
        } else {
          clean[id] = n;
        }
        break;
      }
      case 'radio': {
        if (typeof raw !== 'string' || !(q.options ?? []).includes(raw)) {
          errors.push(`${id}: opción inválida`);
        } else {
          clean[id] = raw;
        }
        break;
      }
      case 'checks': {
        if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string')) {
          errors.push(`${id}: se esperaba una lista de opciones`);
          break;
        }
        const allowed = new Set(q.options ?? []);
        const invalid = (raw as string[]).filter((v) => !allowed.has(v));
        if (invalid.length) {
          errors.push(`${id}: opciones inválidas (${invalid.join(', ')})`);
        } else if (raw.length > 0) {
          clean[id] = [...new Set(raw as string[])];
        }
        break;
      }
      case 'text':
      case 'textarea': {
        if (typeof raw !== 'string') {
          errors.push(`${id}: se esperaba texto`);
          break;
        }
        const trimmed = raw.trim();
        const max = q.maxLength ?? 500;
        if (trimmed.length > max) {
          errors.push(`${id}: máximo ${max} caracteres`);
        } else if (trimmed.length > 0) {
          clean[id] = trimmed;
        }
        break;
      }
      default:
        errors.push(`${id}: tipo no soportado en answers`);
    }
  }

  // Required questions (only unconditional ones — conditional questions are
  // optional by design).
  for (const q of questions.values()) {
    if (q.required && !q.showIf && clean[q.id] === undefined) {
      errors.push(`falta responder: ${q.id}`);
    }
  }

  return { errors, clean };
}
