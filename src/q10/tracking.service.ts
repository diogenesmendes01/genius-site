import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrackingEntryEntity } from './tracking-entry.entity';

export type TrackingStatus = 'pending' | 'opened' | 'filled' | 'paid' | 'error';

export interface TrackingEntry {
  ref: string;
  status: TrackingStatus;
  asesor: string | null;
  studentName: string | null;
  email: string | null;
  contactId?: string;
  studentId?: string;
  enrollmentId?: string;
  matriculaId?: string;
  paymentOrderId?: string;
  error?: string;
  failedStep?: number;
  completedSteps?: unknown[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Persistent tracking store backed by SQLite via TypeORM. Replaces the
 * previous in-memory `Map`, which lost state on every restart and made
 * enrollment retries non-idempotent across deploys (review feedback).
 *
 * Every value goes through string normalisation so JSON-stored
 * `completedSteps` round-trip cleanly.
 */
@Injectable()
export class TrackingService {
  constructor(
    @InjectRepository(TrackingEntryEntity)
    private readonly repo: Repository<TrackingEntryEntity>,
  ) {}

  async get(ref: string): Promise<TrackingEntry | null> {
    const row = await this.repo.findOne({ where: { ref } });
    return row ? this.toDomain(row) : null;
  }

  async upsert(partial: Partial<TrackingEntry> & { ref: string }): Promise<TrackingEntry> {
    const existing = await this.repo.findOne({ where: { ref: partial.ref } });
    const merged: Partial<TrackingEntryEntity> = {
      ref: partial.ref,
      status: partial.status ?? existing?.status ?? 'pending',
      asesor: nullable(partial.asesor ?? existing?.asesor ?? null),
      studentName: nullable(partial.studentName ?? existing?.studentName ?? null),
      email: nullable(partial.email ?? existing?.email ?? null),
      contactId: nullable(partial.contactId ?? existing?.contactId ?? null),
      studentId: nullable(partial.studentId ?? existing?.studentId ?? null),
      enrollmentId: nullable(partial.enrollmentId ?? existing?.enrollmentId ?? null),
      matriculaId: nullable(partial.matriculaId ?? existing?.matriculaId ?? null),
      paymentOrderId: nullable(partial.paymentOrderId ?? existing?.paymentOrderId ?? null),
      error: nullable(partial.error ?? existing?.error ?? null),
      failedStep: partial.failedStep ?? existing?.failedStep ?? null,
      completedStepsJson: partial.completedSteps !== undefined
        ? JSON.stringify(partial.completedSteps)
        : (existing?.completedStepsJson ?? null),
    };
    const entity = this.repo.create(merged);
    await this.repo.save(entity);
    // Re-fetch after save so the @CreateDateColumn / @UpdateDateColumn
    // defaults populated by SQLite are visible. better-sqlite3 doesn't
    // back-fill these on the in-memory entity returned by `save`.
    const fresh = await this.repo.findOneByOrFail({ ref: partial.ref });
    return this.toDomain(fresh);
  }

  async list(): Promise<TrackingEntry[]> {
    const rows = await this.repo.find({ order: { updatedAt: 'DESC' } });
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: TrackingEntryEntity): TrackingEntry {
    let completedSteps: unknown[] | undefined;
    if (row.completedStepsJson) {
      try { completedSteps = JSON.parse(row.completedStepsJson); }
      catch { completedSteps = undefined; }
    }
    return {
      ref: row.ref,
      status: row.status as TrackingStatus,
      asesor: row.asesor,
      studentName: row.studentName,
      email: row.email,
      contactId: row.contactId ?? undefined,
      studentId: row.studentId ?? undefined,
      enrollmentId: row.enrollmentId ?? undefined,
      matriculaId: row.matriculaId ?? undefined,
      paymentOrderId: row.paymentOrderId ?? undefined,
      error: row.error ?? undefined,
      failedStep: row.failedStep ?? undefined,
      completedSteps,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function nullable<T>(v: T | undefined | null): T | null {
  return v == null ? null : v;
}
