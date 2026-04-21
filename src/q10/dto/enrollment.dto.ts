import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsNotEmpty,
  IsNotEmptyObject,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PersonalInfoDto {
  @IsString() @IsNotEmpty() @MinLength(1)
  Nombres: string;

  @IsString() @IsNotEmpty() @MinLength(1)
  Apellidos: string;

  @IsEmail()
  Correo_electronico: string;

  @IsString() @IsNotEmpty()
  Telefono: string;

  @IsString() @IsNotEmpty()
  Numero_documento: string;

  @IsOptional() @IsString()
  Tipo_documento?: string;

  @IsOptional() @IsString()
  Nacionalidad?: string;

  @IsOptional() @IsString()
  Fecha_nacimiento?: string;

  @IsOptional() @IsString()
  Genero?: string;
}

export class ProgramInfoDto {
  @IsString() @IsNotEmpty()
  Codigo_programa: string;

  @IsString() @IsNotEmpty()
  Codigo_periodo: string;

  @IsOptional() @IsString()
  Codigo_sede?: string;
}

export class PaymentInfoDto {
  @IsOptional() @IsString()
  Concepto_pago?: string;

  @IsOptional() @IsNumber() @Min(0)
  Valor?: number;

  @IsOptional() @IsString()
  Fecha_vencimiento?: string;
}

export class EnrollmentDto {
  @IsOptional() @IsString()
  ref?: string;

  @IsOptional() @IsString()
  asesor?: string;

  @IsDefined() @IsNotEmptyObject()
  @ValidateNested() @Type(() => PersonalInfoDto)
  personal: PersonalInfoDto;

  @IsDefined() @IsNotEmptyObject()
  @ValidateNested() @Type(() => ProgramInfoDto)
  program: ProgramInfoDto;

  @IsOptional()
  @ValidateNested() @Type(() => PaymentInfoDto)
  payment?: PaymentInfoDto;
}
