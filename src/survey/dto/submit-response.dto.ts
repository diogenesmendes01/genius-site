import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ATENDIMENTO,
  AULAS_DINAMICAS,
  INTENCAO_CONTINUAR,
  PONTUALIDADE,
  PROFESSOR_EXPLICA,
  PROGRESSO,
  RECOMENDACAO,
  RITMO,
  TAREFAS,
} from '../survey.constants';

export class SubmitResponseDto {
  @IsInt() @Min(1) @Max(5)
  nota_aulas: number;

  @IsIn(PROGRESSO as readonly string[])
  progresso: string;

  @IsIn(RITMO as readonly string[])
  ritmo: string;

  @IsIn(PONTUALIDADE as readonly string[])
  pontualidade: string;

  @IsIn(TAREFAS as readonly string[])
  tarefas: string;

  @IsInt() @Min(1) @Max(5)
  nota_professor: number;

  @IsIn(PROFESSOR_EXPLICA as readonly string[])
  professor_explica: string;

  @IsIn(AULAS_DINAMICAS as readonly string[])
  aulas_dinamicas: string;

  @IsInt() @Min(1) @Max(5)
  nota_geral: number;

  @IsIn(RECOMENDACAO as readonly string[])
  recomendacao: string;

  @IsIn(ATENDIMENTO as readonly string[])
  atendimento: string;

  @IsIn(INTENCAO_CONTINUAR as readonly string[])
  intencao_continuar: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback_conteudo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback_professor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback_escola?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  situacao_pessoal?: string;
}
