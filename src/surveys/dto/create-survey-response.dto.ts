import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { NIVEL_OPTIONS, TIEMPO_OPTIONS } from '../survey-config';

export class CreateSurveyResponseDto {
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

  @IsOptional()
  @IsIn(NIVEL_OPTIONS, { message: 'nivel inválido' })
  nivel?: string;

  @IsOptional()
  @IsIn(TIEMPO_OPTIONS, { message: 'tiempo inválido' })
  tiempo?: string;

  /**
   * All configurable answers, keyed by question id. Validated dynamically
   * against survey-config.ts in the service (types, ranges, whitelists).
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
