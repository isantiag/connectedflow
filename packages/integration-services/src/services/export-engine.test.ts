import { describe, it, expect } from 'vitest';
import type {
  Signal,
  TransportLayer,
  PhysicalLayer,
  SignalId,
  ProjectId,
  UserId,
  ProtocolId,
  BusId,
  ConnectorId,
  CableBundleId,
} from '@connectedicd/shared-types';
import type { CanBusAttrs, Arinc429Attrs } from '@connectedicd/shared-types';
import {
  ExportEngine,
  type ExportSignalData,
  type CertPackageInput,
} from './export-engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSignal(name: string, id = 'sig-1'): Signal {
  return {
    id: id as SignalId,
    name,
    projectId: 'proj-1' as ProjectId,
    status: 'active',
    criticality: 'major',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1' as UserId,
    updatedBy: 'user-1' as UserId,
    version: 1,
  };
}

function makeTransport(overrides: Partial<TransportLayer> = {}): TransportLayer {
  return {
    id: 'tl-1',
    signalId: 'sig-1' as SignalId,
    protocolId: 'canbus' as ProtocolId,
    busId: 'bus-1' as BusId,
    protocolAttrs: {
      arbitration_id: '0x100',
      id_format: 'standard_11bit',
      dlc: 8,
      cycle_time_ms: 100,
      start_bit: 0,
      signal_length: 16,
    } as CanBusAttrs,
    bitOffset: 0,
    bitLength: 16,
    encoding: 'unsigned',
    scaleFactor: 0.1,
    offsetValue: 0,
    byteOrder: 'little_endian',
    ...overrides,
  };
}

function makePhysical(overrides: Partial<PhysicalLayer> = {}): PhysicalLayer {
  return {
    id: 'pl-1',
    signalId: 'sig-1' as SignalId,
    connectorId: 'CONN-J1' as ConnectorId,
    pinNumber: '12',
    cableBundleId: 'CB-001' as CableBundleId,
    wireGauge: '22 AWG',
    wireColor: 'red',
    wireType: 'shielded',
    maxLengthM: 5.0,
    shielding: 'braided',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExportEngine', () => {
  const engine = new ExportEngine();

  // -----------------------------------------------------------------------
  // CAN DBC export
  // -----------------------------------------------------------------------

  describe('exportTestBenchConfig — CAN DBC', () => {
    it('produces a valid DBC file structure', () => {
      const data: ExportSignalData[] = [
        {
          signal: {
            ...makeSignal('EngineRPM'),
            logical: {
              id: 'll-1',
              signalId: 'sig-1' as SignalId,
              dataType: 'float',
              minValue: 0,
              maxValue: 8000,
              units: 'rpm',
              description: '',
              sourceSystem: 'ECU',
              destSystem: 'Display',
              refreshRateHz: 100,
              functionalCategory: 'engine',
            },
          },
          transport: makeTransport(),
        },
      ];

      const result = engine.exportTestBenchConfig(data, 'can_dbc');

      expect(result.filename).toBe('signals.dbc');
      expect(result.content).toContain('VERSION ""');
      expect(result.content).toContain('BO_');
      expect(result.content).toContain('SG_ EngineRPM');
      expect(result.content).toContain('(0.1,0)');
      expect(result.content).toContain('[0|8000]');
      expect(result.content).toContain('"rpm"');
    });

    it('groups signals by arbitration ID', () => {
      const data: ExportSignalData[] = [
        {
          signal: makeSignal('Sig_A', 'sig-1'),
          transport: makeTransport({
            protocolAttrs: { arbitration_id: '0x100', id_format: 'standard_11bit', dlc: 8, cycle_time_ms: 100, start_bit: 0, signal_length: 8 } as CanBusAttrs,
          }),
        },
        {
          signal: makeSignal('Sig_B', 'sig-2'),
          transport: makeTransport({
            id: 'tl-2',
            signalId: 'sig-2' as SignalId,
            protocolAttrs: { arbitration_id: '0x100', id_format: 'standard_11bit', dlc: 8, cycle_time_ms: 100, start_bit: 8, signal_length: 8 } as CanBusAttrs,
            bitOffset: 8,
            bitLength: 8,
          }),
        },
      ];

      const result = engine.exportTestBenchConfig(data, 'can_dbc');

      // Both signals under same BO_ block
      const boCount = (result.content.match(/BO_/g) || []).length;
      expect(boCount).toBe(1);
      expect(result.content).toContain('SG_ Sig_A');
      expect(result.content).toContain('SG_ Sig_B');
    });

    it('encodes byte order and sign correctly', () => {
      const data: ExportSignalData[] = [
        {
          signal: makeSignal('Temp'),
          transport: makeTransport({ byteOrder: 'big_endian', encoding: 'signed' }),
        },
      ];

      const result = engine.exportTestBenchConfig(data, 'can_dbc');
      // big_endian = 1, signed = '-'
      expect(result.content).toContain('@1-');
    });
  });

  // -----------------------------------------------------------------------
  // ARINC 429 label table export
  // -----------------------------------------------------------------------

  describe('exportTestBenchConfig — ARINC 429 label table', () => {
    it('produces CSV with correct headers and data', () => {
      const data: ExportSignalData[] = [
        {
          signal: makeSignal('Altitude'),
          transport: makeTransport({
            protocolAttrs: {
              label: 205,
              sdi: '00',
              ssm: 'normal',
              word_type: 'BNR',
              resolution: 0.0054932,
              bus_speed: 'high',
            } as Arinc429Attrs,
          }),
        },
      ];

      const result = engine.exportTestBenchConfig(data, 'arinc429_label_table');

      expect(result.filename).toBe('arinc429_labels.csv');
      expect(result.mimeType).toBe('text/csv');
      expect(result.content).toContain('Label,SDI,SSM,Word Type,Resolution,Signal Name');
      expect(result.content).toContain('205,00,normal,BNR,0.0054932,Altitude');
    });
  });

  // -----------------------------------------------------------------------
  // Simulink model export
  // -----------------------------------------------------------------------

  describe('exportSimulinkModel', () => {
    it('produces well-formed XML with signal blocks', () => {
      const data: ExportSignalData[] = [
        {
          signal: makeSignal('Airspeed'),
          transport: makeTransport({ scaleFactor: 0.5, offsetValue: 10 }),
        },
      ];

      const result = engine.exportSimulinkModel(data);

      expect(result.filename).toBe('icd_interface.xml');
      expect(result.mimeType).toBe('application/xml');
      expect(result.content).toContain('<?xml version="1.0"');
      expect(result.content).toContain('<SimulinkModel');
      expect(result.content).toContain('name="Airspeed"');
      expect(result.content).toContain('value="0.5"');
      expect(result.content).toContain('value="10"');
    });

    it('escapes XML special characters in signal names', () => {
      const data: ExportSignalData[] = [
        { signal: makeSignal('Temp<High>&"Low"'), transport: makeTransport() },
      ];

      const result = engine.exportSimulinkModel(data);

      expect(result.content).toContain('Temp&lt;High&gt;&amp;&quot;Low&quot;');
      expect(result.content).not.toContain('Temp<High>');
    });

    it('handles signals without transport data', () => {
      const data: ExportSignalData[] = [
        { signal: makeSignal('NoTransport') },
      ];

      const result = engine.exportSimulinkModel(data);
      expect(result.content).toContain('name="NoTransport"');
    });
  });

  // -----------------------------------------------------------------------
  // Wire list export
  // -----------------------------------------------------------------------

  describe('exportWireList', () => {
    it('produces CSV with correct headers and physical data', () => {
      const data: ExportSignalData[] = [
        {
          signal: makeSignal('PowerFeed'),
          physical: makePhysical(),
        },
      ];

      const result = engine.exportWireList(data);

      expect(result.filename).toBe('wire_list.csv');
      expect(result.mimeType).toBe('text/csv');
      expect(result.content).toContain('Signal Name,Connector,Pin,Wire Gauge,Cable Bundle');
      expect(result.content).toContain('PowerFeed,CONN-J1,12,22 AWG,CB-001');
    });

    it('skips signals without physical layer data', () => {
      const data: ExportSignalData[] = [
        { signal: makeSignal('NoPhysical') },
        { signal: makeSignal('HasPhysical'), physical: makePhysical() },
      ];

      const result = engine.exportWireList(data);
      const lines = result.content.split('\n');
      // header + 1 data row
      expect(lines).toHaveLength(2);
      expect(result.content).toContain('HasPhysical');
      expect(result.content).not.toContain('NoPhysical');
    });
  });

  // -----------------------------------------------------------------------
  // Harness design export
  // -----------------------------------------------------------------------

  describe('exportHarnessDesign', () => {
    it('delegates to wire list export', () => {
      const data: ExportSignalData[] = [
        { signal: makeSignal('HarnessSignal'), physical: makePhysical() },
      ];

      const result = engine.exportHarnessDesign(data, 'wire_list');

      expect(result.filename).toBe('wire_list.csv');
      expect(result.content).toContain('HarnessSignal');
    });
  });

  // -----------------------------------------------------------------------
  // Certification package export
  // -----------------------------------------------------------------------

  describe('exportCertPackage', () => {
    it('produces JSON with traceability matrix and change history', () => {
      const input: CertPackageInput = {
        baselineId: 'bl-1',
        standard: 'DO-178C',
        signals: [{ signal: makeSignal('CriticalSig') }],
        traceLinks: [
          { signalId: 'sig-1', externalRequirementId: 'REQ-001', requirementText: 'Shall do X' },
        ],
        changeHistory: [
          { signalId: 'sig-1', action: 'create', timestamp: '2024-01-01T00:00:00Z', userId: 'user-1' },
        ],
      };

      const result = engine.exportCertPackage(input);

      expect(result.filename).toContain('DO-178C');
      expect(result.mimeType).toBe('application/json');

      const parsed = JSON.parse(result.content);
      expect(parsed.standard).toBe('DO-178C');
      expect(parsed.baselineId).toBe('bl-1');
      expect(parsed.traceabilityMatrix).toHaveLength(1);
      expect(parsed.traceabilityMatrix[0].requirementId).toBe('REQ-001');
      expect(parsed.changeHistory).toHaveLength(1);
      expect(parsed.signalCount).toBe(1);
    });
  });
});
