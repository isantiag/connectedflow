/**
 * Repository for the `extracted_signal` table.
 */

import { type Knex } from 'knex';
import { BaseRepository } from '@connectedflow/core-services';

export interface ExtractedSignalRow {
  [key: string]: unknown;
  id: string;
  parse_job_id: string;
  data: Record<string, unknown>;
  confidence: number;
  source_page: number | null;
  source_table: number | null;
  source_row: number | null;
  needs_review: boolean;
  created_at: Date;
}

export class ExtractedSignalRepository extends BaseRepository<ExtractedSignalRow> {
  constructor(knex: Knex) {
    super(knex, 'extracted_signal');
  }

  /** Find all extracted signals for a given parse job. */
  async findByJobId(
    parseJobId: string,
    trx?: Knex.Transaction,
  ): Promise<ExtractedSignalRow[]> {
    return this.findWhere(
      { parse_job_id: parseJobId } as Partial<ExtractedSignalRow>,
      { orderBy: 'created_at', orderDir: 'asc' },
      trx,
    );
  }
}
