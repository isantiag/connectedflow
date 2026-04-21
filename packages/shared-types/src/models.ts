// Core data models matching the design document's ER diagram.

import type {
  SignalId,
  ProjectId,
  BusId,
  ProtocolId,
  ConnectorId,
  CableBundleId,
  EquipmentId,
  UserId,
} from './ids.js';
import type { ProtocolAttrs } from './protocols.js';

// ---------------------------------------------------------------------------
// Signal & Three-Layer Model
// ---------------------------------------------------------------------------

export type SignalStatus = 'draft' | 'active' | 'deprecated' | 'archived';
export type Criticality = 'critical' | 'major' | 'minor' | 'info';

export interface Signal {
  id: SignalId;
  name: string;
  projectId: ProjectId;
  status: SignalStatus;
  criticality: Criticality;
  createdAt: Date;
  updatedAt: Date;
  createdBy: UserId;
  updatedBy: UserId;
  version: number;
  logical?: LogicalLayer;
  transport?: TransportLayer;
  physical?: PhysicalLayer;
}

export interface LogicalLayer {
  id: string;
  signalId: SignalId;
  dataType: string;
  minValue: number | null;
  maxValue: number | null;
  units: string;
  description: string;
  sourceSystem: string;
  destSystem: string;
  refreshRateHz: number;
  functionalCategory: string;
}

export type ByteOrder = 'big_endian' | 'little_endian';
export type Encoding = 'unsigned' | 'signed' | 'ieee754' | 'bcd';

export interface TransportLayer {
  id: string;
  signalId: SignalId;
  protocolId: ProtocolId;
  busId: BusId;
  protocolAttrs: ProtocolAttrs | Record<string, unknown>;
  bitOffset: number;
  bitLength: number;
  encoding: Encoding;
  scaleFactor: number;
  offsetValue: number;
  byteOrder: ByteOrder;
}

export interface PhysicalLayer {
  id: string;
  signalId: SignalId;
  connectorId: ConnectorId;
  pinNumber: string;
  cableBundleId: CableBundleId;
  wireGauge: string;
  wireColor: string;
  wireType: string;
  maxLengthM: number;
  shielding: string;
}
