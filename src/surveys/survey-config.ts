/**
 * Single source of truth for the student satisfaction survey.
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
 */

export interface SurveySelectDef {
  /** Column name on survey_responses this select writes to. */
  id: string;
  label: string;
  /** First option is the empty placeholder. */
  options: string[];
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
export const TIEMPO_OPTIONS = [
  'Menos de 3 meses',
  'De 3 a 6 meses',
  'De 6 meses a 1 año',
  'Más de 1 año',
];

export const SURVEY_STEPS: SurveyStep[] = [
  {
    id: 'general',
    label: 'General',
    title: 'Tu experiencia con Genius',
    sub: 'Dos preguntas rápidas para empezar.',
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
        text: '¿Recomendarías Genius a un amigo, familiar o compañero de trabajo?',
        ends: ['No lo recomendaría', 'Lo recomendaría con seguridad'],
      },
      {
        id: 'lo_mejor',
        type: 'textarea',
        store: 'answers',
        maxLength: 500,
        text: '¿Qué es lo que más te gusta de estudiar en Genius?',
        placeholder: 'Escribe aquí… (opcional)',
      },
      {
        id: 'a_mejorar',
        type: 'textarea',
        store: 'answers',
        maxLength: 500,
        text: '¿Qué crees que Genius debería mejorar?',
        placeholder: 'Sé sincero/a, nos ayuda muchísimo… (opcional)',
      },
    ],
  },
  {
    id: 'online',
    label: 'Online',
    title: 'Clases online',
    sub: 'Sobre el acceso, la plataforma y la calidad de las clases.',
    questions: [
      {
        id: 'online_acceso',
        type: 'scale5',
        store: 'answers',
        required: true,
        text: '¿Qué tan fácil es para ti acceder a las clases online?',
        labels: ['Muy difícil', 'Difícil', 'Regular', 'Fácil', 'Muy fácil'],
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
      {
        id: 'online_calidad',
        type: 'scale5',
        store: 'answers',
        required: true,
        text: '¿Cómo evalúas la calidad de las clases online?',
        labels: ['Muy mala', 'Mala', 'Regular', 'Buena', 'Excelente'],
      },
      {
        id: 'online_efectividad',
        type: 'radio',
        variant: 'list',
        store: 'answers',
        required: true,
        text: '¿Sientes que las clases online te permiten aprender de forma clara y efectiva?',
        options: ['Sí, totalmente', 'Sí, en parte', 'Más o menos', 'No mucho', 'No'],
      },
      {
        id: 'online_mejora',
        type: 'textarea',
        store: 'answers',
        maxLength: 500,
        text: '¿Qué podría mejorar en la experiencia de las clases online?',
        placeholder: 'Escribe aquí… (opcional)',
      },
    ],
  },
  {
    id: 'contenido',
    label: 'Contenido',
    title: 'Contenido y metodología',
    sub: 'Sobre el nivel, los materiales y lo que quieres aprender.',
    questions: [
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
        id: 'ayuda_comunicacion',
        type: 'scale5',
        store: 'answers',
        required: true,
        text: '¿Las clases te ayudan a mejorar tu comunicación en portugués?',
        labels: [
          'No me ayudan',
          'Me ayudan poco',
          'De forma regular',
          'Bastante',
          'Mucho',
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
    ],
  },
  {
    id: 'profesor',
    label: 'Profesor/a',
    title: 'Tu profesor/a',
    sub: 'Tus respuestas ayudan a los profesores a mejorar.',
    questions: [
      {
        id: 'profe_identificar',
        type: 'radio',
        variant: 'cards',
        store: 'ui',
        text: '¿Deseas identificar a tu profesor/a?',
        options: ['Sí', 'No'],
      },
      {
        id: 'profesor',
        type: 'text',
        store: 'column',
        maxLength: 120,
        showIf: { id: 'profe_identificar', equals: 'Sí' },
        text: 'Nombre del profesor/a:',
        placeholder: 'Escribe el nombre…',
      },
      {
        id: 'prof_claridad',
        type: 'scale5',
        store: 'answers',
        required: true,
        text: '¿Cómo evalúas la claridad del profesor/a al explicar el contenido?',
        labels: ['Muy poco claro/a', 'Poco claro/a', 'Regular', 'Claro/a', 'Muy claro/a'],
      },
      {
        id: 'prof_paciencia',
        type: 'scale5',
        store: 'answers',
        required: true,
        text: '¿El profesor/a demuestra paciencia y disposición para ayudar?',
        labels: ['Nunca', 'Rara vez', 'A veces', 'Casi siempre', 'Siempre'],
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
        id: 'prof_correccion',
        type: 'scale5',
        store: 'answers',
        required: true,
        text: '¿El profesor/a corrige tus errores de una forma clara y respetuosa?',
        labels: ['Nunca', 'Rara vez', 'A veces', 'Casi siempre', 'Siempre'],
      },
      {
        id: 'prof_puntualidad',
        type: 'radio',
        variant: 'list',
        store: 'answers',
        required: true,
        text: '¿Cómo evalúas la puntualidad del profesor/a?',
        options: ['Excelente', 'Buena', 'Regular', 'Mala', 'No aplica'],
      },
      {
        id: 'prof_valoras',
        type: 'textarea',
        store: 'answers',
        maxLength: 500,
        text: '¿Qué es lo que más valoras del profesor/a?',
        placeholder: 'Escribe aquí… (opcional)',
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
    sub: 'Sobre la comunicación, los avisos y el soporte de Genius.',
    questions: [
      {
        id: 'comunicacion',
        type: 'scale5',
        store: 'answers',
        required: true,
        text: '¿Cómo evalúas la comunicación de Genius contigo?',
        labels: ['Muy mala', 'Mala', 'Regular', 'Buena', 'Excelente'],
      },
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
        id: 'comentario_final',
        type: 'textarea',
        store: 'answers',
        maxLength: 500,
        text: '¿Hay algún comentario, sugerencia o felicitación que te gustaría compartir?',
        placeholder: 'Escribe aquí… (opcional)',
      },
      {
        id: 'curso',
        type: 'selects',
        store: 'column',
        text: 'Sobre tu curso de portugués (opcional)',
        selects: [
          { id: 'nivel', label: 'Nivel', options: ['Selecciona…', ...NIVEL_OPTIONS] },
          {
            id: 'tiempo',
            label: '¿Hace cuánto estudias con nosotros?',
            options: ['Selecciona…', ...TIEMPO_OPTIONS],
          },
        ],
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

/** Open-text questions whose values feed the dashboard comments feed. */
export const COMMENT_QUESTIONS: Record<string, string> = {
  lo_mejor: 'Lo que más le gusta',
  a_mejorar: 'Debería mejorar',
  online_mejora: 'Mejorar en clases online',
  prof_valoras: 'Lo que valora del profesor/a',
  prof_sugerencia: 'Sugerencia al profesor/a',
  org_mejora: 'Organización',
  comentario_final: 'Comentario final',
};

/** scale5 questions surfaced as "promedios" bars in the dashboard. */
export const AVERAGE_QUESTIONS: Record<string, string> = {
  prof_claridad: 'Claridad del profesor/a',
  prof_paciencia: 'Paciencia del profesor/a',
  prof_participacion: 'Estímulo a participar',
  prof_correccion: 'Corrección respetuosa',
  ayuda_comunicacion: 'Ayuda a comunicarte',
  comunicacion: 'Comunicación de Genius',
  soporte: 'Soporte / atención',
  online_calidad: 'Calidad clases online',
  online_acceso: 'Acceso a las clases',
  materiales: 'Materiales',
};

/** Single-choice questions whose distribution the dashboard charts. */
export const DISTRIBUTION_QUESTIONS: Record<string, string> = {
  progreso: 'Progreso percibido',
  online_plataforma: 'Funcionamiento de la plataforma',
  contenido_nivel: 'Contenido vs. nivel',
  informacion: 'Recibe información necesaria',
  prof_puntualidad: 'Puntualidad del profesor/a',
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
