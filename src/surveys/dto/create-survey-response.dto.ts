import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * One survey submission. nps/csat are typed here; every other value is
 * checked by SurveysService against the survey's definition (segments
 * whitelist, answers config), because the allowed values differ per survey.
 */
export class CreateSurveyResponseDto {
  /** Survey key ('alumnos' by default, 'equipe'…). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  survey?: string;

  /** Link token for surveys that require one (see SurveyDefinition.accessTokenEnv). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  token?: string;

  @IsInt({ message: 'nps debe ser un número entero' })
  @Min(0, { message: 'nps debe estar entre 0 y 10' })
  @Max(10, { message: 'nps debe estar entre 0 y 10' })
  nps: number;

  @IsInt({ message: 'csat debe ser un número entero' })
  @Min(1, { message: 'csat debe estar entre 1 y 5' })
  @Max(5, { message: 'csat debe estar entre 1 y 5' })
  csat: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  canal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  profesor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  contacto?: string;

  @IsOptional()
  @IsBoolean()
  contactoOk?: boolean;

  @IsOptional()
  @IsBoolean()
  testimonioOk?: boolean;

  // ── segment columns: whitelisted per survey in the service ──

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nivel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tiempo?: string;

  /** alumnos v2 — required in the wizard; optional here so older clients still post. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  modalidad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  pais?: string;

  /** equipe — função. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  rol?: string;

  /**
   * All configurable answers, keyed by question id. Validated dynamically
   * against the survey definition in the service (types, ranges, whitelists).
   */
  @IsOptional()
  @IsObject({ message: 'answers debe ser un objeto' })
  answers?: Record<string, unknown>;

  /**
   * Honeypot — hidden field on the form. Humans never fill it; bots do.
   * A non-empty value makes the service accept-and-drop the submission.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
