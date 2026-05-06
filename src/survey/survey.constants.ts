// Allowed values for each enum-like column. Centralised here so DTO
// validators, analytics aggregations and the admin/public HTML stay in sync.

export const PROGRESSO = ['mucho_progreso', 'un_poco', 'no_lo_noto', 'retrocediendo'] as const;
export const RITMO = ['perfecto', 'un_poco_rapido', 'un_poco_lento', 'muy_rapido'] as const;
export const PONTUALIDADE = [
  'siempre',
  'casi_siempre',
  'a_veces_demoras',
  'frecuentemente_demoras',
] as const;
export const TAREFAS = [
  'bien',
  'un_poco_faciles',
  'un_poco_dificiles',
  'muy_dificiles',
  'no_hubo',
  'mas_tareas',
] as const;
export const PROFESSOR_EXPLICA = [
  'siempre',
  'casi_siempre',
  'a_veces_no',
  'generalmente_no',
] as const;
export const AULAS_DINAMICAS = [
  'siempre',
  'casi_siempre',
  'a_veces_monotonas',
  'cuesta_atencion',
] as const;
export const RECOMENDACAO = [
  'definitivamente',
  'probablemente_si',
  'no_seguro',
  'probablemente_no',
  'no_recomendaria',
] as const;
export const ATENDIMENTO = ['excelente', 'buena', 'regular', 'mala'] as const;
export const INTENCAO_CONTINUAR = [
  'comprometido',
  'siguiendo',
  'desmotivado',
  'pensando_pausa',
  'considerando_no_continuar',
] as const;

// Values that fire the "intenção crítica" alert (spec §4.1).
export const INTENCAO_CRITICA: ReadonlyArray<(typeof INTENCAO_CONTINUAR)[number]> = [
  'pensando_pausa',
  'considerando_no_continuar',
];

// NPS-style scoring on `recomendacao` (spec §4.2).
export const RECOMENDACAO_PROMOTORS: ReadonlyArray<(typeof RECOMENDACAO)[number]> = [
  'definitivamente',
  'probablemente_si',
];
export const RECOMENDACAO_DETRACTORS: ReadonlyArray<(typeof RECOMENDACAO)[number]> = [
  'no_recomendaria',
];

export const NOTA_BAIXA_THRESHOLD = 2; // ≤ 2 dispara alerta
