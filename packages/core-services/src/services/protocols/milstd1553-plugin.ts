/**
 * MIL-STD-1553 protocol validation plugin.
 *
 * Validates transport attributes against the MIL-STD-1553B specification:
 * - remote_terminal: 0–30 (RT address; 31 is broadcast)
 * - sub_address: 0–31 (sub-address/mode code)
 * - word_count: 1–32 (data words per message)
 * - direction: RT_to_BC, BC_to_RT, or RT_to_RT
 * - message_type: periodic or aperiodic
 * - minor_frame_rate_hz: positive number
 */

import type { ValidationResult, ValidationError } from '@connectedflow/shared-types';
import type { ProtocolPlugin, JSONSchema, MigrationResult } from './protocol-plugin.js';

const VALID_DIRECTIONS = ['RT_to_BC', 'BC_to_RT', 'RT_to_RT'];
const VALID_MESSAGE_TYPES = ['periodic', 'aperiodic'];

export const milStd1553FieldSchema: JSONSchema = {
  remote_terminal: {
    type: 'integer',
    description: 'Remote Terminal address (0–30; 31 is broadcast)',
    required: true,
    minimum: 0,
    maximum: 30,
  },
  sub_address: {
    type: 'integer',
    description: 'Sub-address (0–31)',
    required: true,
    minimum: 0,
    maximum: 31,
  },
  word_count: {
    type: 'integer',
    description: 'Number of 16-bit data words per message (1–32)',
    required: true,
    minimum: 1,
    maximum: 32,
  },
  direction: {
    type: 'string',
    description: 'Message transfer direction',
    required: true,
    enum: VALID_DIRECTIONS,
  },
  message_type: {
    type: 'string',
    description: 'Message scheduling type',
    required: true,
    enum: VALID_MESSAGE_TYPES,
  },
  minor_frame_rate_hz: {
    type: 'number',
    description: 'Minor frame rate in Hz (must be positive)',
    required: true,
    minimum: 0,
  },
};

export class MilStd1553Plugin implements ProtocolPlugin {
  readonly protocolId = 'milstd1553';
  readonly fieldSchema = milStd1553FieldSchema;

  validate(attrs: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = [];

    // remote_terminal
    if (attrs.remote_terminal === undefined || attrs.remote_terminal === null) {
      errors.push({ field: 'remote_terminal', message: 'remote_terminal is required', severity: 'error' });
    } else if (typeof attrs.remote_terminal !== 'number' || !Number.isInteger(attrs.remote_terminal)) {
      errors.push({ field: 'remote_terminal', message: 'remote_terminal must be an integer', severity: 'error' });
    } else if (attrs.remote_terminal < 0 || attrs.remote_terminal > 30) {
      errors.push({ field: 'remote_terminal', message: 'remote_terminal must be between 0 and 30', severity: 'error' });
    }

    // sub_address
    if (attrs.sub_address === undefined || attrs.sub_address === null) {
      errors.push({ field: 'sub_address', message: 'sub_address is required', severity: 'error' });
    } else if (typeof attrs.sub_address !== 'number' || !Number.isInteger(attrs.sub_address)) {
      errors.push({ field: 'sub_address', message: 'sub_address must be an integer', severity: 'error' });
    } else if (attrs.sub_address < 0 || attrs.sub_address > 31) {
      errors.push({ field: 'sub_address', message: 'sub_address must be between 0 and 31', severity: 'error' });
    }

    // word_count
    if (attrs.word_count === undefined || attrs.word_count === null) {
      errors.push({ field: 'word_count', message: 'word_count is required', severity: 'error' });
    } else if (typeof attrs.word_count !== 'number' || !Number.isInteger(attrs.word_count)) {
      errors.push({ field: 'word_count', message: 'word_count must be an integer', severity: 'error' });
    } else if (attrs.word_count < 1 || attrs.word_count > 32) {
      errors.push({ field: 'word_count', message: 'word_count must be between 1 and 32', severity: 'error' });
    }

    // direction
    if (attrs.direction === undefined || attrs.direction === null) {
      errors.push({ field: 'direction', message: 'direction is required', severity: 'error' });
    } else if (!VALID_DIRECTIONS.includes(attrs.direction as string)) {
      errors.push({ field: 'direction', message: `direction must be one of: ${VALID_DIRECTIONS.join(', ')}`, severity: 'error' });
    }

    // message_type
    if (attrs.message_type === undefined || attrs.message_type === null) {
      errors.push({ field: 'message_type', message: 'message_type is required', severity: 'error' });
    } else if (!VALID_MESSAGE_TYPES.includes(attrs.message_type as string)) {
      errors.push({ field: 'message_type', message: `message_type must be one of: ${VALID_MESSAGE_TYPES.join(', ')}`, severity: 'error' });
    }

    // minor_frame_rate_hz
    if (attrs.minor_frame_rate_hz === undefined || attrs.minor_frame_rate_hz === null) {
      errors.push({ field: 'minor_frame_rate_hz', message: 'minor_frame_rate_hz is required', severity: 'error' });
    } else if (typeof attrs.minor_frame_rate_hz !== 'number') {
      errors.push({ field: 'minor_frame_rate_hz', message: 'minor_frame_rate_hz must be a number', severity: 'error' });
    } else if (attrs.minor_frame_rate_hz <= 0) {
      errors.push({ field: 'minor_frame_rate_hz', message: 'minor_frame_rate_hz must be positive', severity: 'error' });
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
        // cycle_time_ms → minor_frame_rate_hz (timing, invertible conversion)
        if (typeof attrs.cycle_time_ms === 'number' && attrs.cycle_time_ms > 0) {
          targetAttrs.minor_frame_rate_hz = 1000 / attrs.cycle_time_ms;
          preserved.push('minor_frame_rate_hz');
        } else {
          needsReview.push('minor_frame_rate_hz');
        }

        // dlc → word_count (data capacity: CAN bytes / 2 = 1553 words)
        if (typeof attrs.dlc === 'number' && attrs.dlc > 0) {
          const words = Math.ceil(attrs.dlc / 2);
          if (words >= 1 && words <= 32) {
            targetAttrs.word_count = words;
            preserved.push('word_count');
          } else {
            needsReview.push('word_count');
          }
        } else {
          needsReview.push('word_count');
        }

        for (const key of sourceKeys) {
          if (key === 'arbitration_id' || key === 'id_format' ||
              key === 'start_bit' || key === 'signal_length') {
            cleared.push(key);
          }
          if (key === 'cycle_time_ms' && !preserved.includes('minor_frame_rate_hz')) {
            cleared.push(key);
          }
          if (key === 'dlc' && !preserved.includes('word_count')) {
            cleared.push(key);
          }
        }

        needsReview.push('remote_terminal', 'sub_address', 'direction', 'message_type');
        break;

      case 'arinc429':
        for (const key of sourceKeys) {
          if (key === 'label' || key === 'sdi' || key === 'ssm' ||
              key === 'word_type' || key === 'resolution' || key === 'bus_speed') {
            cleared.push(key);
          }
        }
        needsReview.push('remote_terminal', 'sub_address', 'word_count', 'direction', 'message_type', 'minor_frame_rate_hz');
        break;

      case 'arinc664':
        // bag_ms → minor_frame_rate_hz (timing conversion)
        if (typeof attrs.bag_ms === 'number' && attrs.bag_ms > 0) {
          targetAttrs.minor_frame_rate_hz = 1000 / attrs.bag_ms;
          preserved.push('minor_frame_rate_hz');
        } else {
          needsReview.push('minor_frame_rate_hz');
        }

        // max_frame_size → word_count (capacity: frame bytes / 2, clamped to 1-32)
        if (typeof attrs.max_frame_size === 'number' && attrs.max_frame_size > 0) {
          const words = Math.min(32, Math.ceil(attrs.max_frame_size / 2));
          if (words >= 1) {
            targetAttrs.word_count = words;
            needsReview.push('word_count'); // approximate conversion, needs review
          } else {
            needsReview.push('word_count');
          }
        } else {
          needsReview.push('word_count');
        }

        for (const key of sourceKeys) {
          if (key === 'virtual_link_id' || key === 'partition_id' ||
              key === 'sub_virtual_link' || key === 'network') {
            cleared.push(key);
          }
          if (key === 'bag_ms' && !preserved.includes('minor_frame_rate_hz')) {
            cleared.push(key);
          }
          if (key === 'max_frame_size') {
            cleared.push(key);
          }
        }

        needsReview.push('remote_terminal', 'sub_address', 'direction', 'message_type');
        break;

      default:
        for (const key of sourceKeys) {
          cleared.push(key);
        }
        needsReview.push('remote_terminal', 'sub_address', 'word_count', 'direction', 'message_type', 'minor_frame_rate_hz');
        break;
    }

    return { preserved, cleared, needsReview, targetAttrs };
  }
}
