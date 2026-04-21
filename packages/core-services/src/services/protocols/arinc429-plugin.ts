/**
 * ARINC 429 protocol validation plugin.
 *
 * Validates transport attributes against the ARINC 429 specification:
 * - label: 0–377 (octal), stored as decimal 0–255
 * - sdi: 2-bit source/destination identifier ("00","01","10","11")
 * - ssm: sign/status matrix
 * - word_type: BNR, BCD, or discrete
 * - resolution: positive number
 * - bus_speed: "high" (100 kbps) or "low" (12.5 kbps)
 */

import type { ValidationResult, ValidationError } from '@connectedflow/shared-types';
import type { ProtocolPlugin, JSONSchema, MigrationResult } from './protocol-plugin.js';

const VALID_SDI = ['00', '01', '10', '11'];
const VALID_SSM = ['normal', 'no_computed_data', 'functional_test', 'failure_warning'];
const VALID_WORD_TYPES = ['BNR', 'BCD', 'discrete'];
const VALID_BUS_SPEEDS = ['high', 'low'];

export const arinc429FieldSchema: JSONSchema = {
  label: {
    type: 'integer',
    description: 'ARINC 429 label number (0–255, octal 000–377)',
    required: true,
    minimum: 0,
    maximum: 255,
  },
  sdi: {
    type: 'string',
    description: 'Source/Destination Identifier (2-bit)',
    required: true,
    enum: VALID_SDI,
  },
  ssm: {
    type: 'string',
    description: 'Sign/Status Matrix',
    required: true,
    enum: VALID_SSM,
  },
  word_type: {
    type: 'string',
    description: 'Word encoding type',
    required: true,
    enum: VALID_WORD_TYPES,
  },
  resolution: {
    type: 'number',
    description: 'Resolution (scaling factor for BNR words)',
    required: true,
    minimum: 0,
  },
  bus_speed: {
    type: 'string',
    description: 'Bus speed: high (100 kbps) or low (12.5 kbps)',
    required: true,
    enum: VALID_BUS_SPEEDS,
  },
};

export class Arinc429Plugin implements ProtocolPlugin {
  readonly protocolId = 'arinc429';
  readonly fieldSchema = arinc429FieldSchema;

  validate(attrs: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];

    // Required field checks
    if (attrs.label === undefined || attrs.label === null) {
      errors.push({ field: 'label', message: 'label is required', severity: 'error' });
    } else if (typeof attrs.label !== 'number' || !Number.isInteger(attrs.label)) {
      errors.push({ field: 'label', message: 'label must be an integer', severity: 'error' });
    } else if (attrs.label < 0 || attrs.label > 255) {
      errors.push({ field: 'label', message: 'label must be between 0 and 255', severity: 'error' });
    }

    if (attrs.sdi === undefined || attrs.sdi === null) {
      errors.push({ field: 'sdi', message: 'sdi is required', severity: 'error' });
    } else if (!VALID_SDI.includes(attrs.sdi as string)) {
      errors.push({ field: 'sdi', message: `sdi must be one of: ${VALID_SDI.join(', ')}`, severity: 'error' });
    }

    if (attrs.ssm === undefined || attrs.ssm === null) {
      errors.push({ field: 'ssm', message: 'ssm is required', severity: 'error' });
    } else if (!VALID_SSM.includes(attrs.ssm as string)) {
      errors.push({ field: 'ssm', message: `ssm must be one of: ${VALID_SSM.join(', ')}`, severity: 'error' });
    }

    if (attrs.word_type === undefined || attrs.word_type === null) {
      errors.push({ field: 'word_type', message: 'word_type is required', severity: 'error' });
    } else if (!VALID_WORD_TYPES.includes(attrs.word_type as string)) {
      errors.push({ field: 'word_type', message: `word_type must be one of: ${VALID_WORD_TYPES.join(', ')}`, severity: 'error' });
    }

    if (attrs.resolution === undefined || attrs.resolution === null) {
      errors.push({ field: 'resolution', message: 'resolution is required', severity: 'error' });
    } else if (typeof attrs.resolution !== 'number') {
      errors.push({ field: 'resolution', message: 'resolution must be a number', severity: 'error' });
    } else if (attrs.resolution < 0) {
      errors.push({ field: 'resolution', message: 'resolution must be non-negative', severity: 'error' });
    }

    if (attrs.bus_speed === undefined || attrs.bus_speed === null) {
      errors.push({ field: 'bus_speed', message: 'bus_speed is required', severity: 'error' });
    } else if (!VALID_BUS_SPEEDS.includes(attrs.bus_speed as string)) {
      errors.push({ field: 'bus_speed', message: `bus_speed must be one of: ${VALID_BUS_SPEEDS.join(', ')}`, severity: 'error' });
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
        // resolution ← no direct equivalent, needs review
        // bus_speed ← no direct equivalent, needs review
        // word_type ← no direct equivalent, needs review
        // label, sdi, ssm are ARINC 429-specific — no source equivalent
        for (const key of sourceKeys) {
          if (key === 'cycle_time_ms' || key === 'signal_length' || key === 'start_bit' ||
              key === 'dlc' || key === 'arbitration_id' || key === 'id_format') {
            cleared.push(key);
          }
        }
        // All ARINC 429 fields need manual configuration
        needsReview.push('label', 'sdi', 'ssm', 'word_type', 'resolution', 'bus_speed');
        break;

      case 'milstd1553':
        // message_type maps to a scheduling concept — needs review for word_type mapping
        for (const key of sourceKeys) {
          if (key === 'remote_terminal' || key === 'sub_address' || key === 'word_count' ||
              key === 'direction' || key === 'message_type' || key === 'minor_frame_rate_hz') {
            cleared.push(key);
          }
        }
        needsReview.push('label', 'sdi', 'ssm', 'word_type', 'resolution', 'bus_speed');
        break;

      case 'arinc664':
        // Both are ARINC family — network concept maps loosely to bus_speed (needs review)
        for (const key of sourceKeys) {
          if (key === 'virtual_link_id' || key === 'bag_ms' || key === 'max_frame_size' ||
              key === 'partition_id' || key === 'sub_virtual_link' || key === 'network') {
            cleared.push(key);
          }
        }
        needsReview.push('label', 'sdi', 'ssm', 'word_type', 'resolution', 'bus_speed');
        break;

      default:
        // Unknown source — clear everything, all target fields need review
        for (const key of sourceKeys) {
          cleared.push(key);
        }
        needsReview.push('label', 'sdi', 'ssm', 'word_type', 'resolution', 'bus_speed');
        break;
    }

    return { preserved, cleared, needsReview, targetAttrs };
  }
}
