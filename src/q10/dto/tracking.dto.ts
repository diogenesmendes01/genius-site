import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpsertTrackingDto {
  @IsString()
  ref: string;

  @IsOptional()
  @IsIn(['pending', 'opened', 'filled', 'paid', 'error'])
  status?: 'pending' | 'opened' | 'filled' | 'paid' | 'error';

  @IsOptional() @IsString()
  asesor?: string;

  @IsOptional() @IsString()
  studentName?: string;

  @IsOptional() @IsString()
  email?: string;
}
