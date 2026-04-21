/**
 * CAN Bus protocol validation plugin.
 *
 * Validates transport attributes against the CAN Bus specification:
 * - arbitration_id: hex string (e.g. "0x1A3" for standard, "0x18FEF100" for extended)
 * - id_format: "standard_11bit" or "extended_29bit"
 * - dlc: data length code 0–8
 * - cycle_time_ms: positive number
 * - start_bit: 0–63
 * - signal_length: 1–64
 */

import type { ValidationResult, ValidationError } from '@connectedflow/shared-types';
import type { ProtocolPlugin, JSONSchema, MigrationResult } from './protocol-plugin.js';

const VALID_ID_FORMATS = ['standard_11bit', 'extended_29bit'];
const HEX_PATTERN = /^0x[0-9a-fA-F]+$/;
const MAX_STANDARD_ID = 0x7ff; // 11-bit
const MAX_EXTENDED_ID = 0x1fffffff; // 29-bit

export const canBusFieldSchema: JSONSchema = {
  arbitration_id: {
    type: 'string',
    description: 'CAN arbitration ID as hex string (e.g. "0x1A3")',
    required: true,
  },
  id_format: {
    type: 'string',
    description: 'ID format: standard (11-bit) or extended (29-bit)',
    required: true,
    enum: VALID_ID_FORMATS,
  },
  dlc: {
    type: 'integer',
    description: 'Data Length Code (0–8 bytes)',
    required: true,
    minimum: 0,
    maximum: 8,
  },
  cycle_time_ms: {
    type: 'number',
    description: 'Message cycle time in milliseconds (must be positive)',
    required: true,
    minimum: 0,
  },
  start_bit: {
    type: 'integer',
    description: 'Start bit position within the CAN frame (0–63)',
    required: true,
    minimum: 0,
    maximum: 63,
  },
  signal_length: {
    type: 'integer',
    description: 'Signal length in bits (1–64)',
    required: true,
    minimum: 1,
    maximum: 64,
  },
};

export class CanBusPlugin implements ProtocolPlugin {
  readonly protocolId = 'canbus';
  readonly fieldSchema = canBusFieldSchema;

  validate(attrs: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];

    // arbitration_id
    if (attrs.arbitration_id === undefined || attrs.arbitration_id === null) {
      errors.push({ field: 'arbitration_id', message: 'arbitration_id is required', severity: 'error' });
    } else if (typeof attrs.arbitration_id !== 'string' || !HEX_PATTERN.test(attrs.arbitration_id)) {
      errors.push({ field: 'arbitration_id', message: 'arbitration_id must be a hex string (e.g. "0x1A3")', severity: 'error' });
    } else {
      const idValue = parseInt(attrs.arbitration_id, 16);
      const format = attrs.id_format as string;
      if (format === 'standard_11bit' && idValue > MAX_STANDARD_ID) {
        errors.push({ field: 'arbitration_id', message: `arbitration_id exceeds 11-bit maximum (0x${MAX_STANDARD_ID.toString(16)})`, severity: 'error' });
      } else if (format === 'extended_29bit' && idValue > MAX_EXTENDED_ID) {
        errors.push({ field: 'arbitration_id', message: `arbitration_id exceeds 29-bit maximum (0x${MAX_EXTENDED_ID.toString(16)})`, severity: 'error' });
      }
    }

    // id_format
    if (attrs.id_format === undefined || attrs.id_format === null) {
      errors.push({ field: 'id_format', message: 'id_format is required', severity: 'error' });
    } else if (!VALID_ID_FORMATS.includes(attrs.id_format as string)) {
      errors.push({ field: 'id_format', message: `id_format must be one of: ${VALID_ID_FORMATS.join(', ')}`, severity: 'error' });
    }

    // dlc
    if (attrs.dlc === undefined || attrs.dlc === null) {
      errors.push({ field: 'dlc', message: 'dlc is required', severity: 'error' });
    } else if (typeof attrs.dlc !== 'number' || !Number.isInteger(attrs.dlc)) {
      errors.push({ field: 'dlc', message: 'dlc must be an integer', severity: 'error' });
    } else if (attrs.dlc < 0 || attrs.dlc > 8) {
      errors.push({ field: 'dlc', message: 'dlc must be between 0 and 8', severity: 'error' });
    }

    // cycle_time_ms
    if (attrs.cycle_time_ms === undefined || attrs.cycle_time_ms === null) {
      errors.push({ field: 'cycle_time_ms', message: 'cycle_time_ms is required', severity: 'error' });
    } else if (typeof attrs.cycle_time_ms !== 'number') {
      errors.push({ field: 'cycle_time_ms', message: 'cycle_time_ms must be a number', severity: 'error' });
    } else if (attrs.cycle_time_ms <= 0) {
      errors.push({ field: 'cycle_time_ms', message: 'cycle_time_ms must be positive', severity: 'error' });
    }

    // start_bit
    if (attrs.start_bit === undefined || attrs.start_bit === null) {
      errors.push({ field: 'start_bit', message: 'start_bit is required', severity: 'error' });
    } else if (typeof attrs.start_bit !== 'number' || !Number.isInteger(attrs.start_bit)) {
      errors.push({ field: 'start_bit', message: 'start_bit must be an integer', severity: 'error' });
    } else if (attrs.start_bit < 0 || attrs.start_bit > 63) {
      errors.push({ field: 'start_bit', message: 'start_bit must be between 0 and 63', severity: 'error' });
    }

    // signal_length
    if (attrs.signal_length === undefined || attrs.signal_length === null) {
      errors.push({ field: 'signal_length', message: 'signal_length is required', severity: 'error' });
    } else if (typeof attrs.signal_length !== 'number' || !Number.isInteger(attrs.signal_length)) {
      errors.push({ field: 'signal_length', message: 'signal_length must be an integer', severity: 'error' });
    } else if (attrs.signal_length < 1 || attrs.signal_length > 64) {
      errors.push({ field: 'signal_length', message: 'signal_length must be between 1 and 64', severity: 'error' });
    }

    // Cross-field: start_bit + signal_length must fit within dlc * 8
    if (
      typeof attrs.start_bit === 'number' &&
      typeof attrs.signal_length === 'number' &&
      typeof attrs.dlc === 'number' &&
      attrs.dlc >= 0 && attrs.dlc <= 8
    ) {
      const maxBits = attrs.dlc * 8;
      if (attrs.start_bit + attrs.signal_length > maxBits) {
        errors.push({
          field: 'start_bit',
          message: `start_bit (${attrs.start_bit}) + signal_length (${attrs.signal_length}) exceeds DLC capacity (${maxBits} bits)`,
          severity: 'error',
        });
      }
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
      case 'arinc429':
        // resolution → loosely related to signal encoding, needs review
        for (const key of sourceKeys) {
          if (key === 'label' || key === 'sdi' || key === 'ssm' ||
              key === 'word_type' || key === 'resolution' || key === 'bus_speed') {
            cleared.push(key);
          }
        }
        needsReview.push('arbitration_id', 'id_format', 'dlc', 'cycle_time_ms', 'start_bit', 'signal_length');
        break;

      case 'milstd1553':
        // minor_frame_rate_hz → cycle_time_ms (timing concept, needs review for conversion)
        // word_count → dlc (data capacity concept, needs review for conversion)
        if (typeof attrs.minor_frame_rate_hz === 'number' && attrs.minor_frame_rate_hz > 0) {
          targetAttrs.cycle_time_ms = 1000 / attrs.minor_frame_rate_hz;
          preserved.push('cycle_time_ms');
        } else {
          needsReview.push('cycle_time_ms');
        }

        if (typeof attrs.word_count === 'number') {
          // 1553 word = 16 bits = 2 bytes; CAN DLC is in bytes (max 8)
          const bytes = attrs.word_count * 2;
          if (bytes <= 8) {
            targetAttrs.dlc = bytes;
            preserved.push('dlc');
          } else {
            // Exceeds CAN capacity — needs review
            needsReview.push('dlc');
          }
        } else {
          needsReview.push('dlc');
        }

        for (const key of sourceKeys) {
          if (key === 'remote_terminal' || key === 'sub_address' ||
              key === 'direction' || key === 'message_type') {
            cleared.push(key);
          }
          if (key === 'word_count' && !preserved.includes('dlc')) {
            cleared.push(key);
          }
          if (key === 'minor_frame_rate_hz' && !preserved.includes('cycle_time_ms')) {
            cleared.push(key);
          }
        }

        needsReview.push('arbitration_id', 'id_format', 'start_bit', 'signal_length');
        break;

      case 'arinc664':
        // bag_ms → cycle_time_ms (timing concept, semantically similar)
        if (typeof attrs.bag_ms === 'number' && attrs.bag_ms > 0) {
          targetAttrs.cycle_time_ms = attrs.bag_ms;
          preserved.push('cycle_time_ms');
        } else {
          needsReview.push('cycle_time_ms');
        }

        for (const key of sourceKeys) {
          if (key === 'virtual_link_id' || key === 'max_frame_size' ||
              key === 'partition_id' || key === 'sub_virtual_link' || key === 'network') {
            cleared.push(key);
          }
          if (key === 'bag_ms' && !preserved.includes('cycle_time_ms')) {
            cleared.push(key);
          }
        }

        needsReview.push('arbitration_id', 'id_format', 'dlc', 'start_bit', 'signal_length');
        break;

      default:
        for (const key of sourceKeys) {
          cleared.push(key);
        }
        needsReview.push('arbitration_id', 'id_format', 'dlc', 'cycle_time_ms', 'start_bit', 'signal_length');
        break;
    }

    return { preserved, cleared, needsReview, targetAttrs };
  }
}
