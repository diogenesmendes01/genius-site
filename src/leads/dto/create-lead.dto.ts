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

  @IsNotEmpty({ message: 'Modalidade é obrigatória' })
  @IsString()
  @IsIn(
    [
      'regular',
      'semi-intensive',
      'intensive',
      'super-intensive',
      'private',
      // Keep accepting submissions from older, cached versions of the form.
      'business',
      'travel',
      'exam',
      'accelerated',
      'general',
    ],
    { message: 'Modalidade inválida' },
  )
  course: string;

  @IsNotEmpty({ message: 'País é obrigatório' })
  @IsString()
  @IsIn(['cr', 'pa', 'sv', 'hn', 'ni', 'gt', 'bz'], {
    message: 'País inválido',
  })
  country: string;
}
