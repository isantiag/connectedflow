import { describe, it, expect, beforeEach } from 'vitest';
import {
  AnomalyDetectionService,
  _resetAnomalyCounter,
  type SignalProvider,
  type BusUtilizationProvider,
  type SignalChange,
  type RawAnomaly,
  type ClassifiedAnomaly,
} from './anomaly-detection-service.js';
import type {
  Signal,
  SignalId,
  LogicalLayer,
  TransportLayer,
  PhysicalLayer,
} from '@connectedicd/shared-types';

// ---------------------------------------------------------------------------
// Helpers — build minimal valid signal structures
// ---------------------------------------------------------------------------

function makeSignal(overrides?: {
  id?: string;
  logical?: Partial<LogicalLayer>;
  transport?: Partial<TransportLayer>;
  physical?: Partial<PhysicalLayer>;
}): Signal {
  const id = (overrides?.id ?? 'sig-1') as SignalId;
  return {
    id,
    name: 'TEST_SIGNAL',
    projectId: 'proj-1' as any,
    status: 'active',
    criticality: 'major',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1' as any,
    updatedBy: 'user-1' as any,
    version: 1,
    logical: {
      id: 'log-1',
      signalId: id,
      dataType: 'float32',
      minValue: 0,
      maxValue: 100,
      units: 'knots',
      description: 'Airspeed',
      sourceSystem: 'ADC',
      destSystem: 'PFD',
      refreshRateHz: 10,
      functionalCategory: 'air_data',
      ...overrides?.logical,
    },
    transport: {
      id: 'trans-1',
      signalId: id,
      protocolId: 'arinc429' as any,
      busId: 'bus-1' as any,
      protocolAttrs: {},
      bitOffset: 0,
      bitLength: 16,
      encoding: 'unsigned',
      scaleFactor: 1,
      offsetValue: 0,
      byteOrder: 'big_endian',
      ...overrides?.transport,
    },
    physical: {
      id: 'phys-1',
      signalId: id,
      connectorId: 'conn-1' as any,
      pinNumber: 'A1',
      cableBundleId: 'cable-1' as any,
      wireGauge: '22AWG',
      wireColor: 'white',
      wireType: 'shielded',
      maxLengthM: 10,
      shielding: 'braided',
      ...overrides?.physical,
    },
  };
}

function makeSignalProvider(signals: Signal[]): SignalProvider {
  const map = new Map(signals.map((s) => [s.id, s]));
  return {
    getSignal: async (id: SignalId) => map.get(id),
  };
}

function makeBusUtilizationProvider(
  data: Record<string, { utilizationPercent: number; usedBandwidthBps: number; totalBandwidthBps: number }>,
): BusUtilizationProvider {
  return {
    getUtilization: async (busId: string) => {
      const entry = data[busId];
      if (!entry) throw new Error(`Bus not found: ${busId}`);
      return entry;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnomalyDetectionService', () => {
  beforeEach(() => {
    _resetAnomalyCounter();
  });

  describe('analyzeChange', () => {
    it('returns no anomalies for a consistent signal', async () => {
      const signal = makeSignal({
        logical: { minValue: 0, maxValue: 100 },
        transport: { bitLength: 16, encoding: 'unsigned', scaleFactor: 1, offsetValue: 0 },
      });
      // unsigned 16-bit: 0..65535, so 0..100 fits fine

      const service = new AnomalyDetectionService();
      const change: SignalChange = { signalId: signal.id, after: signal };
      const report = await service.analyzeChange(change);

      expect(report.anomalies).toHaveLength(0);
      expect(report.scannedSignals).toBe(1);
    });

    it('detects range overlap when logical max exceeds transport capacity', async () => {
      const signal = makeSignal({
        logical: { minValue: 0, maxValue: 70000 },
        transport: { bitLength: 16, encoding: 'unsigned', scaleFactor: 1, offsetValue: 0 },
      });
      // unsigned 16-bit max = 65535, but logical max is 70000

      const service = new AnomalyDetectionService();
      const change: SignalChange = { signalId: signal.id, after: signal };
      const report = await service.analyzeChange(change);

      const rangeAnomalies = report.anomalies.filter((a) => a.category === 'range_overlap');
      expect(rangeAnomalies.length).toBeGreaterThanOrEqual(1);
      expect(rangeAnomalies[0].severity).toBe('error');
      expect(rangeAnomalies[0].suggestions.length).toBeGreaterThanOrEqual(1);
    });

    it('detects encoding mismatch when BCD is used with float data type', async () => {
      const signal = makeSignal({
        logical: { dataType: 'float32', minValue: 0, maxValue: 100 },
        transport: { bitLength: 16, encoding: 'bcd', scaleFactor: 1, offsetValue: 0 },
      });

      const service = new AnomalyDetectionService();
      const change: SignalChange = { signalId: signal.id, after: signal };
      const report = await service.analyzeChange(change);

      const encodingAnomalies = report.anomalies.filter((a) => a.category === 'encoding_mismatch');
      expect(encodingAnomalies.length).toBeGreaterThanOrEqual(1);
      expect(encodingAnomalies[0].severity).toBe('error');
      expect(encodingAnomalies[0].suggestions.length).toBeGreaterThanOrEqual(1);
      expect(encodingAnomalies[0].suggestions[0].action).toBe('change_encoding');
    });

    it('detects wire gauge incompatibility', async () => {
      const signal = makeSignal({
        transport: { protocolId: 'arinc664' as any },
        physical: { wireGauge: '26AWG' },
      });
      // 26AWG max = 100kbps, ARINC 664 needs 100Mbps

      const service = new AnomalyDetectionService();
      const change: SignalChange = { signalId: signal.id, after: signal };
      const report = await service.analyzeChange(change);

      const wireAnomalies = report.anomalies.filter((a) => a.category === 'wire_gauge_incompatibility');
      expect(wireAnomalies.length).toBeGreaterThanOrEqual(1);
      expect(wireAnomalies[0].severity).toBe('error');
      expect(wireAnomalies[0].suggestions[0].action).toBe('upgrade_wire_gauge');
    });

    it('detects timing mismatch when refresh rate exceeds transport timing', async () => {
      const signal = makeSignal({
        logical: { refreshRateHz: 50 },
        transport: {
          protocolId: 'canbus' as any,
          protocolAttrs: { cycle_time_ms: 100 } as any,
        },
      });
      // CAN cycle_time_ms=100 → 10 Hz, but logical wants 50 Hz

      const service = new AnomalyDetectionService();
      const change: SignalChange = { signalId: signal.id, after: signal };
      const report = await service.analyzeChange(change);

      const timingAnomalies = report.anomalies.filter((a) => a.category === 'timing_mismatch');
      expect(timingAnomalies.length).toBeGreaterThanOrEqual(1);
      expect(timingAnomalies[0].severity).toBe('warning');
      expect(timingAnomalies[0].suggestions.length).toBeGreaterThanOrEqual(1);
    });

    it('detects bus overload when utilization exceeds 100%', async () => {
      const signal = makeSignal();
      const busProvider = makeBusUtilizationProvider({
        'bus-1': { utilizationPercent: 120, usedBandwidthBps: 120000, totalBandwidthBps: 100000 },
      });

      const service = new AnomalyDetectionService({ busUtilizationProvider: busProvider });
      const change: SignalChange = { signalId: signal.id, after: signal };
      const report = await service.analyzeChange(change);

      const busAnomalies = report.anomalies.filter((a) => a.category === 'bus_overload');
      expect(busAnomalies.length).toBe(1);
      expect(busAnomalies[0].severity).toBe('error');
      expect(busAnomalies[0].suggestions.length).toBeGreaterThanOrEqual(1);
    });

    it('detects bit layout overflow', async () => {
      const signal = makeSignal({
        transport: {
          protocolId: 'arinc429' as any,
          bitOffset: 20,
          bitLength: 16,
        },
      });
      // ARINC 429 word = 32 bits, but 20 + 16 = 36 > 32

      const service = new AnomalyDetectionService();
      const change: SignalChange = { signalId: signal.id, after: signal };
      const report = await service.analyzeChange(change);

      const bitAnomalies = report.anomalies.filter((a) => a.category === 'bit_layout_overflow');
      expect(bitAnomalies.length).toBeGreaterThanOrEqual(1);
      expect(bitAnomalies[0].severity).toBe('error');
    });

    it('detects multiple anomalies simultaneously', async () => {
      const signal = makeSignal({
        logical: { dataType: 'float64', minValue: 0, maxValue: 70000 },
        transport: {
          protocolId: 'arinc429' as any,
          bitLength: 16,
          bitOffset: 20,
          encoding: 'bcd',
          scaleFactor: 1,
          offsetValue: 0,
        },
        physical: { wireGauge: '26AWG' },
      });

      const service = new AnomalyDetectionService();
      const change: SignalChange = { signalId: signal.id, after: signal };
      const report = await service.analyzeChange(change);

      // Should detect: range overlap (70000 > BCD 16-bit capacity),
      // encoding mismatch (BCD + float), bit layout overflow (20+16=36 > 32)
      expect(report.anomalies.length).toBeGreaterThanOrEqual(3);

      const categories = new Set(report.anomalies.map((a) => a.category));
      expect(categories.has('encoding_mismatch')).toBe(true);
      expect(categories.has('bit_layout_overflow')).toBe(true);
    });
  });

  describe('runBulkScan', () => {
    it('scans multiple signals and aggregates anomalies', async () => {
      const goodSignal = makeSignal({
        id: 'sig-good',
        logical: { minValue: 0, maxValue: 100 },
        transport: { bitLength: 16, encoding: 'unsigned', scaleFactor: 1, offsetValue: 0 },
      });
      const badSignal = makeSignal({
        id: 'sig-bad',
        logical: { minValue: 0, maxValue: 70000 },
        transport: { bitLength: 16, encoding: 'unsigned', scaleFactor: 1, offsetValue: 0 },
      });

      const provider = makeSignalProvider([goodSignal, badSignal]);
      const service = new AnomalyDetectionService({ signalProvider: provider });

      const report = await service.runBulkScan([
        'sig-good' as SignalId,
        'sig-bad' as SignalId,
      ]);

      expect(report.scannedSignals).toBe(2);
      expect(report.anomalies.length).toBeGreaterThanOrEqual(1);
      expect(report.anomalies.some((a) => a.category === 'range_overlap')).toBe(true);
    });

    it('skips signals that are not found', async () => {
      const provider = makeSignalProvider([]);
      const service = new AnomalyDetectionService({ signalProvider: provider });

      const report = await service.runBulkScan(['missing' as SignalId]);

      expect(report.scannedSignals).toBe(0);
      expect(report.anomalies).toHaveLength(0);
    });

    it('checks bus overload once per bus across multiple signals', async () => {
      const sig1 = makeSignal({
        id: 'sig-1',
        transport: { busId: 'bus-A' as any },
      });
      const sig2 = makeSignal({
        id: 'sig-2',
        transport: { busId: 'bus-A' as any },
      });

      const provider = makeSignalProvider([sig1, sig2]);
      let callCount = 0;
      const busProvider: BusUtilizationProvider = {
        getUtilization: async () => {
          callCount++;
          return { utilizationPercent: 50, usedBandwidthBps: 50000, totalBandwidthBps: 100000 };
        },
      };

      const service = new AnomalyDetectionService({
        signalProvider: provider,
        busUtilizationProvider: busProvider,
      });

      await service.runBulkScan(['sig-1' as SignalId, 'sig-2' as SignalId]);

      // Bus-A should only be checked once
      expect(callCount).toBe(1);
    });
  });

  describe('classifyAnomaly', () => {
    it('classifies a bus overload anomaly', () => {
      const service = new AnomalyDetectionService();
      const raw: RawAnomaly = {
        affectedSignals: ['sig-1' as SignalId],
        description: 'Bus utilization is 150%, exceeding 100% capacity',
        source: 'bus_loading',
      };

      const classified = service.classifyAnomaly(raw);

      expect(classified.category).toBe('bus_overload');
      expect(classified.severity).toBe('error');
      expect(classified.id).toBeTruthy();
      expect(classified.suggestions.length).toBeGreaterThanOrEqual(1);
    });

    it('classifies a range overlap from constraint', () => {
      const service = new AnomalyDetectionService();
      const raw: RawAnomaly = {
        affectedSignals: ['sig-1' as SignalId],
        description: 'Logical maximum exceeds transport capacity',
        source: 'cross_layer_validation',
        rawDetail: { constraint: 'logical_range_within_transport_capacity' },
      };

      const classified = service.classifyAnomaly(raw);

      expect(classified.category).toBe('range_overlap');
      expect(classified.severity).toBe('error');
    });

    it('classifies an encoding mismatch from description', () => {
      const service = new AnomalyDetectionService();
      const raw: RawAnomaly = {
        affectedSignals: ['sig-1' as SignalId],
        description: "Encoding 'bcd' is incompatible with logical data type 'float32'",
        source: 'pattern_detection',
      };

      const classified = service.classifyAnomaly(raw);

      expect(classified.category).toBe('encoding_mismatch');
      expect(classified.severity).toBe('error');
    });

    it('classifies unknown anomalies as info severity', () => {
      const service = new AnomalyDetectionService();
      const raw: RawAnomaly = {
        affectedSignals: ['sig-1' as SignalId],
        description: 'Something unusual happened',
        source: 'pattern_detection',
      };

      const classified = service.classifyAnomaly(raw);

      expect(classified.category).toBe('unknown');
      expect(classified.severity).toBe('info');
      expect(classified.suggestions.length).toBeGreaterThanOrEqual(1);
      expect(classified.suggestions[0].action).toBe('manual_review');
    });
  });

  describe('getSuggestions', () => {
    it('provides suggestions for every known category', () => {
      const service = new AnomalyDetectionService();
      const categories = [
        'bus_overload',
        'range_overlap',
        'encoding_mismatch',
        'wire_gauge_incompatibility',
        'timing_mismatch',
        'bit_layout_overflow',
        'unknown',
      ] as const;

      for (const category of categories) {
        const anomaly: ClassifiedAnomaly = {
          id: 'test' as any,
          severity: 'error',
          category,
          affectedSignals: ['sig-1' as SignalId],
          description: 'test',
          suggestions: [],
        };

        const suggestions = service.getSuggestions(anomaly);
        expect(suggestions.length).toBeGreaterThanOrEqual(1);
        expect(suggestions[0].action).toBeTruthy();
        expect(suggestions[0].description).toBeTruthy();
        expect(['high', 'medium', 'low']).toContain(suggestions[0].priority);
      }
    });

    it('returns multiple suggestions for bus overload', () => {
      const service = new AnomalyDetectionService();
      const anomaly: ClassifiedAnomaly = {
        id: 'test' as any,
        severity: 'error',
        category: 'bus_overload',
        affectedSignals: ['sig-1' as SignalId],
        description: 'Bus overloaded',
        suggestions: [],
      };

      const suggestions = service.getSuggestions(anomaly);
      expect(suggestions.length).toBe(2);
      expect(suggestions[0].action).toBe('reduce_bus_signals');
      expect(suggestions[1].action).toBe('increase_bus_bandwidth');
    });

    it('returns multiple suggestions for timing mismatch', () => {
      const service = new AnomalyDetectionService();
      const anomaly: ClassifiedAnomaly = {
        id: 'test' as any,
        severity: 'warning',
        category: 'timing_mismatch',
        affectedSignals: ['sig-1' as SignalId],
        description: 'Timing mismatch',
        suggestions: [],
      };

      const suggestions = service.getSuggestions(anomaly);
      expect(suggestions.length).toBe(2);
      expect(suggestions[0].action).toBe('reduce_refresh_rate');
      expect(suggestions[1].action).toBe('increase_transport_rate');
    });
  });
});
