import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  arbSignal,
  arbLogicalLayer,
  arbTransportLayer,
  arbPhysicalLayer,
  arbProtocolId,
  arbBusData,
  arbExtractionResult,
  arbBaseline,
  arbChangeRequest,
  arbArinc429Attrs,
  arbCanBusAttrs,
  arbMilStd1553Attrs,
  arbArinc664Attrs,
  arbProtocolAttrs,
} from './arbitraries.js';

describe('fast-check arbitraries', () => {
  it('arbSignal produces valid three-layer signals', () => {
    fc.assert(
      fc.property(arbSignal(), (signal) => {
        expect(signal.id).toBeDefined();
        expect(signal.name.length).toBeGreaterThanOrEqual(3);
        expect(signal.logical).toBeDefined();
        expect(signal.transport).toBeDefined();
        expect(signal.physical).toBeDefined();
        expect(signal.version).toBeGreaterThanOrEqual(1);
        expect(['draft', 'active', 'deprecated', 'archived']).toContain(signal.status);
        expect(['critical', 'major', 'minor', 'info']).toContain(signal.criticality);
      }),
      { numRuns: 50 },
    );
  });

  it('arbLogicalLayer produces valid logical layers', () => {
    fc.assert(
      fc.property(arbLogicalLayer(), (layer) => {
        expect(layer.id).toBeDefined();
        expect(layer.signalId).toBeDefined();
        expect(layer.refreshRateHz).toBeGreaterThan(0);
        expect(layer.units.length).toBeGreaterThan(0);
      }),
      { numRuns: 50 },
    );
  });

  it('arbTransportLayer produces valid transport layers for each protocol', () => {
    const protocols = ['arinc429', 'canbus', 'milstd1553', 'arinc664'] as const;
    for (const proto of protocols) {
      fc.assert(
        fc.property(arbTransportLayer(proto), (layer) => {
          expect(layer.protocolId).toBe(proto);
          expect(layer.bitLength).toBeGreaterThanOrEqual(1);
          expect(layer.bitOffset).toBeGreaterThanOrEqual(0);
          expect(layer.protocolAttrs).toBeDefined();
          expect(['unsigned', 'signed', 'ieee754', 'bcd']).toContain(layer.encoding);
        }),
        { numRuns: 30 },
      );
    }
  });

  it('arbPhysicalLayer produces valid physical layers', () => {
    fc.assert(
      fc.property(arbPhysicalLayer(), (layer) => {
        expect(layer.id).toBeDefined();
        expect(layer.pinNumber).toMatch(/^\d+$/);
        expect(layer.wireGauge).toMatch(/AWG/);
        expect(layer.maxLengthM).toBeGreaterThan(0);
        expect(['shielded', 'unshielded', 'twisted_pair', 'coaxial', 'fiber_optic']).toContain(layer.wireType);
      }),
      { numRuns: 50 },
    );
  });

  it('arbProtocolId produces known protocol identifiers', () => {
    fc.assert(
      fc.property(arbProtocolId(), (id) => {
        expect(['arinc429', 'canbus', 'milstd1553', 'arinc664']).toContain(id);
      }),
      { numRuns: 20 },
    );
  });

  it('arbArinc429Attrs produces valid ARINC 429 attributes', () => {
    fc.assert(
      fc.property(arbArinc429Attrs(), (attrs) => {
        expect(attrs.label).toBeGreaterThanOrEqual(0);
        expect(attrs.label).toBeLessThanOrEqual(377);
        expect(['00', '01', '10', '11']).toContain(attrs.sdi);
        expect(['BNR', 'BCD', 'discrete']).toContain(attrs.word_type);
        expect(['high', 'low']).toContain(attrs.bus_speed);
      }),
      { numRuns: 50 },
    );
  });

  it('arbCanBusAttrs produces valid CAN Bus attributes', () => {
    fc.assert(
      fc.property(arbCanBusAttrs(), (attrs) => {
        expect(attrs.arbitration_id).toMatch(/^0x[0-9A-F]+$/);
        expect(['standard_11bit', 'extended_29bit']).toContain(attrs.id_format);
        expect(attrs.dlc).toBeGreaterThanOrEqual(0);
        expect(attrs.dlc).toBeLessThanOrEqual(8);
      }),
      { numRuns: 50 },
    );
  });

  it('arbMilStd1553Attrs produces valid MIL-STD-1553 attributes', () => {
    fc.assert(
      fc.property(arbMilStd1553Attrs(), (attrs) => {
        expect(attrs.remote_terminal).toBeGreaterThanOrEqual(0);
        expect(attrs.remote_terminal).toBeLessThanOrEqual(30);
        expect(attrs.sub_address).toBeGreaterThanOrEqual(1);
        expect(attrs.sub_address).toBeLessThanOrEqual(30);
        expect(attrs.word_count).toBeGreaterThanOrEqual(1);
        expect(attrs.word_count).toBeLessThanOrEqual(32);
      }),
      { numRuns: 50 },
    );
  });

  it('arbArinc664Attrs produces valid ARINC 664 attributes', () => {
    fc.assert(
      fc.property(arbArinc664Attrs(), (attrs) => {
        expect(attrs.virtual_link_id).toBeGreaterThanOrEqual(1);
        expect(attrs.max_frame_size).toBeGreaterThanOrEqual(64);
        expect(attrs.max_frame_size).toBeLessThanOrEqual(1518);
        expect(['A', 'B']).toContain(attrs.network);
        expect(attrs.partition_id).toMatch(/^PART_[A-Z]{3}_[0-9]{2}$/);
      }),
      { numRuns: 50 },
    );
  });

  it('arbBusData produces buffer of correct size for ICD definition', () => {
    const icdDef = {
      bitOffset: 8,
      bitLength: 16,
      encoding: 'unsigned' as const,
      scaleFactor: 1.0,
      offsetValue: 0,
      byteOrder: 'big_endian' as const,
    };
    fc.assert(
      fc.property(arbBusData(icdDef), (buf) => {
        // (8 + 16) / 8 = 3 bytes
        expect(buf.length).toBe(3);
        expect(Buffer.isBuffer(buf)).toBe(true);
      }),
      { numRuns: 20 },
    );
  });

  it('arbExtractionResult produces valid extraction results', () => {
    fc.assert(
      fc.property(arbExtractionResult(5), (results) => {
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results.length).toBeLessThanOrEqual(5);
        for (const r of results) {
          expect(r.confidence).toBeGreaterThanOrEqual(0);
          expect(r.confidence).toBeLessThanOrEqual(1);
          expect(r.sourceLocation.page).toBeGreaterThanOrEqual(1);
          expect(typeof r.needsReview).toBe('boolean');
        }
      }),
      { numRuns: 30 },
    );
  });

  it('arbBaseline produces valid baselines with signals', () => {
    fc.assert(
      fc.property(arbBaseline(3), (baseline) => {
        expect(baseline.id).toBeDefined();
        expect(baseline.versionLabel).toMatch(/^v\d+\.\d+\.\d+$/);
        expect(baseline.signals.length).toBeGreaterThanOrEqual(1);
        expect(baseline.signals.length).toBeLessThanOrEqual(3);
        expect(['draft', 'approved', 'released']).toContain(baseline.status);
      }),
      { numRuns: 20 },
    );
  });

  it('arbChangeRequest produces valid change requests', () => {
    fc.assert(
      fc.property(arbChangeRequest('critical'), (cr) => {
        expect(cr.criticality).toBe('critical');
        expect(cr.id).toBeDefined();
        expect(cr.signalId).toBeDefined();
        expect(['pending', 'approved', 'rejected']).toContain(cr.status);
      }),
      { numRuns: 30 },
    );
  });

  it('arbChangeRequest without args produces valid change requests', () => {
    fc.assert(
      fc.property(arbChangeRequest(), (cr) => {
        expect(['critical', 'major', 'minor', 'info']).toContain(cr.criticality);
      }),
      { numRuns: 30 },
    );
  });
});
