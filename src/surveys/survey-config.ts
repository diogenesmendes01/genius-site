/**
 * Single source of truth for the student satisfaction survey (v2).
 *
 * The wizard frontend (public/encuesta) renders itself from this structure
 * via GET /api/surveys/config, and SurveysService validates every submitted
 * answer against it — so adding, removing or rewording a question is a
 * change to this file only, with no schema migration and no frontend edit.
 *
 * `store` decides where each value lands:
 *   - 'column'  → a typed column on survey_responses (dashboard filters/KPIs)
 *   - 'answers' → a row in survey_answers (question_id + value)
 *   - 'ui'      → wizard-only control (e.g. the Sí/No that reveals a field);
 *                 never sent to the API
 *
 * v2 (2026-10): shorter core (15 required instead of 22), teacher chosen
 * from a fixed list instead of free text, new segmentation (modalidad,
 * país), and new questions that target what the July 2026 comments raised:
 * intention to continue, clarity about one's level, access to materials and
 * support response time. Question ids kept from v1 keep their meaning so
 * the history stays comparable; ids that were removed live in
 * LEGACY_ANSWER_IDS so old answers still show up in the CSV export.
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

export const NIVEL_OPTIONS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
/**
 * Students told us (July 2026) they often do not know their level. Letting
 * them say so turns a blank into a KPI ("No saben su nivel") instead of a
 * guess.
 */
export const NIVEL_DESCONOCIDO = 'No sé mi nivel';
export const NIVEL_ALLOWED = [...NIVEL_OPTIONS, NIVEL_DESCONOCIDO];

export const TIEMPO_OPTIONS = [
  'Menos de 3 meses',
  'De 3 a 6 meses',
  'De 6 meses a 1 año',
  'Más de 1 año',
];

/** Course formats as sold on the landing page. */
export const MODALIDAD_OPTIONS = [
  'Grupo regular',
  'Grupo semi-intensivo',
  'Grupo intensivo',
  'Clases particulares',
  'No estoy seguro/a',
];

/** The 7 countries Genius serves + escape hatch. */
export const PAIS_OPTIONS = [
  'Costa Rica',
  'Panamá',
  'El Salvador',
  'Honduras',
  'Nicaragua',
  'Guatemala',
  'Belice',
  'Otro',
];

/**
 * Teachers, as students know them. Keep this list in sync with the active
 * roster (ERP → Usuarios con papel PROFESSOR): add a name when someone
 * joins, remove it when they leave. Order is alphabetical in the wizard.
 *
 * Replaces the free-text field of v1, where "Celia", "Celia Avila" and
 * "Celia Falcao" became three different rows.
 */
export const PROFESOR_OPTIONS = [
  'Alice Barbosa',
  'Celia Falcao Avila',
  'Erbesson De Lima',
  'Henrique Avila',
  'Isabelle Cerqueira',
  'Kessia Morais',
  'Larissa Pereira Avila',
  'Leticia Moraes',
  'Licia',
  'Luisa Pereira',
  'Matheus',
  'Patricia Falcao',
  'Suzana Carvalho',
  'Vitor Avila',
];

/** Select values that mean "no single teacher to attribute this to". */
export const PROFESOR_SIN_IDENTIFICAR = [
  'Tengo más de un profesor/a',
  'Prefiero no decir',
];

export const PROFESOR_SELECT_OPTIONS = [
  ...PROFESOR_OPTIONS,
  ...PROFESOR_SIN_IDENTIFICAR,
];

/** `continuar` answers that count as "piensa seguir". */
export const CONTINUAR_POSITIVO = ['Sí, seguro', 'Probablemente sí'];
export const CONTINUAR_OPTIONS = [
  ...CONTINUAR_POSITIVO,
  'No estoy seguro/a',
  'Probablemente no',
  'No',
];
/** Answers that reveal the "¿qué te haría quedarte?" follow-up. */
export const CONTINUAR_RIESGO = CONTINUAR_OPTIONS.filter(
  (o) => !CONTINUAR_POSITIVO.includes(o),
);

/**
 * Below this many responses a teacher's averages/NPS are not shown: with
 * n=1 the number is noise and the "anonymous" answer is trivially
 * attributable to one student.
 */
export const MIN_PROFESSOR_N = 3;

export const SURVEY_STEPS: SurveyStep[] = [
  {
    id: 'sobre_ti',
    label: 'Tu curso',
    title: 'Cuéntanos sobre tu curso',
    sub: 'Solo para agrupar las respuestas. Nada de esto te identifica.',
    questions: [
      {
        id: 'modalidad',
        type: 'radio',
        variant: 'cards',
        store: 'column',
        required: true,
        text: '¿En qué modalidad estudias?',
        options: MODALIDAD_OPTIONS,
      },
      {
        id: 'curso',
        type: 'selects',
        store: 'column',
        selects: [
          {
            id: 'profesor',
            label: 'Tu profesor/a',
            required: true,
            options: ['Selecciona…', ...PROFESOR_SELECT_OPTIONS],
          },
          {
            id: 'tiempo',
            label: '¿Hace cuánto estudias con nosotros?',
            options: ['Selecciona…', ...TIEMPO_OPTIONS],
          },
        ],
      },
      {
        id: 'ubicacion',
        type: 'selects',
        store: 'column',
        text: 'Opcional',
        selects: [
          { id: 'pais', label: 'País', options: ['Selecciona…', ...PAIS_OPTIONS] },
          { id: 'nivel', label: 'Nivel', options: ['Selecciona…', ...NIVEL_ALLOWED] },
        ],
      },
    ],
  },
  {
    id: 'general',
    label: 'General',
    title: 'Tu experiencia con Genius',
    sub: 'Lo más importante está aquí. Dos minutos.',
    questions: [
      {
        id: 'csat',
        type: 'stars',
        store: 'column',
        required: true,
        text: 'En general, ¿qué tan satisfecho/a estás con Genius?',
        labels: [
          'Muy insatisfecho/a',
          'Insatisfecho/a',
          'Neutral',
          'Satisfecho/a',
          'Muy satisfecho/a',
        ],
      },
      {
        id: 'nps',
        type: 'nps',
        store: 'column',
        required: true,
        text: '¿Qué tan probable es que recomiendes Genius a un amigo, familiar o colega?',
        ends: ['Nada probable', 'Muy probable'],
      },
      {
        id: 'nps_motivo',
        type: 'textarea',
        store: 'answers',
        required: true,
        maxLength: 300,
        text: '¿Cuál es la razón principal de tu nota?',
        placeholder: 'Una o dos frases bastan…',
      },
      {
        id: 'continuar',
        type: 'radio',
        variant: 'list',
        store: 'answers',
        required: true,
        text: '¿Piensas seguir estudiando con Genius en los próximos 6 meses?',
        options: CONTINUAR_OPTIONS,
      },
      {
        id: 'continuar_motivo',
        type: 'text',
        store: 'answers',
        maxLength: 300,
        showIf: { id: 'continuar', oneOf: CONTINUAR_RIESGO },
        text: '¿Qué te haría quedarte?',
        placeholder: 'Cuéntanos con sinceridad…',
      },
    ],
  },
  {
    id: 'clases',
    label: 'Clases',
    title: 'Clases y progreso',
    sub: 'Sobre tu avance, el nivel, los materiales y la plataforma.',
    questions: [
      {
        id: 'progreso',
        type: 'radio',
        variant: 'list',
        store: 'answers',
        required: true,
        text: '¿Sientes que estás progresando en el aprendizaje del portugués?',
        options: [
          'Sí, mucho',
          'Sí, poco a poco',
          'Más o menos',
          'No mucho',
          'No siento progreso todavía',
        ],
      },
      {
        id: 'progreso_claridad',
        type: 'scale5',
        store: 'answers',
        required: true,
        text: '¿Sabes con claridad en qué nivel estás y qué te falta para avanzar?',
        labels: ['Nada claro', 'Poco claro', 'Más o menos', 'Claro', 'Totalmente claro'],
      },
      {
        id: 'contenido_nivel',
        type: 'radio',
        variant: 'list',
        store: 'answers',
        required: true,
        text: '¿El contenido de las clases está de acuerdo con tu nivel de portugués?',
        options: [
          'Sí, está adecuado a mi nivel',
          'Es un poco fácil',
          'Es un poco difícil',
          'Es muy difícil',
          'No estoy seguro/a',
        ],
      },
      {
        id: 'materiales',
        type: 'scale5',
        store: 'answers',
        required: true,
        text: '¿Cómo evalúas los materiales utilizados en clase?',
        labels: ['Muy malos', 'Malos', 'Regulares', 'Buenos', 'Excelentes'],
      },
      {
        id: 'materiales_acceso',
        type: 'radio',
        variant: 'list',
        store: 'answers',
        text: '¿Tienes acceso al material (libro o PDF) fuera de la clase?',
        options: ['Sí, siempre', 'A veces', 'No', 'No sabía que existía'],
      },
      {
        id: 'online_plataforma',
        type: 'radio',
        variant: 'list',
        store: 'answers',
        required: true,
        text: '¿La plataforma o herramienta utilizada para las clases funciona bien para ti?',
        options: [
          'Sí, funciona muy bien',
          'Funciona bien la mayoría de las veces',
          'A veces tengo problemas',
          'Tengo problemas con frecuencia',
        ],
      },
    ],
  },
  {
    id: 'profesor',
    label: 'Profesor/a',
    title: 'Tu profesor/a',
    sub: 'Tus respuestas ayudan a los profesores a mejorar. Se muestran solo en conjunto.',
    questions: [
      {
        id: 'prof_claridad',
        type: 'scale5',
        store: 'answers',
        required: true,
        text: '¿Cómo evalúas la claridad del profesor/a al explicar el contenido?',
        labels: ['Muy poco claro/a', 'Poco claro/a', 'Regular', 'Claro/a', 'Muy claro/a'],
      },
      {
        id: 'prof_participacion',
        type: 'scale5',
        store: 'answers',
        required: true,
        text: '¿El profesor/a estimula tu participación durante la clase?',
        labels: ['Nunca', 'Rara vez', 'A veces', 'Casi siempre', 'Siempre'],
      },
      {
        id: 'prof_feedback',
        type: 'scale5',
        store: 'answers',
        required: true,
        text: '¿Recibes correcciones y retroalimentación que te ayudan a mejorar?',
        labels: ['Nunca', 'Rara vez', 'A veces', 'Casi siempre', 'Siempre'],
      },
      {
        id: 'prof_sugerencia',
        type: 'textarea',
        store: 'answers',
        maxLength: 500,
        text: '¿Qué sugerencia le darías al profesor/a para mejorar las clases?',
        placeholder: 'Escribe aquí… (opcional)',
      },
    ],
  },
  {
    id: 'escuela',
    label: 'Escuela',
    title: 'Organización y comunicación',
    sub: 'Sobre los avisos, el soporte y la atención de Genius.',
    questions: [
      {
        id: 'informacion',
        type: 'radio',
        variant: 'list',
        store: 'answers',
        required: true,
        text: '¿Recibes la información necesaria sobre horarios, clases, cambios o avisos importantes?',
        options: ['Sí, siempre', 'Casi siempre', 'A veces', 'Rara vez', 'No'],
      },
      {
        id: 'soporte',
        type: 'scale5',
        store: 'answers',
        text: '¿Cómo evalúas el soporte o atención cuando necesitas ayuda?',
        labels: ['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'],
        optOut: 'No he necesitado ayuda',
      },
      {
        id: 'soporte_tiempo',
        type: 'radio',
        variant: 'list',
        store: 'answers',
        text: 'Cuando escribes a Genius, ¿en cuánto tiempo te responden?',
        options: [
          'El mismo día',
          'En 1 o 2 días',
          'Más de 2 días',
          'Casi nunca me responden',
          'Nunca he escrito',
        ],
      },
      {
        id: 'org_mejora',
        type: 'textarea',
        store: 'answers',
        maxLength: 500,
        text: '¿Hay algo en la organización de Genius que deberíamos mejorar?',
        placeholder: 'Escribe aquí… (opcional)',
      },
    ],
  },
  {
    id: 'final',
    label: 'Final',
    title: 'Para terminar',
    sub: 'Todo en esta página es opcional.',
    questions: [
      {
        id: 'contenido_extra',
        type: 'checks',
        store: 'answers',
        text: '¿Qué tipo de contenido te gustaría tener más en las clases?',
        options: [
          'Conversación',
          'Gramática',
          'Vocabulario',
          'Pronunciación',
          'Cultura brasileña',
          'Portugués para trabajo',
          'Portugués para viajes',
          'Actividades prácticas',
          'Tareas para practicar fuera de clase',
          'Otro',
        ],
      },
      {
        id: 'contenido_extra_otro',
        type: 'text',
        store: 'answers',
        maxLength: 200,
        showIf: { id: 'contenido_extra', includes: 'Otro' },
        text: 'Escribe qué contenido te gustaría tener:',
        placeholder: 'Cuéntanos…',
      },
      {
        id: 'necesita_mejorar',
        type: 'checks',
        store: 'answers',
        text: '¿Qué parte del portugués sientes que necesitas mejorar más?',
        options: [
          'Hablar con más fluidez',
          'Entender cuando otros hablan',
          'Pronunciación',
          'Gramática',
          'Escritura',
          'Lectura',
          'Vocabulario',
          'Confianza para hablar',
          'Otro',
        ],
      },
      {
        id: 'necesita_mejorar_otro',
        type: 'text',
        store: 'answers',
        maxLength: 200,
        showIf: { id: 'necesita_mejorar', includes: 'Otro' },
        text: 'Escribe qué te gustaría mejorar:',
        placeholder: 'Cuéntanos…',
      },
      {
        id: 'comentario_final',
        type: 'textarea',
        store: 'answers',
        maxLength: 500,
        text: '¿Hay algún comentario, sugerencia o felicitación que te gustaría compartir?',
        placeholder: 'Escribe aquí… (opcional)',
      },
      {
        id: 'contacto_ok',
        type: 'radio',
        variant: 'cards',
        store: 'column',
        text: '¿Autorizas que Genius entre en contacto contigo para entender mejor tus respuestas?',
        options: ['Sí', 'No'],
      },
      {
        id: 'nombre',
        type: 'text',
        store: 'column',
        maxLength: 120,
        showIf: { id: 'contacto_ok', equals: 'Sí' },
        text: 'Tu nombre:',
        placeholder: 'Ej: María López',
      },
      {
        id: 'contacto',
        type: 'text',
        store: 'column',
        maxLength: 160,
        showIf: { id: 'contacto_ok', equals: 'Sí' },
        text: 'Correo electrónico o WhatsApp:',
        placeholder: 'tu@correo.com o +502 5555-1234',
      },
      {
        id: 'permisos',
        type: 'consent',
        store: 'column',
        checks: [
          {
            id: 'testimonio_ok',
            label:
              'Autorizo que mi comentario aparezca como testimonio en el sitio web de Genius (solo con mi primer nombre).',
          },
        ],
      },
    ],
  },
];

/** Questions persisted in survey_answers, keyed by question id. */
export const ANSWER_QUESTIONS: ReadonlyMap<string, SurveyQuestion> = new Map(
  SURVEY_STEPS.flatMap((s) => s.questions)
    .filter((q) => q.store === 'answers')
    .map((q) => [q.id, q]),
);

/**
 * v1 question ids no longer asked. They are rejected on new submissions
 * (unknown question) but kept here so the CSV export still has a column
 * for the answers already stored and the comments feed keeps its labels.
 */
export const LEGACY_ANSWER_IDS = [
  'lo_mejor',
  'a_mejorar',
  'online_acceso',
  'online_calidad',
  'online_efectividad',
  'online_mejora',
  'ayuda_comunicacion',
  'prof_paciencia',
  'prof_correccion',
  'prof_puntualidad',
  'prof_valoras',
  'comunicacion',
];

/** Open-text questions whose values feed the dashboard comments feed. */
export const COMMENT_QUESTIONS: Record<string, string> = {
  nps_motivo: 'Razón de la nota',
  continuar_motivo: 'Qué le haría quedarse',
  prof_sugerencia: 'Sugerencia al profesor/a',
  org_mejora: 'Organización',
  comentario_final: 'Comentario final',
  // legacy (v1) — still displayed for stored answers
  lo_mejor: 'Lo que más le gusta',
  a_mejorar: 'Debería mejorar',
  online_mejora: 'Mejorar en clases online',
  prof_valoras: 'Lo que valora del profesor/a',
};

/** scale5 questions surfaced as "promedios" bars in the dashboard. */
export const AVERAGE_QUESTIONS: Record<string, string> = {
  prof_claridad: 'Claridad del profesor/a',
  prof_participacion: 'Estímulo a participar',
  prof_feedback: 'Correcciones y feedback',
  progreso_claridad: 'Claridad sobre su nivel',
  materiales: 'Materiales',
  soporte: 'Soporte / atención',
};

/** Single-choice questions whose distribution the dashboard charts. */
export const DISTRIBUTION_QUESTIONS: Record<string, string> = {
  continuar: 'Intención de continuar',
  progreso: 'Progreso percibido',
  contenido_nivel: 'Contenido vs. nivel',
  materiales_acceso: 'Acceso al material fuera de clase',
  online_plataforma: 'Funcionamiento de la plataforma',
  informacion: 'Recibe información necesaria',
  soporte_tiempo: 'Tiempo de respuesta del soporte',
};

/** Multi-select questions charted as "lo que más piden". */
export const MULTI_QUESTIONS: Record<string, string> = {
  contenido_extra: 'Contenido que más piden',
  necesita_mejorar: 'Habilidades que quieren mejorar',
};

export interface AnswerValidationResult {
  errors: string[];
  /** Sanitised answers: only known questions, values coerced/trimmed. */
  clean: Record<string, number | string | string[]>;
}

/**
 * Validate the free-form `answers` object of a submission against the
 * config. Unknown question ids, wrong types, out-of-range scale values and
 * options outside the whitelist are all rejected — mirrors what the global
 * ValidationPipe does for the typed DTO fields.
 */
export function validateAnswers(input: unknown): AnswerValidationResult {
  const errors: string[] = [];
  const clean: Record<string, number | string | string[]> = {};
  const answers = (input ?? {}) as Record<string, unknown>;

  if (typeof answers !== 'object' || Array.isArray(answers)) {
    return { errors: ['answers debe ser un objeto'], clean };
  }

  for (const [id, raw] of Object.entries(answers)) {
    const q = ANSWER_QUESTIONS.get(id);
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
  for (const q of ANSWER_QUESTIONS.values()) {
    if (q.required && !q.showIf && clean[q.id] === undefined) {
      errors.push(`falta responder: ${q.id}`);
    }
  }

  return { errors, clean };
}
