/**
 * Architecture Model services — business logic for Tasks 5, 6, 7.
 * §1 Backend: All business logic here, NOT in route handlers.
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { Knex } from 'knex';

// ============================================================
// Zod Schemas — §2 Backend: .strict() on every input
// ============================================================

export const CreatePowerModeSchema = z.object({
  mode: z.string().min(1).max(100),
  power_watts: z.number().min(0),
  description: z.string().max(500).default(''),
}).strict();

export const CreateBusInstanceSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  protocol_id: z.string().uuid().optional(),
  redundancy: z.enum(['single', 'dual', 'triple']).default('single'),
  bandwidth_kbps: z.number().min(0).optional(),
  description: z.string().max(500).default(''),
}).strict();

// ============================================================
// Power Mode Service
// ============================================================

export function createPowerModeService(db: Knex) {
  return {
    async create(systemId: string, input: z.infer<typeof CreatePowerModeSchema>) {
      const [row] = await db('system_power_mode')
        .insert({ system_id: systemId, ...input })
        .returning('*');
      return row;
    },

    async list(systemId: string) {
      return db('system_power_mode')
        .where('system_id', systemId)
        .orderBy('mode');
    },

    async remove(systemId: string, modeId: string) {
      const count = await db('system_power_mode')
        .where({ id: modeId, system_id: systemId })
        .del();
      return { deleted: count > 0 };
    },
  };
}

// ============================================================
// Bus Instance Service
// ============================================================

export function createBusInstanceService(db: Knex) {
  return {
    async create(input: z.infer<typeof CreateBusInstanceSchema>) {
      const id = uuidv4();
      const canonical_id = `ee-aero.icd.${body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const [row] = await db('bus_instance')
        .insert({ id, canonical_id, ...input })
        .returning('*');
      return row;
    },

    async list(projectId: string) {
      return db('bus_instance')
        .where('project_id', projectId)
        .orderBy('name');
    },

    async getById(id: string) {
      const bus = await db('bus_instance').where('id', id).first();
      if (!bus) return null;

      const connectionCount = await db('connection')
        .where('bus_id', id)
        .count('* as count')
        .first();

      const loading = await this.computeLoading(id);

      return {
        ...bus,
        connection_count: parseInt(String(connectionCount?.count ?? '0'), 10),
        loading,
      };
    },

    async getMessages(busId: string) {
      return db('message')
        .join('connection', 'message.connection_id', 'connection.id')
        .where('connection.bus_id', busId)
        .select('message.*', 'connection.name as connection_name');
    },

    async computeLoading(busId: string) {
      const bus = await db('bus_instance').where('id', busId).first();
      if (!bus) return null;

      const connections = await db('connection')
        .where('bus_id', busId)
        .select('connection.id', 'connection.name');

      const breakdown: Array<{
        connection_id: string;
        connection_name: string;
        message_count: number;
        total_rate_hz: number;
      }> = [];

      let totalRateHz = 0;

      for (const conn of connections) {
        const messages = await db('message')
          .where('connection_id', conn.id)
          .select('refresh_rate_hz');

        const connRate = messages.reduce(
          (sum: number, m: { refresh_rate_hz: number | null }) =>
            sum + (m.refresh_rate_hz ?? 0),
          0,
        );
        totalRateHz += connRate;

        breakdown.push({
          connection_id: conn.id,
          connection_name: conn.name || '',
          message_count: messages.length,
          total_rate_hz: connRate,
        });
      }

      // Estimate bandwidth usage: assume 32-bit words at the total rate
      const estimatedKbps = (totalRateHz * 32) / 1000;
      const bandwidthKbps = bus.bandwidth_kbps ? parseFloat(bus.bandwidth_kbps) : 0;
      const utilization = bandwidthKbps > 0
        ? (estimatedKbps / bandwidthKbps) * 100
        : 0;

      let status: 'ok' | 'warning' | 'error' = 'ok';
      if (utilization > 100) status = 'error';
      else if (utilization > 80) status = 'warning';

      return {
        bus_id: busId,
        bandwidth_kbps: bandwidthKbps,
        estimated_kbps: Math.round(estimatedKbps * 100) / 100,
        utilization_percent: Math.round(utilization * 100) / 100,
        status,
        connections: breakdown,
      };
    },
  };
}

// ============================================================
// Protocol Validation Service — Task 7
// ============================================================

export function createProtocolValidationService(db: Knex) {
  return {
    /**
     * Validate a message against its protocol's validation_rules.
     * Returns null if valid, or an error details object if invalid.
     */
    async validateMessage(
      connectionId: string,
      messageData: {
        message_id_primary: string;
        protocol_attrs?: Record<string, unknown>;
        word_count?: number;
      },
    ): Promise<{ code: string; message: string; details: unknown[] } | null> {
      // Get connection + protocol
      const connection = await db('connection').where('id', connectionId).first();
      if (!connection) {
        return { code: 'NOT_FOUND', message: 'Connection not found', details: [] };
      }

      const protocol = await db('protocol_definition')
        .where('id', connection.protocol_id)
        .first();
      if (!protocol || !protocol.validation_rules) return null;

      const rules = typeof protocol.validation_rules === 'string'
        ? JSON.parse(protocol.validation_rules)
        : protocol.validation_rules;

      const errors: Array<{ rule: string; expected: unknown; actual: unknown }> = [];
      const protocolName = protocol.protocol_name?.toUpperCase() ?? '';
      const attrs = messageData.protocol_attrs ?? {};

      // ARINC 429 checks
      if (protocolName.includes('429')) {
        // word_size must be 32
        if (attrs.word_size_bits !== undefined && attrs.word_size_bits !== 32) {
          errors.push({
            rule: 'word_size',
            expected: 32,
            actual: attrs.word_size_bits,
          });
        }

        // label count per channel ≤ 256
        if (rules.max_labels_per_channel) {
          const existingCount = await db('message')
            .where('connection_id', connectionId)
            .count('* as count')
            .first();
          const count = parseInt(String(existingCount?.count ?? '0'), 10);
          if (count >= rules.max_labels_per_channel) {
            errors.push({
              rule: 'max_labels_per_channel',
              expected: rules.max_labels_per_channel,
              actual: count + 1,
            });
          }
        }
      }

      // ARINC 825 / CAN checks
      if (protocolName.includes('825') || protocolName.includes('CAN')) {
        const dlc = attrs.dlc ?? messageData.word_count;
        if (dlc !== undefined && typeof dlc === 'number' && dlc > (rules.max_dlc ?? 8)) {
          errors.push({
            rule: 'max_dlc',
            expected: rules.max_dlc ?? 8,
            actual: dlc,
          });
        }
      }

      // AFDX checks
      if (protocolName.includes('AFDX')) {
        const bagMs = attrs.bag_ms;
        if (bagMs !== undefined && typeof bagMs === 'number' && bagMs < (rules.min_bag_ms ?? 1)) {
          errors.push({
            rule: 'min_bag_ms',
            expected: `>= ${rules.min_bag_ms ?? 1}`,
            actual: bagMs,
          });
        }

        const maxFrame = attrs.max_frame_bytes;
        if (maxFrame !== undefined && typeof maxFrame === 'number' && maxFrame > (rules.max_frame_bytes ?? 1471)) {
          errors.push({
            rule: 'max_frame_bytes',
            expected: `<= ${rules.max_frame_bytes ?? 1471}`,
            actual: maxFrame,
          });
        }
      }

      if (errors.length > 0) {
        return {
          code: 'PROTOCOL_VALIDATION_FAILED',
          message: `Message violates ${protocol.protocol_name} validation rules`,
          details: errors,
        };
      }

      return null;
    },
  };
}
