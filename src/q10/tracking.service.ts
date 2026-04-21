import { Injectable } from '@nestjs/common';

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
 * In-memory tracking store for the enrollment form.
 *
 * When the backend scales beyond a single instance we should migrate this to
 * the SQLite DB (same schema, drop-in repository replacement).
 */
@Injectable()
export class TrackingService {
  private readonly store = new Map<string, TrackingEntry>();

  get(ref: string): TrackingEntry | null {
    return this.store.get(ref) ?? null;
  }

  upsert(partial: Partial<TrackingEntry> & { ref: string }): TrackingEntry {
    const existing = this.store.get(partial.ref);
    const now = new Date().toISOString();
    const entry: TrackingEntry = {
      ref: partial.ref,
      status: partial.status ?? existing?.status ?? 'pending',
      asesor: partial.asesor ?? existing?.asesor ?? null,
      studentName: partial.studentName ?? existing?.studentName ?? null,
      email: partial.email ?? existing?.email ?? null,
      contactId: partial.contactId ?? existing?.contactId,
      studentId: partial.studentId ?? existing?.studentId,
      enrollmentId: partial.enrollmentId ?? existing?.enrollmentId,
      matriculaId: partial.matriculaId ?? existing?.matriculaId,
      paymentOrderId: partial.paymentOrderId ?? existing?.paymentOrderId,
      error: partial.error ?? existing?.error,
      failedStep: partial.failedStep ?? existing?.failedStep,
      completedSteps: partial.completedSteps ?? existing?.completedSteps,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.store.set(partial.ref, entry);
    return entry;
  }

  list(): TrackingEntry[] {
    return Array.from(this.store.values());
  }
}
