import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Shape accepted by POST /api/q10/tracking — which is **public** (the form
 * calls it before the user submits). Locks down the input so an attacker
 * who guesses or observes someone else's `ref` cannot tamper with the
 * record beyond marking it as "opened":
 *
 *  - `ref` must match the format the backend generates (ENR/LEAD + 8-64
 *    uppercase alphanum), preventing short/empty/colliding refs that would
 *    blow up the idempotency key used by EnrollmentService.
 *  - only `opened` is an allowed status here; `filled`/`paid`/`error` are
 *    set server-side by EnrollmentService after it actually ran the flow.
 */
export class PublicUpsertTrackingDto {
  @IsString()
  @Matches(/^(ENR|LEAD)-[A-Z0-9]{8,64}$/, {
    message: 'ref must match /^(ENR|LEAD)-[A-Z0-9]{8,64}$/',
  })
  ref: string;

  @IsOptional()
  @IsIn(['opened'], { message: 'public clients may only set status=opened' })
  status?: 'opened';

  @IsOptional() @IsString() @MaxLength(120)
  asesor?: string;

  @IsOptional() @IsString() @MaxLength(200)
  studentName?: string;

  @IsOptional() @IsString() @MaxLength(200)
  email?: string;
}
