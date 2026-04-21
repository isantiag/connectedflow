/**
 * Unit tests for CrossLayerValidator.
 *
 * Tests cross-layer consistency validation between logical, transport,
 * and physical layers of ICD signals.
 */

import { describe, it, expect } from 'vitest';
import { CrossLayerValidator } from './cross-layer-validator.js';
import type {
  Signal,
  SignalId,
  ProjectId,
  UserId,
  ProtocolId,
  BusId,
  ConnectorId,
  CableBundleId,
  LogicalLayer,
  TransportLayer,
  PhysicalLayer,
} from '@connectedicd/shared-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignal(overrides?: {
  logical?: Partial<LogicalLayer>;
  transport?: Partial<TransportLayer>;
  physical?: Partial<PhysicalLayer>;
}): Signal {
  return {
    id: 'sig-1' as SignalId,
    name: 'TEST_SIGNAL',
    projectId: 'proj-1' as ProjectId,
    status: 'draft',
    criticality: 'major',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1' as UserId,
    updatedBy: 'user-1' as UserId,
    version: 1,
    logical: {
      id: 'log-1',
      signalId: 'sig-1' as SignalId,
      dataType: 'float32',
      minValue: 0,
      maxValue: 500,
      units: 'knots',
      description: 'Test signal',
      sourceSystem: 'ADC',
      destSystem: 'PFD',
      refreshRateHz: 50,
      functionalCategory: 'air_data',
      ...overrides?.logical,
    },
    transport: {
      id: 'trn-1',
      signalId: 'sig-1' as SignalId,
      protocolId: 'arinc429' as ProtocolId,
      busId: 'bus-1' as BusId,
      protocolAttrs: { label: 205, sdi: '00', ssm: 'normal', word_type: 'BNR', resolution: 0.005, bus_speed: 'high' },
      bitOffset: 0,
      bitLength: 16,
      encoding: 'unsigned',
      scaleFactor: 0.1,
      offsetValue: 0,
      byteOrder: 'big_endian',
      ...overrides?.transport,
    },
    physical: {
      id: 'phy-1',
      signalId: 'sig-1' as SignalId,
      connectorId: 'conn-1' as ConnectorId,
      pinNumber: 'A1',
      cableBundleId: 'cable-1' as CableBundleId,
      wireGauge: '22AWG',
      wireColor: 'white',
      wireType: 'shielded',
      maxLengthM: 15,
      shielding: 'braided',
      ...overrides?.physical,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CrossLayerValidator', () => {
  const validator = new CrossLayerValidator();

  // -----------------------------------------------------------------------
  // Consistent signals — no errors
  // -----------------------------------------------------------------------

  describe('consistent signals', () => {
    it('returns valid for a fully consistent ARINC 429 signal', () => {
      // unsigned 16-bit, scale 0.1, offset 0 → range [0, 6553.5]
      // logical range [0, 500] fits within that
      // 22AWG supports 10 Mbps, ARINC 429 is 100 kbps — fine
      // bitOffset 0 + bitLength 16 = 16 ≤ 32 (ARINC 429 word) — fine
      const signal = makeSignal();
      const result = validator.validate(signal);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid for a consistent CAN bus signal', () => {
      const signal = makeSignal({
        logical: { minValue: 0, maxValue: 100, refreshRateHz: 10 },
        transport: {
          protocolId: 'canbus' as ProtocolId,
          bitOffset: 0,
          bitLength: 16,
          encoding: 'unsigned',
          scaleFactor: 0.01,
          offsetValue: 0,
          protocolAttrs: {
            arbitration_id: '0x100',
            id_format: 'standard_11bit',
            dlc: 8,
            cycle_time_ms: 100,
            start_bit: 0,
            signal_length: 16,
          },
        },
        physical: { wireGauge: '20AWG' },
      });
      const result = validator.validate(signal);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid for a consistent MIL-STD-1553 signal', () => {
      const signal = makeSignal({
        logical: { minValue: -100, maxValue: 100, refreshRateHz: 40 },
        transport: {
          protocolId: 'milstd1553' as ProtocolId,
          bitOffset: 0,
          bitLength: 16,
          encoding: 'signed',
          scaleFactor: 0.01,
          offsetValue: 0,
          protocolAttrs: {
            remote_terminal: 5,
            sub_address: 3,
            word_count: 4,
            direction: 'RT_to_BC',
            message_type: 'periodic',
            minor_frame_rate_hz: 80,
          },
        },
        physical: { wireGauge: '20AWG' },
      });
      const result = validator.validate(signal);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Rule 1: Logical range vs transport encoding capacity
  // -----------------------------------------------------------------------

  describe('logical range vs transport encoding capacity', () => {
    it('detects when logical max exceeds transport capacity', () => {
      // unsigned 8-bit, scale 1, offset 0 → max representable = 255
      // logical max = 500 → exceeds capacity
      const signal = makeSignal({
        logical: { minValue: 0, maxValue: 500 },
        transport: { bitLength: 8, encoding: 'unsigned', scaleFactor: 1, offsetValue: 0 },
      });
      const result = validator.validate(signal);

      expect(result.valid).toBe(false);
      const rangeError = result.errors.find(e => e.field === 'logical.maxValue');
      expect(rangeError).toBeDefined();
      expect(rangeError!.constraint).toBe('logical_range_within_transport_capacity');
      expect(rangeError!.severity).toBe('error');
    });

    it('detects when logical min is below transport capacity for unsigned', () => {
      // unsigned 8-bit, scale 1, offset 0 → min representable = 0
      // logical min = -10 → below capacity
      const signal = makeSignal({
        logical: { minValue: -10, maxValue: 200 },
        transport: { bitLength: 8, encoding: 'unsigned', scaleFactor: 1, offsetValue: 0 },
      });
      const result = validator.validate(signal);

      expect(result.valid).toBe(false);
      const rangeError = result.errors.find(e => e.field === 'logical.minValue');
      expect(rangeError).toBeDefined();
      expect(rangeError!.constraint).toBe('logical_range_within_transport_capacity');
    });

    it('handles signed encoding correctly', () => {
      // signed 8-bit, scale 1, offset 0 → range [-128, 127]
      // logical range [-100, 100] fits
      const signal = makeSignal({
        logical: { minValue: -100, maxValue: 100 },
        transport: { bitLength: 8, encoding: 'signed', scaleFactor: 1, offsetValue: 0 },
      });
      const result = validator.validate(signal);

      const rangeErrors = result.errors.filter(e =>
        e.constraint === 'logical_range_within_transport_capacity',
      );
      expect(rangeErrors).toHaveLength(0);
    });

    it('accounts for scale factor in capacity calculation', () => {
      // unsigned 16-bit, scale 0.1, offset 0 → max = 65535 * 0.1 = 6553.5
      // logical max = 6000 → fits
      const signal = makeSignal({
        logical: { minValue: 0, maxValue: 6000 },
        transport: { bitLength: 16, encoding: 'unsigned', scaleFactor: 0.1, offsetValue: 0 },
      });
      const result = validator.validate(signal);

      const rangeErrors = result.errors.filter(e =>
        e.constraint === 'logical_range_within_transport_capacity',
      );
      expect(rangeErrors).toHaveLength(0);
    });

    it('accounts for offset value in capacity calculation', () => {
      // unsigned 8-bit, scale 1, offset 100 → range [100, 355]
      // logical range [150, 300] → fits
      const signal = makeSignal({
        logical: { minValue: 150, maxValue: 300 },
        transport: { bitLength: 8, encoding: 'unsigned', scaleFactor: 1, offsetValue: 100 },
      });
      const result = validator.validate(signal);

      const rangeErrors = result.errors.filter(e =>
        e.constraint === 'logical_range_within_transport_capacity',
      );
      expect(rangeErrors).toHaveLength(0);
    });

    it('skips validation when logical range is null', () => {
      const signal = makeSignal({
        logical: { minValue: null, maxValue: null },
      });
      const result = validator.validate(signal);

      const rangeErrors = result.errors.filter(e =>
        e.constraint === 'logical_range_within_transport_capacity',
      );
      expect(rangeErrors).toHaveLength(0);
    });

    it('detects BCD encoding overflow', () => {
      // BCD 8-bit → 2 digits → max 99
      // logical max = 150 → exceeds
      const signal = makeSignal({
        logical: { minValue: 0, maxValue: 150 },
        transport: { bitLength: 8, encoding: 'bcd', scaleFactor: 1, offsetValue: 0 },
      });
      const result = validator.validate(signal);

      expect(result.valid).toBe(false);
      const rangeError = result.errors.find(e => e.field === 'logical.maxValue');
      expect(rangeError).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Rule 2: Wire gauge vs data rate
  // -----------------------------------------------------------------------

  describe('wire gauge vs data rate', () => {
    it('detects thin wire gauge on high-speed ARINC 664', () => {
      // 26AWG max = 100 kbps, ARINC 664 = 100 Mbps → incompatible
      const signal = makeSignal({
        transport: { protocolId: 'arinc664' as ProtocolId, bitOffset: 0, bitLength: 16 },
        physical: { wireGauge: '26AWG' },
      });
      const result = validator.validate(signal);

      expect(result.valid).toBe(false);
      const wireError = result.errors.find(e => e.field === 'physical.wireGauge');
      expect(wireError).toBeDefined();
      expect(wireError!.constraint).toBe('wire_gauge_supports_data_rate');
      expect(wireError!.severity).toBe('error');
    });

    it('accepts adequate wire gauge for ARINC 429', () => {
      // 22AWG max = 10 Mbps, ARINC 429 = 100 kbps → fine
      const signal = makeSignal({
        transport: { protocolId: 'arinc429' as ProtocolId },
        physical: { wireGauge: '22AWG' },
      });
      const result = validator.validate(signal);

      const wireErrors = result.errors.filter(e =>
        e.constraint === 'wire_gauge_supports_data_rate',
      );
      expect(wireErrors).toHaveLength(0);
    });

    it('detects 26AWG on CAN bus (1 Mbps)', () => {
      // 26AWG max = 100 kbps, CAN = 1 Mbps → incompatible
      const signal = makeSignal({
        transport: {
          protocolId: 'canbus' as ProtocolId,
          bitOffset: 0,
          bitLength: 16,
          protocolAttrs: { arbitration_id: '0x100', id_format: 'standard_11bit', dlc: 8, cycle_time_ms: 100, start_bit: 0, signal_length: 16 },
        },
        physical: { wireGauge: '26AWG' },
      });
      const result = validator.validate(signal);

      const wireErrors = result.errors.filter(e =>
        e.constraint === 'wire_gauge_supports_data_rate',
      );
      expect(wireErrors).toHaveLength(1);
    });

    it('skips validation for unknown wire gauge', () => {
      const signal = makeSignal({
        physical: { wireGauge: 'custom-gauge' },
      });
      const result = validator.validate(signal);

      const wireErrors = result.errors.filter(e =>
        e.constraint === 'wire_gauge_supports_data_rate',
      );
      expect(wireErrors).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Rule 3: Bit offset + bit length vs protocol word size
  // -----------------------------------------------------------------------

  describe('bit layout vs protocol word size', () => {
    it('detects bit overflow on ARINC 429 (32-bit word)', () => {
      // bitOffset 20 + bitLength 16 = 36 > 32
      const signal = makeSignal({
        transport: {
          protocolId: 'arinc429' as ProtocolId,
          bitOffset: 20,
          bitLength: 16,
        },
      });
      const result = validator.validate(signal);

      expect(result.valid).toBe(false);
      const bitError = result.errors.find(e => e.field === 'transport.bitOffset');
      expect(bitError).toBeDefined();
      expect(bitError!.constraint).toBe('bit_layout_within_protocol_word');
    });

    it('accepts valid bit layout on ARINC 429', () => {
      // bitOffset 8 + bitLength 16 = 24 ≤ 32
      const signal = makeSignal({
        transport: {
          protocolId: 'arinc429' as ProtocolId,
          bitOffset: 8,
          bitLength: 16,
        },
      });
      const result = validator.validate(signal);

      const bitErrors = result.errors.filter(e =>
        e.constraint === 'bit_layout_within_protocol_word',
      );
      expect(bitErrors).toHaveLength(0);
    });

    it('detects bit overflow on CAN bus (64-bit)', () => {
      // bitOffset 50 + bitLength 16 = 66 > 64
      const signal = makeSignal({
        transport: {
          protocolId: 'canbus' as ProtocolId,
          bitOffset: 50,
          bitLength: 16,
          protocolAttrs: { arbitration_id: '0x100', id_format: 'standard_11bit', dlc: 8, cycle_time_ms: 100, start_bit: 0, signal_length: 16 },
        },
      });
      const result = validator.validate(signal);

      const bitErrors = result.errors.filter(e =>
        e.constraint === 'bit_layout_within_protocol_word',
      );
      expect(bitErrors).toHaveLength(1);
    });

    it('uses word_count for MIL-STD-1553 word size', () => {
      // word_count=2 → 32 bits total; bitOffset 20 + bitLength 16 = 36 > 32
      const signal = makeSignal({
        transport: {
          protocolId: 'milstd1553' as ProtocolId,
          bitOffset: 20,
          bitLength: 16,
          protocolAttrs: {
            remote_terminal: 5,
            sub_address: 3,
            word_count: 2,
            direction: 'RT_to_BC',
            message_type: 'periodic',
            minor_frame_rate_hz: 80,
          },
        },
      });
      const result = validator.validate(signal);

      const bitErrors = result.errors.filter(e =>
        e.constraint === 'bit_layout_within_protocol_word',
      );
      expect(bitErrors).toHaveLength(1);
    });

    it('accepts valid MIL-STD-1553 layout with sufficient word_count', () => {
      // word_count=4 → 64 bits total; bitOffset 20 + bitLength 16 = 36 ≤ 64
      const signal = makeSignal({
        transport: {
          protocolId: 'milstd1553' as ProtocolId,
          bitOffset: 20,
          bitLength: 16,
          protocolAttrs: {
            remote_terminal: 5,
            sub_address: 3,
            word_count: 4,
            direction: 'RT_to_BC',
            message_type: 'periodic',
            minor_frame_rate_hz: 80,
          },
        },
      });
      const result = validator.validate(signal);

      const bitErrors = result.errors.filter(e =>
        e.constraint === 'bit_layout_within_protocol_word',
      );
      expect(bitErrors).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Rule 4: Refresh rate vs transport timing
  // -----------------------------------------------------------------------

  describe('refresh rate vs transport timing', () => {
    it('warns when logical refresh rate exceeds CAN cycle rate', () => {
      // cycle_time_ms=100 → 10 Hz; logical refreshRateHz=50 → exceeds
      const signal = makeSignal({
        logical: { refreshRateHz: 50 },
        transport: {
          protocolId: 'canbus' as ProtocolId,
          bitOffset: 0,
          bitLength: 16,
          protocolAttrs: {
            arbitration_id: '0x100',
            id_format: 'standard_11bit',
            dlc: 8,
            cycle_time_ms: 100,
            start_bit: 0,
            signal_length: 16,
          },
        },
      });
      const result = validator.validate(signal);

      const timingErrors = result.errors.filter(e =>
        e.constraint === 'refresh_rate_within_transport_timing',
      );
      expect(timingErrors).toHaveLength(1);
      expect(timingErrors[0]!.severity).toBe('warning');
    });

    it('accepts matching CAN refresh rate', () => {
      // cycle_time_ms=20 → 50 Hz; logical refreshRateHz=50 → matches
      const signal = makeSignal({
        logical: { refreshRateHz: 50 },
        transport: {
          protocolId: 'canbus' as ProtocolId,
          bitOffset: 0,
          bitLength: 16,
          protocolAttrs: {
            arbitration_id: '0x100',
            id_format: 'standard_11bit',
            dlc: 8,
            cycle_time_ms: 20,
            start_bit: 0,
            signal_length: 16,
          },
        },
      });
      const result = validator.validate(signal);

      const timingErrors = result.errors.filter(e =>
        e.constraint === 'refresh_rate_within_transport_timing',
      );
      expect(timingErrors).toHaveLength(0);
    });

    it('warns when logical refresh rate exceeds 1553 minor frame rate', () => {
      // minor_frame_rate_hz=40; logical refreshRateHz=80 → exceeds
      const signal = makeSignal({
        logical: { refreshRateHz: 80 },
        transport: {
          protocolId: 'milstd1553' as ProtocolId,
          bitOffset: 0,
          bitLength: 16,
          protocolAttrs: {
            remote_terminal: 5,
            sub_address: 3,
            word_count: 4,
            direction: 'RT_to_BC',
            message_type: 'periodic',
            minor_frame_rate_hz: 40,
          },
        },
      });
      const result = validator.validate(signal);

      const timingErrors = result.errors.filter(e =>
        e.constraint === 'refresh_rate_within_transport_timing',
      );
      expect(timingErrors).toHaveLength(1);
      expect(timingErrors[0]!.severity).toBe('warning');
    });

    it('accepts matching 1553 refresh rate', () => {
      // minor_frame_rate_hz=80; logical refreshRateHz=80 → matches
      const signal = makeSignal({
        logical: { refreshRateHz: 80 },
        transport: {
          protocolId: 'milstd1553' as ProtocolId,
          bitOffset: 0,
          bitLength: 16,
          protocolAttrs: {
            remote_terminal: 5,
            sub_address: 3,
            word_count: 4,
            direction: 'RT_to_BC',
            message_type: 'periodic',
            minor_frame_rate_hz: 80,
          },
        },
      });
      const result = validator.validate(signal);

      const timingErrors = result.errors.filter(e =>
        e.constraint === 'refresh_rate_within_transport_timing',
      );
      expect(timingErrors).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple errors
  // -----------------------------------------------------------------------

  describe('multiple errors', () => {
    it('reports all conflicts for a signal with multiple issues', () => {
      // 26AWG on ARINC 664 (wire gauge issue)
      // bitOffset 12000 + bitLength 200 > 12144 (bit layout issue)
      // logical max 70000 with unsigned 16-bit scale 1 offset 0 → max 65535 (range issue)
      const signal = makeSignal({
        logical: { minValue: 0, maxValue: 70000 },
        transport: {
          protocolId: 'arinc664' as ProtocolId,
          bitOffset: 12000,
          bitLength: 200,
          encoding: 'unsigned',
          scaleFactor: 1,
          offsetValue: 0,
          protocolAttrs: {
            virtual_link_id: 1024,
            bag_ms: 32,
            max_frame_size: 1518,
            partition_id: 'PART_NAV_01',
            sub_virtual_link: 1,
            network: 'A',
          },
        },
        physical: { wireGauge: '26AWG' },
      });
      const result = validator.validate(signal);

      expect(result.valid).toBe(false);
      // Should have at least wire gauge, bit layout, and range errors
      expect(result.errors.length).toBeGreaterThanOrEqual(3);

      const constraints = result.errors.map(e => e.constraint);
      expect(constraints).toContain('wire_gauge_supports_data_rate');
      expect(constraints).toContain('bit_layout_within_protocol_word');
      expect(constraints).toContain('logical_range_within_transport_capacity');
    });
  });

  // -----------------------------------------------------------------------
  // Missing layers
  // -----------------------------------------------------------------------

  describe('missing layers', () => {
    it('returns valid when logical layer is missing', () => {
      const signal = makeSignal();
      signal.logical = undefined;
      const result = validator.validate(signal);

      // Only bit layout check applies (transport-only)
      const rangeErrors = result.errors.filter(e =>
        e.constraint === 'logical_range_within_transport_capacity',
      );
      expect(rangeErrors).toHaveLength(0);
    });

    it('returns valid when transport layer is missing', () => {
      const signal = makeSignal();
      signal.transport = undefined;
      const result = validator.validate(signal);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid when physical layer is missing', () => {
      const signal = makeSignal();
      signal.physical = undefined;
      const result = validator.validate(signal);

      // Wire gauge check skipped, other checks still apply
      const wireErrors = result.errors.filter(e =>
        e.constraint === 'wire_gauge_supports_data_rate',
      );
      expect(wireErrors).toHaveLength(0);
    });
  });
});
