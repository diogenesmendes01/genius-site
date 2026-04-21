import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Persistent tracking record for the matrícula form. The IDs returned by
 * the Q10 ERP at each step of the enrollment workflow are stored here so
 * that a retry — even after a server restart, redeploy or instance swap —
 * can detect partial progress and skip the steps that already succeeded.
 *
 * Without this, an enrollment that crashed midway between step 3 and 4
 * would create duplicate contacts/students/inscripciones in Q10 the next
 * time someone clicked "Submit" on the same `ref`.
 */
@Entity('tracking_entries')
export class TrackingEntryEntity {
  @PrimaryColumn()
  ref: string;

  @Column({ default: 'pending' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  asesor: string | null;

  @Column({ type: 'varchar', nullable: true })
  studentName: string | null;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  contactId: string | null;

  @Column({ type: 'varchar', nullable: true })
  studentId: string | null;

  @Column({ type: 'varchar', nullable: true })
  enrollmentId: string | null;

  @Column({ type: 'varchar', nullable: true })
  matriculaId: string | null;

  @Column({ type: 'varchar', nullable: true })
  paymentOrderId: string | null;

  @Column({ type: 'varchar', nullable: true })
  error: string | null;

  @Column({ type: 'int', nullable: true })
  failedStep: number | null;

  // Stored as JSON string — the steps array is a small structured log of
  // what executed/reused on the most recent attempt.
  @Column({ type: 'text', nullable: true })
  completedStepsJson: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
