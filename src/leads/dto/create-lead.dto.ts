import { IsEmail, IsNotEmpty, IsString, MinLength, IsIn } from 'class-validator';

export class CreateLeadDto {
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  @IsString()
  @MinLength(2, { message: 'Nome deve ter pelo menos 2 caracteres' })
  name: string;

  @IsNotEmpty({ message: 'Email é obrigatório' })
  @IsEmail({}, { message: 'Email inválido' })
  email: string;

  @IsNotEmpty({ message: 'Telefone é obrigatório' })
  @IsString()
  @MinLength(8, { message: 'Telefone deve ter pelo menos 8 dígitos' })
  phone: string;

  @IsNotEmpty({ message: 'Curso é obrigatório' })
  @IsString()
  @IsIn(['business', 'travel', 'exam', 'general'], {
    message: 'Curso inválido',
  })
  course: string;

  @IsNotEmpty({ message: 'País é obrigatório' })
  @IsString()
  @IsIn(['cr', 'pa', 'sv', 'hn', 'ni', 'gt', 'bz'], {
    message: 'País inválido',
  })
  country: string;
}
