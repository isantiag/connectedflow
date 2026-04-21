/**
 * Custom fast-check arbitraries for ConnectedFlow property-based tests.
 *
 * Each generator produces valid data conforming to the database schema
 * constraints and shared-type interfaces.
 */

import fc from 'fast-check';
import type {
  SignalId,
  ProjectId,
  BusId,
  ProtocolId,
  ConnectorId,
  CableBundleId,
  UserId,
  BaselineId,
  ChangeRequestId,
  EquipmentId,
  SnapshotId,
  ParseJobId,
} from '@connectedflow/shared-types';
import type {
  Signal,
  SignalStatus,
  Criticality,
  LogicalLayer,
  TransportLayer,
  PhysicalLayer,
  ByteOrder,
  Encoding,
} from '@connectedflow/shared-types';
import type {
  Bus,
  RedundancyMode,
  Connector,
  CableBundle,
  ProtocolDefinition,
} from '@connectedflow/shared-types';
import type {
  Arinc429Attrs,
  CanBusAttrs,
  MilStd1553Attrs,
  Arinc664Attrs,
  KnownProtocol,
  ProtocolAttrs,
} from '@connectedflow/shared-types';

// ---------------------------------------------------------------------------
// Branded-ID helpers
// ---------------------------------------------------------------------------

/** Arbitrary UUID cast to a branded ID type. */
function arbBrandedUuid<T extends string>(): fc.Arbitrary<T> {
  return fc.uuid() as unknown as fc.Arbitrary<T>;
}

export const arbSignalId = (): fc.Arbitrary<SignalId> => arbBrandedUuid<SignalId>();
export const arbProjectId = (): fc.Arbitrary<ProjectId> => arbBrandedUuid<ProjectId>();
export const arbBusId = (): fc.Arbitrary<BusId> => arbBrandedUuid<BusId>();
export const arbConnectorId = (): fc.Arbitrary<ConnectorId> => arbBrandedUuid<ConnectorId>();
export const arbCableBundleId = (): fc.Arbitrary<CableBundleId> => arbBrandedUuid<CableBundleId>();
export const arbUserId = (): fc.Arbitrary<UserId> => arbBrandedUuid<UserId>();
export const arbBaselineId = (): fc.Arbitrary<BaselineId> => arbBrandedUuid<BaselineId>();
export const arbChangeRequestId = (): fc.Arbitrary<ChangeRequestId> => arbBrandedUuid<ChangeRequestId>();
export const arbEquipmentId = (): fc.Arbitrary<EquipmentId> => arbBrandedUuid<EquipmentId>();
export const arbSnapshotId = (): fc.Arbitrary<SnapshotId> => arbBrandedUuid<SnapshotId>();
export const arbParseJobId = (): fc.Arbitrary<ParseJobId> => arbBrandedUuid<ParseJobId>();

// ---------------------------------------------------------------------------
// Protocol ID
// ---------------------------------------------------------------------------

const KNOWN_PROTOCOLS: KnownProtocol[] = ['arinc429', 'canbus', 'milstd1553', 'arinc664'];

export function arbProtocolId(): fc.Arbitrary<ProtocolId> {
  return fc.constantFrom(...KNOWN_PROTOCOLS) as unknown as fc.Arbitrary<ProtocolId>;
}

// ---------------------------------------------------------------------------
// Protocol-specific attribute arbitraries
// ---------------------------------------------------------------------------

export function arbArinc429Attrs(): fc.Arbitrary<Arinc429Attrs> {
  return fc.record({
    label: fc.integer({ min: 0, max: 377 }),          // octal 0-377
    sdi: fc.constantFrom('00', '01', '10', '11'),
    ssm: fc.constantFrom('normal', 'no_computed_data', 'functional_test', 'failure_warning'),
    word_type: fc.constantFrom('BNR' as const, 'BCD' as const, 'discrete' as const),
    resolution: fc.double({ min: 0.0001, max: 1, noNaN: true }),
    bus_speed: fc.constantFrom('high' as const, 'low' as const),
  });
}

export function arbCanBusAttrs(): fc.Arbitrary<CanBusAttrs> {
  return fc.record({
    arbitration_id: fc.oneof(
      fc.integer({ min: 0, max: 0x7ff }).map((n) => `0x${n.toString(16).toUpperCase()}`),
      fc.integer({ min: 0, max: 0x1fffffff }).map((n) => `0x${n.toString(16).toUpperCase()}`),
    ),
    id_format: fc.constantFrom('standard_11bit' as const, 'extended_29bit' as const),
    dlc: fc.integer({ min: 0, max: 8 }),
    cycle_time_ms: fc.integer({ min: 1, max: 10000 }),
    start_bit: fc.integer({ min: 0, max: 63 }),
    signal_length: fc.integer({ min: 1, max: 64 }),
  });
}

export function arbMilStd1553Attrs(): fc.Arbitrary<MilStd1553Attrs> {
  return fc.record({
    remote_terminal: fc.integer({ min: 0, max: 30 }),   // RT 0-30 (31 = broadcast)
    sub_address: fc.integer({ min: 1, max: 30 }),        // SA 1-30 (0 and 31 are mode codes)
    word_count: fc.integer({ min: 1, max: 32 }),
    direction: fc.constantFrom('RT_to_BC' as const, 'BC_to_RT' as const, 'RT_to_RT' as const),
    message_type: fc.constantFrom('periodic' as const, 'aperiodic' as const),
    minor_frame_rate_hz: fc.integer({ min: 1, max: 10000 }),
  });
}

export function arbArinc664Attrs(): fc.Arbitrary<Arinc664Attrs> {
  return fc.record({
    virtual_link_id: fc.integer({ min: 1, max: 65535 }),
    bag_ms: fc.constantFrom(1, 2, 4, 8, 16, 32, 64, 128),
    max_frame_size: fc.integer({ min: 64, max: 1518 }),
    partition_id: fc.stringMatching(/^PART_[A-Z]{3}_[0-9]{2}$/),
    sub_virtual_link: fc.integer({ min: 0, max: 255 }),
    network: fc.constantFrom('A' as const, 'B' as const),
  });
}

/** Arbitrary for protocol attrs matching a specific protocol. */
export function arbProtocolAttrs(protocol: KnownProtocol): fc.Arbitrary<ProtocolAttrs> {
  switch (protocol) {
    case 'arinc429':   return arbArinc429Attrs();
    case 'canbus':     return arbCanBusAttrs();
    case 'milstd1553': return arbMilStd1553Attrs();
    case 'arinc664':   return arbArinc664Attrs();
  }
}

// ---------------------------------------------------------------------------
// Three-layer model arbitraries
// ---------------------------------------------------------------------------

export function arbLogicalLayer(signalId?: fc.Arbitrary<SignalId>): fc.Arbitrary<LogicalLayer> {
  const sid = signalId ?? arbSignalId();
  return fc.record({
    id: fc.uuid(),
    signalId: sid,
    dataType: fc.constantFrom('float32', 'float64', 'int16', 'uint16', 'int32', 'uint32', 'boolean', 'enum'),
    minValue: fc.option(fc.double({ min: -1e6, max: 0, noNaN: true }), { nil: null }),
    maxValue: fc.option(fc.double({ min: 0, max: 1e6, noNaN: true }), { nil: null }),
    units: fc.constantFrom('V', 'A', 'deg', 'ft', 'm', 'kg', 'N', 'Pa', 'Hz', 'rpm', '%', 'bool', 'enum'),
    description: fc.string({ minLength: 1, maxLength: 200 }),
    sourceSystem: fc.string({ minLength: 1, maxLength: 50 }),
    destSystem: fc.string({ minLength: 1, maxLength: 50 }),
    refreshRateHz: fc.double({ min: 0.1, max: 10000, noNaN: true }),
    functionalCategory: fc.constantFrom('navigation', 'engine', 'flight_control', 'electrical', 'hydraulic', 'environmental', 'communication'),
  });
}

export function arbTransportLayer(
  protocol?: KnownProtocol,
  signalId?: fc.Arbitrary<SignalId>,
): fc.Arbitrary<TransportLayer> {
  const sid = signalId ?? arbSignalId();
  const proto = protocol ?? 'arinc429';
  return fc.record({
    id: fc.uuid(),
    signalId: sid,
    protocolId: fc.constant(proto) as unknown as fc.Arbitrary<ProtocolId>,
    busId: arbBusId(),
    protocolAttrs: arbProtocolAttrs(proto),
    bitOffset: fc.integer({ min: 0, max: 255 }),
    bitLength: fc.integer({ min: 1, max: 64 }),
    encoding: fc.constantFrom('unsigned' as const, 'signed' as const, 'ieee754' as const, 'bcd' as const),
    scaleFactor: fc.double({ min: 0.0001, max: 1000, noNaN: true }),
    offsetValue: fc.double({ min: -10000, max: 10000, noNaN: true }),
    byteOrder: fc.constantFrom('big_endian' as const, 'little_endian' as const),
  });
}

export function arbPhysicalLayer(signalId?: fc.Arbitrary<SignalId>): fc.Arbitrary<PhysicalLayer> {
  const sid = signalId ?? arbSignalId();
  return fc.record({
    id: fc.uuid(),
    signalId: sid,
    connectorId: arbConnectorId(),
    pinNumber: fc.integer({ min: 1, max: 200 }).map(String),
    cableBundleId: arbCableBundleId(),
    wireGauge: fc.constantFrom('12 AWG', '14 AWG', '16 AWG', '18 AWG', '20 AWG', '22 AWG', '24 AWG', '26 AWG'),
    wireColor: fc.constantFrom('red', 'blue', 'green', 'white', 'black', 'yellow', 'orange', 'brown'),
    wireType: fc.constantFrom('shielded', 'unshielded', 'twisted_pair', 'coaxial', 'fiber_optic'),
    maxLengthM: fc.double({ min: 0.1, max: 100, noNaN: true }),
    shielding: fc.constantFrom('none', 'braid', 'foil', 'braid_and_foil'),
  });
}

// ---------------------------------------------------------------------------
// Signal (full three-layer model)
// ---------------------------------------------------------------------------

export function arbSignal(protocol?: KnownProtocol): fc.Arbitrary<Signal> {
  const sid = arbSignalId();
  const proto = protocol ?? 'arinc429';
  return fc.record({
    id: sid,
    name: fc.stringMatching(/^[A-Z][A-Z0-9_]{2,29}$/).filter((s) => s.length >= 3),
    projectId: arbProjectId(),
    status: fc.constantFrom('draft' as const, 'active' as const, 'deprecated' as const, 'archived' as const),
    criticality: fc.constantFrom('critical' as const, 'major' as const, 'minor' as const, 'info' as const),
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
    updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
    createdBy: arbUserId(),
    updatedBy: arbUserId(),
    version: fc.integer({ min: 1, max: 1000 }),
    logical: arbLogicalLayer(sid),
    transport: arbTransportLayer(proto, sid),
    physical: arbPhysicalLayer(sid),
  });
}

// ---------------------------------------------------------------------------
// Entity arbitraries
// ---------------------------------------------------------------------------

export function arbBus(protocol?: KnownProtocol): fc.Arbitrary<Bus> {
  const proto = protocol ?? 'arinc429';
  return fc.record({
    id: arbBusId(),
    projectId: arbProjectId(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    protocolId: fc.constant(proto) as unknown as fc.Arbitrary<ProtocolId>,
    bandwidthBps: fc.constantFrom(12500, 100000, 1000000, 10000000, 100000000),
    redundancyMode: fc.constantFrom('none' as const, 'dual' as const, 'triple' as const),
  });
}

export function arbConnector(): fc.Arbitrary<Connector> {
  return fc.record({
    id: arbConnectorId(),
    partNumber: fc.stringMatching(/^[A-Z]{2,4}-[0-9]{3,6}$/),
    connectorType: fc.constantFrom('D-sub', 'circular', 'rectangular', 'coaxial', 'fiber'),
    totalPins: fc.integer({ min: 1, max: 200 }),
    location: fc.string({ minLength: 1, maxLength: 100 }),
    equipmentId: arbEquipmentId(),
  });
}

export function arbCableBundle(): fc.Arbitrary<CableBundle> {
  return fc.record({
    id: arbCableBundleId(),
    bundleId: fc.stringMatching(/^WB-[0-9]{3,6}$/),
    routePath: fc.string({ minLength: 1, maxLength: 200 }),
    totalLengthM: fc.double({ min: 0.1, max: 500, noNaN: true }),
    bundleType: fc.constantFrom('primary', 'secondary', 'auxiliary'),
  });
}

// ---------------------------------------------------------------------------
// Bus data arbitrary (for live data / decoding tests)
// ---------------------------------------------------------------------------

export interface BusDataIcdDef {
  bitOffset: number;
  bitLength: number;
  encoding: Encoding;
  scaleFactor: number;
  offsetValue: number;
  byteOrder: ByteOrder;
}

/** Arbitrary raw bus data buffer sized to contain the signal defined by icdDef. */
export function arbBusData(icdDef: BusDataIcdDef): fc.Arbitrary<Buffer> {
  const totalBytes = Math.ceil((icdDef.bitOffset + icdDef.bitLength) / 8);
  return fc.uint8Array({ minLength: totalBytes, maxLength: totalBytes }).map(
    (arr) => Buffer.from(arr),
  );
}

// ---------------------------------------------------------------------------
// Extraction result arbitrary (for AI extraction tests)
// ---------------------------------------------------------------------------

export interface ExtractedSignalArb {
  data: Record<string, unknown>;
  confidence: number;
  sourceLocation: { page: number; row: number };
  needsReview: boolean;
}

export function arbExtractionResult(count?: number): fc.Arbitrary<ExtractedSignalArb[]> {
  const n = count ?? 10;
  return fc.array(
    fc.record({
      data: fc.record({
        name: fc.stringMatching(/^[A-Z][A-Z0-9_]{2,19}$/),
        dataType: fc.constantFrom('float32', 'int16', 'uint16', 'boolean'),
        units: fc.constantFrom('V', 'A', 'deg', 'ft', 'm'),
      }) as fc.Arbitrary<Record<string, unknown>>,
      confidence: fc.double({ min: 0, max: 1, noNaN: true }),
      sourceLocation: fc.record({
        page: fc.integer({ min: 1, max: 500 }),
        row: fc.integer({ min: 1, max: 200 }),
      }),
      needsReview: fc.boolean(),
    }),
    { minLength: 1, maxLength: n },
  );
}

// ---------------------------------------------------------------------------
// Baseline arbitrary (for baseline/versioning tests)
// ---------------------------------------------------------------------------

export interface BaselineArb {
  id: BaselineId;
  projectId: ProjectId;
  versionLabel: string;
  description: string;
  createdAt: Date;
  createdBy: UserId;
  status: 'draft' | 'approved' | 'released';
  signals: Signal[];
}

export function arbBaseline(signalCount?: number): fc.Arbitrary<BaselineArb> {
  const n = signalCount ?? 5;
  return fc.record({
    id: arbBaselineId(),
    projectId: arbProjectId(),
    versionLabel: fc.stringMatching(/^v[0-9]+\.[0-9]+\.[0-9]+$/),
    description: fc.string({ minLength: 1, maxLength: 200 }),
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
    createdBy: arbUserId(),
    status: fc.constantFrom('draft' as const, 'approved' as const, 'released' as const),
    signals: fc.array(arbSignal(), { minLength: 1, maxLength: n }),
  });
}

// ---------------------------------------------------------------------------
// Change request arbitrary (for workflow tests)
// ---------------------------------------------------------------------------

export interface ChangeRequestArb {
  id: ChangeRequestId;
  signalId: SignalId;
  submittedBy: UserId;
  approvedBy: UserId | null;
  status: 'pending' | 'approved' | 'rejected';
  changePayload: Record<string, unknown>;
  rejectionReason: string | null;
  submittedAt: Date;
  resolvedAt: Date | null;
  criticality: Criticality;
}

export function arbChangeRequest(
  criticality?: Criticality,
  _role?: string,
): fc.Arbitrary<ChangeRequestArb> {
  const crit = criticality
    ? fc.constant(criticality)
    : fc.constantFrom('critical' as const, 'major' as const, 'minor' as const, 'info' as const);

  return fc.record({
    id: arbChangeRequestId(),
    signalId: arbSignalId(),
    submittedBy: arbUserId(),
    approvedBy: fc.option(arbUserId(), { nil: null }),
    status: fc.constantFrom('pending' as const, 'approved' as const, 'rejected' as const),
    changePayload: fc.record({
      field: fc.constantFrom('name', 'minValue', 'maxValue', 'bitOffset', 'wireGauge'),
      oldValue: fc.string({ minLength: 1, maxLength: 50 }),
      newValue: fc.string({ minLength: 1, maxLength: 50 }),
    }) as fc.Arbitrary<Record<string, unknown>>,
    rejectionReason: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
    submittedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
    resolvedAt: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }), { nil: null }),
    criticality: crit,
  });
}
