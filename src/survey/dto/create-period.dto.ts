import { IsInt, Max, Min, IsOptional } from 'class-validator';

export class CreatePeriodDto {
  @IsInt()
  @Min(1)
  @Max(12)
  mes: number;

  @IsInt()
  @Min(2025)
  @Max(2100)
  ano: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  validade_dias?: number;
}
