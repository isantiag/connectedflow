/**
 * ARINC 664 (AFDX) protocol validation plugin.
 *
 * Validates transport attributes against the ARINC 664 Part 7 specification:
 * - virtual_link_id: 1–65535
 * - bag_ms: Bandwidth Allocation Gap in ms (must be positive, typically power of 2)
 * - max_frame_size: 64–1518 bytes (Ethernet frame limits)
 * - partition_id: non-empty string identifier
 * - sub_virtual_link: 0–255
 * - network: "A" or "B" (redundant network pair)
 */

import type { ValidationResult, ValidationError } from '@connectedflow/shared-types';
import type { ProtocolPlugin, JSONSchema, MigrationResult } from './protocol-plugin.js';

const VALID_NETWORKS = ['A', 'B'];

export const arinc664FieldSchema: JSONSchema = {
  virtual_link_id: {
    type: 'integer',
    description: 'Virtual Link identifier (1–65535)',
    required: true,
    minimum: 1,
    maximum: 65535,
  },
  bag_ms: {
    type: 'number',
    description: 'Bandwidth Allocation Gap in milliseconds (must be positive)',
    required: true,
    minimum: 0,
  },
  max_frame_size: {
    type: 'integer',
    description: 'Maximum Ethernet frame size in bytes (64–1518)',
    required: true,
    minimum: 64,
    maximum: 1518,
  },
  partition_id: {
    type: 'string',
    description: 'ARINC 653 partition identifier',
    required: true,
  },
  sub_virtual_link: {
    type: 'integer',
    description: 'Sub-Virtual Link index (0–255)',
    required: true,
    minimum: 0,
    maximum: 255,
  },
  network: {
    type: 'string',
    description: 'Redundant network identifier: A or B',
    required: true,
    enum: VALID_NETWORKS,
  },
};

export class Arinc664Plugin implements ProtocolPlugin {
  readonly protocolId = 'arinc664';
  readonly fieldSchema = arinc664FieldSchema;

  validate(attrs: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];

    // virtual_link_id
    if (attrs.virtual_link_id === undefined || attrs.virtual_link_id === null) {
      errors.push({ field: 'virtual_link_id', message: 'virtual_link_id is required', severity: 'error' });
    } else if (typeof attrs.virtual_link_id !== 'number' || !Number.isInteger(attrs.virtual_link_id)) {
      errors.push({ field: 'virtual_link_id', message: 'virtual_link_id must be an integer', severity: 'error' });
    } else if (attrs.virtual_link_id < 1 || attrs.virtual_link_id > 65535) {
      errors.push({ field: 'virtual_link_id', message: 'virtual_link_id must be between 1 and 65535', severity: 'error' });
    }

    // bag_ms
    if (attrs.bag_ms === undefined || attrs.bag_ms === null) {
      errors.push({ field: 'bag_ms', message: 'bag_ms is required', severity: 'error' });
    } else if (typeof attrs.bag_ms !== 'number') {
      errors.push({ field: 'bag_ms', message: 'bag_ms must be a number', severity: 'error' });
    } else if (attrs.bag_ms <= 0) {
      errors.push({ field: 'bag_ms', message: 'bag_ms must be positive', severity: 'error' });
    }

    // max_frame_size
    if (attrs.max_frame_size === undefined || attrs.max_frame_size === null) {
      errors.push({ field: 'max_frame_size', message: 'max_frame_size is required', severity: 'error' });
    } else if (typeof attrs.max_frame_size !== 'number' || !Number.isInteger(attrs.max_frame_size)) {
      errors.push({ field: 'max_frame_size', message: 'max_frame_size must be an integer', severity: 'error' });
    } else if (attrs.max_frame_size < 64 || attrs.max_frame_size > 1518) {
      errors.push({ field: 'max_frame_size', message: 'max_frame_size must be between 64 and 1518', severity: 'error' });
    }

    // partition_id
    if (attrs.partition_id === undefined || attrs.partition_id === null) {
      errors.push({ field: 'partition_id', message: 'partition_id is required', severity: 'error' });
    } else if (typeof attrs.partition_id !== 'string' || attrs.partition_id.trim() === '') {
      errors.push({ field: 'partition_id', message: 'partition_id must be a non-empty string', severity: 'error' });
    }

    // sub_virtual_link
    if (attrs.sub_virtual_link === undefined || attrs.sub_virtual_link === null) {
      errors.push({ field: 'sub_virtual_link', message: 'sub_virtual_link is required', severity: 'error' });
    } else if (typeof attrs.sub_virtual_link !== 'number' || !Number.isInteger(attrs.sub_virtual_link)) {
      errors.push({ field: 'sub_virtual_link', message: 'sub_virtual_link must be an integer', severity: 'error' });
    } else if (attrs.sub_virtual_link < 0 || attrs.sub_virtual_link > 255) {
      errors.push({ field: 'sub_virtual_link', message: 'sub_virtual_link must be between 0 and 255', severity: 'error' });
    }

    // network
    if (attrs.network === undefined || attrs.network === null) {
      errors.push({ field: 'network', message: 'network is required', severity: 'error' });
    } else if (!VALID_NETWORKS.includes(attrs.network as string)) {
      errors.push({ field: 'network', message: `network must be one of: ${VALID_NETWORKS.join(', ')}`, severity: 'error' });
    }

    return { valid: errors.length === 0, errors };
  }

  migrateFrom(sourceProtocol: string, attrs: Record<string, unknown>): MigrationResult {
    const preserved: string[] = [];
    const cleared: string[] = [];
    const needsReview: string[] = [];
    const targetAttrs: Record<string, unknown> = {};

    const sourceKeys = Object.keys(attrs);

    switch (sourceProtocol) {
      case 'canbus':
        // cycle_time_ms → bag_ms (timing concept, semantically similar)
        if (typeof attrs.cycle_time_ms === 'number' && attrs.cycle_time_ms > 0) {
          targetAttrs.bag_ms = attrs.cycle_time_ms;
          preserved.push('bag_ms');
        } else {
          needsReview.push('bag_ms');
        }

        // dlc → max_frame_size (data capacity, needs review — very different scales)
        for (const key of sourceKeys) {
          if (key === 'arbitration_id' || key === 'id_format' ||
              key === 'start_bit' || key === 'signal_length' || key === 'dlc') {
            cleared.push(key);
          }
          if (key === 'cycle_time_ms' && !preserved.includes('bag_ms')) {
            cleared.push(key);
          }
        }

        needsReview.push('virtual_link_id', 'max_frame_size', 'partition_id', 'sub_virtual_link', 'network');
        break;

      case 'milstd1553':
        // minor_frame_rate_hz → bag_ms (timing conversion)
        if (typeof attrs.minor_frame_rate_hz === 'number' && attrs.minor_frame_rate_hz > 0) {
          targetAttrs.bag_ms = 1000 / attrs.minor_frame_rate_hz;
          preserved.push('bag_ms');
        } else {
          needsReview.push('bag_ms');
        }

        for (const key of sourceKeys) {
          if (key === 'remote_terminal' || key === 'sub_address' ||
              key === 'word_count' || key === 'direction' || key === 'message_type') {
            cleared.push(key);
          }
          if (key === 'minor_frame_rate_hz' && !preserved.includes('bag_ms')) {
            cleared.push(key);
          }
        }

        needsReview.push('virtual_link_id', 'max_frame_size', 'partition_id', 'sub_virtual_link', 'network');
        break;

      case 'arinc429':
        // Both ARINC family but very different architectures
        for (const key of sourceKeys) {
          if (key === 'label' || key === 'sdi' || key === 'ssm' ||
              key === 'word_type' || key === 'resolution' || key === 'bus_speed') {
            cleared.push(key);
          }
        }
        needsReview.push('virtual_link_id', 'bag_ms', 'max_frame_size', 'partition_id', 'sub_virtual_link', 'network');
        break;

      default:
        for (const key of sourceKeys) {
          cleared.push(key);
        }
        needsReview.push('virtual_link_id', 'bag_ms', 'max_frame_size', 'partition_id', 'sub_virtual_link', 'network');
        break;
    }

    return { preserved, cleared, needsReview, targetAttrs };
  }
}
