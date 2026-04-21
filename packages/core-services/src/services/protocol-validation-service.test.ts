import { describe, it, expect } from 'vitest';
import { ProtocolValidationService } from './protocol-validation-service.js';
import { Arinc429Plugin } from './protocols/arinc429-plugin.js';
import { CanBusPlugin } from './protocols/canbus-plugin.js';
import { MilStd1553Plugin } from './protocols/milstd1553-plugin.js';
import { Arinc664Plugin } from './protocols/arinc664-plugin.js';
import type { ProtocolPlugin } from './protocols/protocol-plugin.js';

// ---------------------------------------------------------------------------
// Valid attribute fixtures
// ---------------------------------------------------------------------------

const validArinc429 = {
  label: 205,
  sdi: '00',
  ssm: 'normal',
  word_type: 'BNR',
  resolution: 0.0054932,
  bus_speed: 'high',
};

const validCanBus = {
  arbitration_id: '0x18FEF100',
  id_format: 'extended_29bit',
  dlc: 8,
  cycle_time_ms: 100,
  start_bit: 0,
  signal_length: 16,
};

const validMilStd1553 = {
  remote_terminal: 5,
  sub_address: 3,
  word_count: 4,
  direction: 'RT_to_BC',
  message_type: 'periodic',
  minor_frame_rate_hz: 80,
};

const validArinc664 = {
  virtual_link_id: 1024,
  bag_ms: 32,
  max_frame_size: 1518,
  partition_id: 'PART_NAV_01',
  sub_virtual_link: 1,
  network: 'A',
};

// ---------------------------------------------------------------------------
// ProtocolValidationService
// ---------------------------------------------------------------------------

describe('ProtocolValidationService', () => {
  it('registers all four built-in protocols on construction', () => {
    const svc = new ProtocolValidationService();
    const protocols = svc.getRegisteredProtocols();
    expect(protocols).toContain('arinc429');
    expect(protocols).toContain('canbus');
    expect(protocols).toContain('milstd1553');
    expect(protocols).toContain('arinc664');
  });

  it('validates valid attributes for each built-in protocol', () => {
    const svc = new ProtocolValidationService();
    expect(svc.validateTransport('arinc429', validArinc429).valid).toBe(true);
    expect(svc.validateTransport('canbus', validCanBus).valid).toBe(true);
    expect(svc.validateTransport('milstd1553', validMilStd1553).valid).toBe(true);
    expect(svc.validateTransport('arinc664', validArinc664).valid).toBe(true);
  });

  it('returns error for unknown protocol', () => {
    const svc = new ProtocolValidationService();
    const result = svc.validateTransport('unknown_proto', {});
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.field).toBe('protocolId');
  });

  it('returns field schema for registered protocols', () => {
    const svc = new ProtocolValidationService();
    const schema = svc.getFieldSchema('arinc429');
    expect(schema).toBeDefined();
    expect(schema!.label).toBeDefined();
    expect(schema!.sdi).toBeDefined();
  });

  it('returns undefined schema for unknown protocol', () => {
    const svc = new ProtocolValidationService();
    expect(svc.getFieldSchema('nonexistent')).toBeUndefined();
  });

  it('allows registering a custom plugin', () => {
    const svc = new ProtocolValidationService();
    const custom: ProtocolPlugin = {
      protocolId: 'custom',
      fieldSchema: { foo: { type: 'string', description: 'test', required: true } },
      validate: (attrs) => ({
        valid: typeof attrs.foo === 'string',
        errors: typeof attrs.foo === 'string'
          ? []
          : [{ field: 'foo', message: 'foo required', severity: 'error' as const }],
      }),
      migrateFrom: (_sourceProtocol, _attrs) => ({
        preserved: [],
        cleared: Object.keys(_attrs),
        needsReview: ['foo'],
        targetAttrs: {},
      }),
    };
    svc.registerPlugin(custom);
    expect(svc.getRegisteredProtocols()).toContain('custom');
    expect(svc.validateTransport('custom', { foo: 'bar' }).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ARINC 429 Plugin
// ---------------------------------------------------------------------------

describe('Arinc429Plugin', () => {
  const plugin = new Arinc429Plugin();

  it('accepts valid ARINC 429 attributes', () => {
    expect(plugin.validate(validArinc429).valid).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = plugin.validate({});
    expect(result.valid).toBe(false);
    const fields = result.errors.map((e) => e.field);
    expect(fields).toContain('label');
    expect(fields).toContain('sdi');
    expect(fields).toContain('ssm');
    expect(fields).toContain('word_type');
    expect(fields).toContain('resolution');
    expect(fields).toContain('bus_speed');
  });

  it('rejects label out of range', () => {
    const result = plugin.validate({ ...validArinc429, label: 256 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'label')).toBe(true);
  });

  it('rejects label = -1', () => {
    const result = plugin.validate({ ...validArinc429, label: -1 });
    expect(result.valid).toBe(false);
  });

  it('rejects non-integer label', () => {
    const result = plugin.validate({ ...validArinc429, label: 10.5 });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid sdi value', () => {
    const result = plugin.validate({ ...validArinc429, sdi: '22' });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid ssm value', () => {
    const result = plugin.validate({ ...validArinc429, ssm: 'bad' });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid word_type', () => {
    const result = plugin.validate({ ...validArinc429, word_type: 'FLOAT' });
    expect(result.valid).toBe(false);
  });

  it('rejects negative resolution', () => {
    const result = plugin.validate({ ...validArinc429, resolution: -0.01 });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid bus_speed', () => {
    const result = plugin.validate({ ...validArinc429, bus_speed: 'medium' });
    expect(result.valid).toBe(false);
  });

  it('accepts boundary label values 0 and 255', () => {
    expect(plugin.validate({ ...validArinc429, label: 0 }).valid).toBe(true);
    expect(plugin.validate({ ...validArinc429, label: 255 }).valid).toBe(true);
  });

  it('accepts resolution of 0', () => {
    expect(plugin.validate({ ...validArinc429, resolution: 0 }).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CAN Bus Plugin
// ---------------------------------------------------------------------------

describe('CanBusPlugin', () => {
  const plugin = new CanBusPlugin();

  it('accepts valid CAN Bus attributes', () => {
    expect(plugin.validate(validCanBus).valid).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = plugin.validate({});
    expect(result.valid).toBe(false);
    const fields = result.errors.map((e) => e.field);
    expect(fields).toContain('arbitration_id');
    expect(fields).toContain('id_format');
    expect(fields).toContain('dlc');
    expect(fields).toContain('cycle_time_ms');
    expect(fields).toContain('start_bit');
    expect(fields).toContain('signal_length');
  });

  it('rejects non-hex arbitration_id', () => {
    const result = plugin.validate({ ...validCanBus, arbitration_id: 'ZZZZ' });
    expect(result.valid).toBe(false);
  });

  it('rejects standard_11bit id exceeding 0x7FF', () => {
    const result = plugin.validate({
      ...validCanBus,
      arbitration_id: '0x800',
      id_format: 'standard_11bit',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'arbitration_id')).toBe(true);
  });

  it('accepts standard_11bit id at max 0x7FF', () => {
    const result = plugin.validate({
      ...validCanBus,
      arbitration_id: '0x7FF',
      id_format: 'standard_11bit',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects dlc > 8', () => {
    const result = plugin.validate({ ...validCanBus, dlc: 9 });
    expect(result.valid).toBe(false);
  });

  it('rejects cycle_time_ms <= 0', () => {
    const result = plugin.validate({ ...validCanBus, cycle_time_ms: 0 });
    expect(result.valid).toBe(false);
    const result2 = plugin.validate({ ...validCanBus, cycle_time_ms: -5 });
    expect(result2.valid).toBe(false);
  });

  it('rejects signal that overflows DLC capacity', () => {
    const result = plugin.validate({
      ...validCanBus,
      dlc: 2,
      start_bit: 8,
      signal_length: 16,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('DLC capacity'))).toBe(true);
  });

  it('accepts signal fitting exactly within DLC', () => {
    const result = plugin.validate({
      ...validCanBus,
      dlc: 2,
      start_bit: 0,
      signal_length: 16,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects signal_length of 0', () => {
    const result = plugin.validate({ ...validCanBus, signal_length: 0 });
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MIL-STD-1553 Plugin
// ---------------------------------------------------------------------------

describe('MilStd1553Plugin', () => {
  const plugin = new MilStd1553Plugin();

  it('accepts valid MIL-STD-1553 attributes', () => {
    expect(plugin.validate(validMilStd1553).valid).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = plugin.validate({});
    expect(result.valid).toBe(false);
    const fields = result.errors.map((e) => e.field);
    expect(fields).toContain('remote_terminal');
    expect(fields).toContain('sub_address');
    expect(fields).toContain('word_count');
    expect(fields).toContain('direction');
    expect(fields).toContain('message_type');
    expect(fields).toContain('minor_frame_rate_hz');
  });

  it('rejects remote_terminal > 30', () => {
    const result = plugin.validate({ ...validMilStd1553, remote_terminal: 31 });
    expect(result.valid).toBe(false);
  });

  it('accepts remote_terminal boundary values 0 and 30', () => {
    expect(plugin.validate({ ...validMilStd1553, remote_terminal: 0 }).valid).toBe(true);
    expect(plugin.validate({ ...validMilStd1553, remote_terminal: 30 }).valid).toBe(true);
  });

  it('rejects sub_address > 31', () => {
    const result = plugin.validate({ ...validMilStd1553, sub_address: 32 });
    expect(result.valid).toBe(false);
  });

  it('rejects word_count < 1 or > 32', () => {
    expect(plugin.validate({ ...validMilStd1553, word_count: 0 }).valid).toBe(false);
    expect(plugin.validate({ ...validMilStd1553, word_count: 33 }).valid).toBe(false);
  });

  it('accepts word_count boundary values 1 and 32', () => {
    expect(plugin.validate({ ...validMilStd1553, word_count: 1 }).valid).toBe(true);
    expect(plugin.validate({ ...validMilStd1553, word_count: 32 }).valid).toBe(true);
  });

  it('rejects invalid direction', () => {
    const result = plugin.validate({ ...validMilStd1553, direction: 'BC_to_BC' });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid message_type', () => {
    const result = plugin.validate({ ...validMilStd1553, message_type: 'burst' });
    expect(result.valid).toBe(false);
  });

  it('rejects minor_frame_rate_hz <= 0', () => {
    expect(plugin.validate({ ...validMilStd1553, minor_frame_rate_hz: 0 }).valid).toBe(false);
    expect(plugin.validate({ ...validMilStd1553, minor_frame_rate_hz: -10 }).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ARINC 664 Plugin
// ---------------------------------------------------------------------------

describe('Arinc664Plugin', () => {
  const plugin = new Arinc664Plugin();

  it('accepts valid ARINC 664 attributes', () => {
    expect(plugin.validate(validArinc664).valid).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = plugin.validate({});
    expect(result.valid).toBe(false);
    const fields = result.errors.map((e) => e.field);
    expect(fields).toContain('virtual_link_id');
    expect(fields).toContain('bag_ms');
    expect(fields).toContain('max_frame_size');
    expect(fields).toContain('partition_id');
    expect(fields).toContain('sub_virtual_link');
    expect(fields).toContain('network');
  });

  it('rejects virtual_link_id < 1 or > 65535', () => {
    expect(plugin.validate({ ...validArinc664, virtual_link_id: 0 }).valid).toBe(false);
    expect(plugin.validate({ ...validArinc664, virtual_link_id: 65536 }).valid).toBe(false);
  });

  it('accepts virtual_link_id boundary values 1 and 65535', () => {
    expect(plugin.validate({ ...validArinc664, virtual_link_id: 1 }).valid).toBe(true);
    expect(plugin.validate({ ...validArinc664, virtual_link_id: 65535 }).valid).toBe(true);
  });

  it('rejects bag_ms <= 0', () => {
    expect(plugin.validate({ ...validArinc664, bag_ms: 0 }).valid).toBe(false);
    expect(plugin.validate({ ...validArinc664, bag_ms: -1 }).valid).toBe(false);
  });

  it('rejects max_frame_size outside 64–1518', () => {
    expect(plugin.validate({ ...validArinc664, max_frame_size: 63 }).valid).toBe(false);
    expect(plugin.validate({ ...validArinc664, max_frame_size: 1519 }).valid).toBe(false);
  });

  it('accepts max_frame_size boundary values 64 and 1518', () => {
    expect(plugin.validate({ ...validArinc664, max_frame_size: 64 }).valid).toBe(true);
    expect(plugin.validate({ ...validArinc664, max_frame_size: 1518 }).valid).toBe(true);
  });

  it('rejects empty partition_id', () => {
    expect(plugin.validate({ ...validArinc664, partition_id: '' }).valid).toBe(false);
    expect(plugin.validate({ ...validArinc664, partition_id: '   ' }).valid).toBe(false);
  });

  it('rejects sub_virtual_link outside 0–255', () => {
    expect(plugin.validate({ ...validArinc664, sub_virtual_link: -1 }).valid).toBe(false);
    expect(plugin.validate({ ...validArinc664, sub_virtual_link: 256 }).valid).toBe(false);
  });

  it('rejects invalid network', () => {
    expect(plugin.validate({ ...validArinc664, network: 'C' }).valid).toBe(false);
  });

  it('accepts both network values A and B', () => {
    expect(plugin.validate({ ...validArinc664, network: 'A' }).valid).toBe(true);
    expect(plugin.validate({ ...validArinc664, network: 'B' }).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Protocol Migration
// ---------------------------------------------------------------------------

describe('ProtocolValidationService.migrateProtocol', () => {
  const svc = new ProtocolValidationService();

  it('preserves all attributes when migrating to the same protocol', () => {
    const result = svc.migrateProtocol('canbus', validCanBus, 'canbus');
    expect(result.preserved).toEqual(Object.keys(validCanBus));
    expect(result.cleared).toEqual([]);
    expect(result.needsReview).toEqual([]);
    expect(result.targetAttrs).toEqual(validCanBus);
  });

  it('returns cleared source keys for unknown target protocol', () => {
    const result = svc.migrateProtocol('canbus', validCanBus, 'unknown_proto');
    expect(result.cleared).toEqual(Object.keys(validCanBus));
    expect(result.preserved).toEqual([]);
    expect(result.targetAttrs).toEqual({});
  });

  it('returns cleared source keys and target schema fields for review when source is unknown', () => {
    const result = svc.migrateProtocol('unknown_proto', { x: 1 }, 'canbus');
    expect(result.cleared).toContain('x');
    expect(result.needsReview.length).toBeGreaterThan(0);
  });

  it('reports all source fields as cleared and all target fields as needsReview for incompatible protocols (ARINC 429 → CAN)', () => {
    const result = svc.migrateProtocol('arinc429', validArinc429, 'canbus');
    // All ARINC 429 fields should be cleared (no direct mapping)
    expect(result.cleared.length).toBe(Object.keys(validArinc429).length);
    // All CAN fields need manual configuration
    expect(result.needsReview.length).toBeGreaterThan(0);
    expect(result.targetAttrs).toEqual({});
  });

  it('union of preserved, cleared, needsReview covers all source and target fields', () => {
    const result = svc.migrateProtocol('canbus', validCanBus, 'milstd1553');
    const allSourceKeys = Object.keys(validCanBus);
    const allTargetSchemaKeys = Object.keys(svc.getFieldSchema('milstd1553')!);

    // Every source key should appear in either preserved (as a target field) or cleared
    for (const key of allSourceKeys) {
      const inCleared = result.cleared.includes(key);
      // A source key might have been converted to a target key (preserved)
      expect(inCleared || result.preserved.length > 0 || result.needsReview.length > 0).toBe(true);
    }

    // Every target schema field should appear in preserved, needsReview, or have a value in targetAttrs
    for (const key of allTargetSchemaKeys) {
      const covered =
        result.preserved.includes(key) ||
        result.needsReview.includes(key) ||
        key in result.targetAttrs;
      expect(covered).toBe(true);
    }
  });
});

describe('CAN Bus → MIL-STD-1553 migration', () => {
  const svc = new ProtocolValidationService();

  it('converts cycle_time_ms to minor_frame_rate_hz', () => {
    const result = svc.migrateProtocol('canbus', validCanBus, 'milstd1553');
    expect(result.preserved).toContain('minor_frame_rate_hz');
    expect(result.targetAttrs.minor_frame_rate_hz).toBeCloseTo(1000 / 100); // 100ms → 10 Hz
  });

  it('converts dlc to word_count', () => {
    const result = svc.migrateProtocol('canbus', validCanBus, 'milstd1553');
    expect(result.preserved).toContain('word_count');
    // 8 bytes / 2 = 4 words
    expect(result.targetAttrs.word_count).toBe(4);
  });

  it('clears CAN-specific addressing fields', () => {
    const result = svc.migrateProtocol('canbus', validCanBus, 'milstd1553');
    expect(result.cleared).toContain('arbitration_id');
    expect(result.cleared).toContain('id_format');
    expect(result.cleared).toContain('start_bit');
    expect(result.cleared).toContain('signal_length');
  });

  it('flags 1553-specific addressing fields for review', () => {
    const result = svc.migrateProtocol('canbus', validCanBus, 'milstd1553');
    expect(result.needsReview).toContain('remote_terminal');
    expect(result.needsReview).toContain('sub_address');
    expect(result.needsReview).toContain('direction');
    expect(result.needsReview).toContain('message_type');
  });
});

describe('MIL-STD-1553 → CAN Bus migration', () => {
  const svc = new ProtocolValidationService();

  it('converts minor_frame_rate_hz to cycle_time_ms', () => {
    const result = svc.migrateProtocol('milstd1553', validMilStd1553, 'canbus');
    expect(result.preserved).toContain('cycle_time_ms');
    expect(result.targetAttrs.cycle_time_ms).toBeCloseTo(1000 / 80); // 80 Hz → 12.5ms
  });

  it('converts word_count to dlc when within CAN capacity', () => {
    const result = svc.migrateProtocol('milstd1553', validMilStd1553, 'canbus');
    // 4 words × 2 bytes = 8 bytes, fits in CAN DLC
    expect(result.preserved).toContain('dlc');
    expect(result.targetAttrs.dlc).toBe(8);
  });

  it('flags dlc for review when word_count exceeds CAN capacity', () => {
    const largeMsg = { ...validMilStd1553, word_count: 16 }; // 32 bytes > 8
    const result = svc.migrateProtocol('milstd1553', largeMsg, 'canbus');
    expect(result.needsReview).toContain('dlc');
    expect(result.preserved).not.toContain('dlc');
  });
});

describe('CAN Bus → ARINC 664 migration', () => {
  const svc = new ProtocolValidationService();

  it('converts cycle_time_ms to bag_ms', () => {
    const result = svc.migrateProtocol('canbus', validCanBus, 'arinc664');
    expect(result.preserved).toContain('bag_ms');
    expect(result.targetAttrs.bag_ms).toBe(100);
  });

  it('clears CAN-specific fields', () => {
    const result = svc.migrateProtocol('canbus', validCanBus, 'arinc664');
    expect(result.cleared).toContain('arbitration_id');
    expect(result.cleared).toContain('id_format');
    expect(result.cleared).toContain('start_bit');
    expect(result.cleared).toContain('signal_length');
    expect(result.cleared).toContain('dlc');
  });
});

describe('MIL-STD-1553 → ARINC 664 migration', () => {
  const svc = new ProtocolValidationService();

  it('converts minor_frame_rate_hz to bag_ms', () => {
    const result = svc.migrateProtocol('milstd1553', validMilStd1553, 'arinc664');
    expect(result.preserved).toContain('bag_ms');
    expect(result.targetAttrs.bag_ms).toBeCloseTo(1000 / 80); // 80 Hz → 12.5ms
  });

  it('clears 1553-specific fields', () => {
    const result = svc.migrateProtocol('milstd1553', validMilStd1553, 'arinc664');
    expect(result.cleared).toContain('remote_terminal');
    expect(result.cleared).toContain('sub_address');
    expect(result.cleared).toContain('direction');
    expect(result.cleared).toContain('message_type');
  });
});

describe('ARINC 664 → CAN Bus migration', () => {
  const svc = new ProtocolValidationService();

  it('converts bag_ms to cycle_time_ms', () => {
    const result = svc.migrateProtocol('arinc664', validArinc664, 'canbus');
    expect(result.preserved).toContain('cycle_time_ms');
    expect(result.targetAttrs.cycle_time_ms).toBe(32);
  });

  it('clears ARINC 664-specific fields', () => {
    const result = svc.migrateProtocol('arinc664', validArinc664, 'canbus');
    expect(result.cleared).toContain('virtual_link_id');
    expect(result.cleared).toContain('partition_id');
    expect(result.cleared).toContain('sub_virtual_link');
    expect(result.cleared).toContain('network');
  });
});

describe('ARINC 429 → ARINC 664 migration', () => {
  const svc = new ProtocolValidationService();

  it('clears all ARINC 429 fields (incompatible architectures)', () => {
    const result = svc.migrateProtocol('arinc429', validArinc429, 'arinc664');
    expect(result.cleared.length).toBe(Object.keys(validArinc429).length);
    expect(result.preserved).toEqual([]);
  });

  it('flags all ARINC 664 fields for review', () => {
    const result = svc.migrateProtocol('arinc429', validArinc429, 'arinc664');
    expect(result.needsReview).toContain('virtual_link_id');
    expect(result.needsReview).toContain('bag_ms');
    expect(result.needsReview).toContain('max_frame_size');
    expect(result.needsReview).toContain('partition_id');
    expect(result.needsReview).toContain('sub_virtual_link');
    expect(result.needsReview).toContain('network');
  });
});
