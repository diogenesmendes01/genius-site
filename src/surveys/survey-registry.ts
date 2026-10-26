import { NotFoundException } from '@nestjs/common';
import { ALUMNOS_SURVEY } from './survey-config';
import { EQUIPE_SURVEY } from './survey-equipe';
import { SurveyDefinition } from './survey-types';

/** Every survey the engine serves, by key. Add a definition here to publish it. */
export const SURVEYS: Record<string, SurveyDefinition> = {
  [ALUMNOS_SURVEY.key]: ALUMNOS_SURVEY,
  [EQUIPE_SURVEY.key]: EQUIPE_SURVEY,
};

export const DEFAULT_SURVEY_KEY = ALUMNOS_SURVEY.key;

/**
 * Resolve a survey by key. No key → the student survey, so every existing
 * link (/encuesta, QR codes, dashboard calls without ?survey=) keeps
 * working. Unknown key → 404.
 */
export function getSurvey(key?: string | null): SurveyDefinition {
  const k = (key ?? '').trim() || DEFAULT_SURVEY_KEY;
  const def = SURVEYS[k];
  if (!def) throw new NotFoundException(`encuesta desconocida: ${k}`);
  return def;
}
