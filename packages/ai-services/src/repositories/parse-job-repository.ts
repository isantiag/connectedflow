/**
 * Repository for the `parse_job` table.
 */

import { type Knex } from 'knex';
import { BaseRepository } from '@connectedflow/core-services';

export type ParseJobStatus = 'queued' | 'processing' | 'review_pending' | 'confirmed' | 'failed';

export interface ParseJobRow {
  [key: string]: unknown;
  id: string;
  document_id: string;
  status: ParseJobStatus;
  total_tables_found: number;
  total_signals_extracted: number;
  avg_confidence: number;
  high_confidence_count: number;
  low_confidence_count: number;
  unmapped_field_count: number;
  created_at: Date;
  completed_at: Date | null;
}

/** Valid state transitions for the parse job state machine. */
const VALID_TRANSITIONS: Record<ParseJobStatus, ParseJobStatus[]> = {
  queued: ['processing', 'failed'],
  processing: ['review_pending', 'failed'],
  review_pending: ['confirmed', 'failed'],
  confirmed: [],
  failed: [],
};

export class ParseJobRepository extends BaseRepository<ParseJobRow> {
  constructor(knex: Knex) {
    super(knex, 'parse_job');
  }

  /**
   * Transition a parse job to a new status, enforcing the state machine.
   * Returns the updated row or throws if the transition is invalid.
   */
  async transition(
    id: string,
    newStatus: ParseJobStatus,
    trx?: Knex.Transaction,
  ): Promise<ParseJobRow> {
    const job = await this.findById(id, trx);
    if (!job) {
      throw new Error(`Parse job not found: ${id}`);
    }

    const allowed = VALID_TRANSITIONS[job.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid transition: ${job.status} → ${newStatus}`,
      );
    }

    const updates: Partial<ParseJobRow> = { status: newStatus };
    if (newStatus === 'confirmed' || newStatus === 'failed') {
      updates.completed_at = new Date();
    }

    const updated = await this.update(id, updates, trx);
    if (!updated) {
      throw new Error(`Failed to update parse job: ${id}`);
    }
    return updated;
  }

  /** Check whether a given status transition is valid. */
  static isValidTransition(from: ParseJobStatus, to: ParseJobStatus): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }
}
