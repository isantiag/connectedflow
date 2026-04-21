// Supporting entity models: Bus, Connector, CableBundle, Project, Protocol.

import type {
  BusId,
  ProjectId,
  ProtocolId,
  ConnectorId,
  CableBundleId,
  EquipmentId,
} from './ids.js';

export type RedundancyMode = 'none' | 'dual' | 'triple';

export interface Bus {
  id: BusId;
  projectId: ProjectId;
  name: string;
  protocolId: ProtocolId;
  bandwidthBps: number;
  redundancyMode: RedundancyMode;
}

export interface ProtocolDefinition {
  id: ProtocolId;
  protocolName: string;
  version: string;
  fieldSchema: Record<string, unknown>;
  validationRules: Record<string, unknown>;
}

export interface Connector {
  id: ConnectorId;
  partNumber: string;
  connectorType: string;
  totalPins: number;
  location: string;
  equipmentId: EquipmentId;
}

export interface CableBundle {
  id: CableBundleId;
  bundleId: string;
  routePath: string;
  totalLengthM: number;
  bundleType: string;
}

export type ProgramPhase = 'concept' | 'preliminary' | 'detailed' | 'certification' | 'production';

export interface Project {
  id: ProjectId;
  name: string;
  aircraftType: string;
  certificationBasis: string;
  programPhase: ProgramPhase;
}
