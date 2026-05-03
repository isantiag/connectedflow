/**
 * Signal Export Service — TASK-046.
 * §1 Backend: Business logic in services, not route handlers.
 * §6 Backend: Parameterized queries via Knex builder.
 */
import type { Knex } from 'knex';

export interface ExportedSignal {
  id: string;
  name: string;
  status: string;
  criticality: string;
  version: number;
  created_at: string;
  updated_at: string;
  // logical layer
  data_type: string | null;
  min_value: number | null;
  max_value: number | null;
  units: string | null;
  description: string | null;
  source_system: string | null;
  dest_system: string | null;
  refresh_rate_hz: number | null;
  functional_category: string | null;
  // transport layer
  protocol_id: string | null;
  bus_id: string | null;
  bit_offset: number | null;
  bit_length: number | null;
  encoding: string | null;
  scale_factor: number | null;
  offset_value: number | null;
  byte_order: string | null;
  protocol_attrs: Record<string, unknown> | null;
}

export function createSignalExportService(db: Knex) {
  return {
    async exportByProject(projectId: string): Promise<ExportedSignal[]> {
      const rows = await db('signal')
        .leftJoin('logical_layer', 'signal.id', 'logical_layer.signal_id')
        .leftJoin('transport_layer', 'signal.id', 'transport_layer.signal_id')
        .where('signal.project_id', projectId)
        .select(
          'signal.id',
          'signal.name',
          'signal.status',
          'signal.criticality',
          'signal.version',
          'signal.created_at',
          'signal.updated_at',
          'logical_layer.data_type',
          'logical_layer.min_value',
          'logical_layer.max_value',
          'logical_layer.units',
          'logical_layer.description',
          'logical_layer.source_system',
          'logical_layer.dest_system',
          'logical_layer.refresh_rate_hz',
          'logical_layer.functional_category',
          'transport_layer.protocol_id',
          'transport_layer.bus_id',
          'transport_layer.bit_offset',
          'transport_layer.bit_length',
          'transport_layer.encoding',
          'transport_layer.scale_factor',
          'transport_layer.offset_value',
          'transport_layer.byte_order',
          'transport_layer.protocol_attrs',
        );
      return rows;
    },
  };
}
