/**
 * Signal Management Service — CRUD operations for signals with all three layers.
 *
 * Implements createSignal, updateSignal, deleteSignal, getSignal, querySignals
 * per the SignalService interface from the design document.
 */

import { type Knex } from 'knex';
import type {
  Signal,
  SignalId,
  ProjectId,
  UserId,
  LogicalLayer,
  TransportLayer,
  PhysicalLayer,
  SignalStatus,
  Criticality,
  Encoding,
  ByteOrder,
  Pagination,
  PaginatedResult,
} from '@connectedicd/shared-types';
import type { ProtocolAttrs } from '@connectedicd/shared-types';
import type { ValidationResult } from '@connectedicd/shared-types';
import { ConnectionManager } from '../db/connection.js';
import {
  SignalRepository,
  LogicalLayerRepository,
  TransportLayerRepository,
  PhysicalLayerRepository,
  type SignalRow,
  type LogicalLayerRow,
  type TransportLayerRow,
  type PhysicalLayerRow,
  type SignalQueryFilter,
} from '../repositories/index.js';
import { CrossLayerValidator } from './cross-layer-validator.js';
import { ConcurrentEditError } from './concurrent-edit-error.js';

// ---------------------------------------------------------------------------
// Input / Patch types
// ---------------------------------------------------------------------------

export interface CreateSignalInput {
  name: string;
  projectId: ProjectId;
  status?: SignalStatus;
  criticality?: Criticality;
  createdBy?: UserId;
  logical: Omit<LogicalLayer, 'id' | 'signalId'>;
  transport: Omit<TransportLayer, 'id' | 'signalId'>;
  physical: Omit<PhysicalLayer, 'id' | 'signalId'>;
}

export interface SignalPatch {
  name?: string;
  status?: SignalStatus;
  criticality?: Criticality;
  updatedBy?: UserId;
  /** Expected version for optimistic locking. */
  version: number;
  logical?: Partial<Omit<LogicalLayer, 'id' | 'signalId'>>;
  transport?: Partial<Omit<TransportLayer, 'id' | 'signalId'>>;
  physical?: Partial<Omit<PhysicalLayer, 'id' | 'signalId'>>;
}

export interface SignalFilter {
  projectId?: ProjectId;
  status?: SignalStatus;
  criticality?: Criticality;
  nameSearch?: string;
}

export interface DeleteResult {
  signalId: SignalId;
  layersDeleted: {
    logical: boolean;
    transport: boolean;
    physical: boolean;
  };
}

// ---------------------------------------------------------------------------
// Bulk import types
// ---------------------------------------------------------------------------

/** Maps source field names (from raw records) to normalized schema field paths. */
export interface FieldMapping {
  [sourceField: string]: string; // e.g. { "Signal Name": "name", "Data Type": "logical.dataType" }
}

export interface BulkImportRecordError {
  index: number;
  error: string;
}

export interface BulkImportResult {
  createdCount: number;
  failedCount: number;
  unmappedFields: string[];
  errors: BulkImportRecordError[];
}

// ---------------------------------------------------------------------------
// Known schema fields for field mapping
// ---------------------------------------------------------------------------

/** All recognized field paths in the normalized signal schema. */
const KNOWN_SCHEMA_FIELDS = new Set<string>([
  // Signal-level
  'name',
  'projectId',
  'status',
  'criticality',
  'createdBy',
  // Logical layer
  'logical.dataType',
  'logical.minValue',
  'logical.maxValue',
  'logical.units',
  'logical.description',
  'logical.sourceSystem',
  'logical.destSystem',
  'logical.refreshRateHz',
  'logical.functionalCategory',
  // Transport layer
  'transport.protocolId',
  'transport.busId',
  'transport.protocolAttrs',
  'transport.bitOffset',
  'transport.bitLength',
  'transport.encoding',
  'transport.scaleFactor',
  'transport.offsetValue',
  'transport.byteOrder',
  // Physical layer
  'physical.connectorId',
  'physical.pinNumber',
  'physical.cableBundleId',
  'physical.wireGauge',
  'physical.wireColor',
  'physical.wireType',
  'physical.maxLengthM',
  'physical.shielding',
]);

// ---------------------------------------------------------------------------
// Row ↔ Domain mappers
// ---------------------------------------------------------------------------

function toSignalDomain(
  row: SignalRow,
  logical?: LogicalLayerRow,
  transport?: TransportLayerRow,
  physical?: PhysicalLayerRow,
): Signal {
  return {
    id: row.id as SignalId,
    name: row.name,
    projectId: row.project_id as ProjectId,
    status: row.status as SignalStatus,
    criticality: row.criticality as Criticality,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    createdBy: (row.created_by ?? '') as UserId,
    updatedBy: (row.updated_by ?? '') as UserId,
    version: row.version,
    logical: logical ? toLogicalDomain(logical) : undefined,
    transport: transport ? toTransportDomain(transport) : undefined,
    physical: physical ? toPhysicalDomain(physical) : undefined,
  };
}

function toLogicalDomain(row: LogicalLayerRow): LogicalLayer {
  return {
    id: row.id,
    signalId: row.signal_id as SignalId,
    dataType: row.data_type,
    minValue: row.min_value,
    maxValue: row.max_value,
    units: row.units,
    description: row.description,
    sourceSystem: row.source_system,
    destSystem: row.dest_system,
    refreshRateHz: row.refresh_rate_hz,
    functionalCategory: row.functional_category,
  };
}

function toTransportDomain(row: TransportLayerRow): TransportLayer {
  return {
    id: row.id,
    signalId: row.signal_id as SignalId,
    protocolId: row.protocol_id as import('@connectedicd/shared-types').ProtocolId,
    busId: row.bus_id as import('@connectedicd/shared-types').BusId,
    protocolAttrs: row.protocol_attrs as ProtocolAttrs | Record<string, unknown>,
    bitOffset: row.bit_offset,
    bitLength: row.bit_length,
    encoding: row.encoding as Encoding,
    scaleFactor: row.scale_factor,
    offsetValue: row.offset_value,
    byteOrder: row.byte_order as ByteOrder,
  };
}

function toPhysicalDomain(row: PhysicalLayerRow): PhysicalLayer {
  return {
    id: row.id,
    signalId: row.signal_id as SignalId,
    connectorId: row.connector_id as import('@connectedicd/shared-types').ConnectorId,
    pinNumber: row.pin_number,
    cableBundleId: row.cable_bundle_id as import('@connectedicd/shared-types').CableBundleId,
    wireGauge: row.wire_gauge,
    wireColor: row.wire_color,
    wireType: row.wire_type,
    maxLengthM: row.max_length_m,
    shielding: row.shielding,
  };
}

// ---------------------------------------------------------------------------
// SignalService
// ---------------------------------------------------------------------------

export class SignalService {
  private readonly signalRepo: SignalRepository;
  private readonly logicalRepo: LogicalLayerRepository;
  private readonly transportRepo: TransportLayerRepository;
  private readonly physicalRepo: PhysicalLayerRepository;
  private readonly knex: Knex;
  private readonly crossLayerValidator: CrossLayerValidator;

  constructor(connectionManager: ConnectionManager) {
    this.knex = connectionManager.getPostgres();
    this.signalRepo = new SignalRepository(this.knex);
    this.logicalRepo = new LogicalLayerRepository(this.knex);
    this.transportRepo = new TransportLayerRepository(this.knex);
    this.physicalRepo = new PhysicalLayerRepository(this.knex);
    this.crossLayerValidator = new CrossLayerValidator();
  }

  // -------------------------------------------------------------------------
  // createSignal — single transaction across all layers
  // -------------------------------------------------------------------------

  async createSignal(input: CreateSignalInput): Promise<Signal> {
    return this.knex.transaction(async (trx) => {
      const signalRow = await this.signalRepo.insert(
        {
          name: input.name,
          project_id: input.projectId as string,
          status: input.status ?? 'draft',
          criticality: input.criticality ?? 'info',
          created_by: (input.createdBy as string) ?? null,
          updated_by: (input.createdBy as string) ?? null,
          version: 1,
        },
        trx,
      );

      const signalId = signalRow.id;

      const logicalRow = await this.logicalRepo.insert(
        {
          signal_id: signalId,
          data_type: input.logical.dataType,
          min_value: input.logical.minValue,
          max_value: input.logical.maxValue,
          units: input.logical.units,
          description: input.logical.description,
          source_system: input.logical.sourceSystem,
          dest_system: input.logical.destSystem,
          refresh_rate_hz: input.logical.refreshRateHz,
          functional_category: input.logical.functionalCategory,
        },
        trx,
      );

      const transportRow = await this.transportRepo.insert(
        {
          signal_id: signalId,
          protocol_id: input.transport.protocolId as string,
          bus_id: input.transport.busId as string,
          protocol_attrs: input.transport.protocolAttrs as Record<string, unknown>,
          bit_offset: input.transport.bitOffset,
          bit_length: input.transport.bitLength,
          encoding: input.transport.encoding,
          scale_factor: input.transport.scaleFactor,
          offset_value: input.transport.offsetValue,
          byte_order: input.transport.byteOrder,
        },
        trx,
      );

      const physicalRow = await this.physicalRepo.insert(
        {
          signal_id: signalId,
          connector_id: input.physical.connectorId as string,
          pin_number: input.physical.pinNumber,
          cable_bundle_id: input.physical.cableBundleId as string,
          wire_gauge: input.physical.wireGauge,
          wire_color: input.physical.wireColor,
          wire_type: input.physical.wireType,
          max_length_m: input.physical.maxLengthM,
          shielding: input.physical.shielding,
        },
        trx,
      );

      return toSignalDomain(signalRow, logicalRow, transportRow, physicalRow);
    });
  }

  // -------------------------------------------------------------------------
  // getSignal — join signal with all three layers
  // -------------------------------------------------------------------------

  async getSignal(id: SignalId): Promise<Signal> {
    const signalRow = await this.signalRepo.findById(id as string);
    if (!signalRow) {
      throw new Error(`Signal not found: ${id}`);
    }

    const [logicalRow, transportRow, physicalRow] = await Promise.all([
      this.logicalRepo.findBySignalId(id as string),
      this.transportRepo.findBySignalId(id as string),
      this.physicalRepo.findBySignalId(id as string),
    ]);

    return toSignalDomain(signalRow, logicalRow, transportRow, physicalRow);
  }

  // -------------------------------------------------------------------------
  // updateSignal — optimistic locking via version column
  // -------------------------------------------------------------------------

  async updateSignal(id: SignalId, patch: SignalPatch): Promise<Signal> {
    return this.knex.transaction(async (trx) => {
      // Verify version for optimistic locking
      const existing = await this.signalRepo.findByIdWithVersion(
        id as string,
        patch.version,
        trx,
      );
      if (!existing) {
        // Check if the signal exists at all (to distinguish not-found from version conflict)
        const anyVersion = await this.signalRepo.findById(id as string, trx);
        if (!anyVersion) {
          throw new Error(`Signal not found: ${id}`);
        }
        throw new ConcurrentEditError(id as string, patch.version);
      }

      // Build signal update payload
      const signalUpdate: Record<string, unknown> = {
        updated_at: new Date(),
        version: patch.version + 1,
      };
      if (patch.name !== undefined) signalUpdate.name = patch.name;
      if (patch.status !== undefined) signalUpdate.status = patch.status;
      if (patch.criticality !== undefined) signalUpdate.criticality = patch.criticality;
      if (patch.updatedBy !== undefined) signalUpdate.updated_by = patch.updatedBy;

      const updatedSignal = await this.signalRepo.update(
        id as string,
        signalUpdate as Partial<SignalRow>,
        trx,
      );
      if (!updatedSignal) {
        throw new Error(`Failed to update signal: ${id}`);
      }

      // Optionally update layers
      let logicalRow: LogicalLayerRow | undefined;
      if (patch.logical) {
        const logicalUpdate: Record<string, unknown> = {};
        if (patch.logical.dataType !== undefined) logicalUpdate.data_type = patch.logical.dataType;
        if (patch.logical.minValue !== undefined) logicalUpdate.min_value = patch.logical.minValue;
        if (patch.logical.maxValue !== undefined) logicalUpdate.max_value = patch.logical.maxValue;
        if (patch.logical.units !== undefined) logicalUpdate.units = patch.logical.units;
        if (patch.logical.description !== undefined) logicalUpdate.description = patch.logical.description;
        if (patch.logical.sourceSystem !== undefined) logicalUpdate.source_system = patch.logical.sourceSystem;
        if (patch.logical.destSystem !== undefined) logicalUpdate.dest_system = patch.logical.destSystem;
        if (patch.logical.refreshRateHz !== undefined) logicalUpdate.refresh_rate_hz = patch.logical.refreshRateHz;
        if (patch.logical.functionalCategory !== undefined) logicalUpdate.functional_category = patch.logical.functionalCategory;

        if (Object.keys(logicalUpdate).length > 0) {
          const existing = await this.logicalRepo.findBySignalId(id as string, trx);
          if (existing) {
            logicalRow = await this.logicalRepo.update(existing.id, logicalUpdate as Partial<LogicalLayerRow>, trx);
          }
        }
      }
      if (!logicalRow) {
        logicalRow = await this.logicalRepo.findBySignalId(id as string, trx);
      }

      let transportRow: TransportLayerRow | undefined;
      if (patch.transport) {
        const transportUpdate: Record<string, unknown> = {};
        if (patch.transport.protocolId !== undefined) transportUpdate.protocol_id = patch.transport.protocolId;
        if (patch.transport.busId !== undefined) transportUpdate.bus_id = patch.transport.busId;
        if (patch.transport.protocolAttrs !== undefined) transportUpdate.protocol_attrs = patch.transport.protocolAttrs;
        if (patch.transport.bitOffset !== undefined) transportUpdate.bit_offset = patch.transport.bitOffset;
        if (patch.transport.bitLength !== undefined) transportUpdate.bit_length = patch.transport.bitLength;
        if (patch.transport.encoding !== undefined) transportUpdate.encoding = patch.transport.encoding;
        if (patch.transport.scaleFactor !== undefined) transportUpdate.scale_factor = patch.transport.scaleFactor;
        if (patch.transport.offsetValue !== undefined) transportUpdate.offset_value = patch.transport.offsetValue;
        if (patch.transport.byteOrder !== undefined) transportUpdate.byte_order = patch.transport.byteOrder;

        if (Object.keys(transportUpdate).length > 0) {
          const existing = await this.transportRepo.findBySignalId(id as string, trx);
          if (existing) {
            transportRow = await this.transportRepo.update(existing.id, transportUpdate as Partial<TransportLayerRow>, trx);
          }
        }
      }
      if (!transportRow) {
        transportRow = await this.transportRepo.findBySignalId(id as string, trx);
      }

      let physicalRow: PhysicalLayerRow | undefined;
      if (patch.physical) {
        const physicalUpdate: Record<string, unknown> = {};
        if (patch.physical.connectorId !== undefined) physicalUpdate.connector_id = patch.physical.connectorId;
        if (patch.physical.pinNumber !== undefined) physicalUpdate.pin_number = patch.physical.pinNumber;
        if (patch.physical.cableBundleId !== undefined) physicalUpdate.cable_bundle_id = patch.physical.cableBundleId;
        if (patch.physical.wireGauge !== undefined) physicalUpdate.wire_gauge = patch.physical.wireGauge;
        if (patch.physical.wireColor !== undefined) physicalUpdate.wire_color = patch.physical.wireColor;
        if (patch.physical.wireType !== undefined) physicalUpdate.wire_type = patch.physical.wireType;
        if (patch.physical.maxLengthM !== undefined) physicalUpdate.max_length_m = patch.physical.maxLengthM;
        if (patch.physical.shielding !== undefined) physicalUpdate.shielding = patch.physical.shielding;

        if (Object.keys(physicalUpdate).length > 0) {
          const existing = await this.physicalRepo.findBySignalId(id as string, trx);
          if (existing) {
            physicalRow = await this.physicalRepo.update(existing.id, physicalUpdate as Partial<PhysicalLayerRow>, trx);
          }
        }
      }
      if (!physicalRow) {
        physicalRow = await this.physicalRepo.findBySignalId(id as string, trx);
      }

      return toSignalDomain(updatedSignal, logicalRow, transportRow, physicalRow);
    });
  }

  // -------------------------------------------------------------------------
  // deleteSignal — CASCADE handled by DB, but report what was deleted
  // -------------------------------------------------------------------------

  async deleteSignal(id: SignalId): Promise<DeleteResult> {
    return this.knex.transaction(async (trx) => {
      // Check existence and gather layer info before deletion
      const signalRow = await this.signalRepo.findById(id as string, trx);
      if (!signalRow) {
        throw new Error(`Signal not found: ${id}`);
      }

      const [logicalRow, transportRow, physicalRow] = await Promise.all([
        this.logicalRepo.findBySignalId(id as string, trx),
        this.transportRepo.findBySignalId(id as string, trx),
        this.physicalRepo.findBySignalId(id as string, trx),
      ]);

      // DB CASCADE will delete layers, but we delete the signal row
      await this.signalRepo.delete(id as string, trx);

      return {
        signalId: id,
        layersDeleted: {
          logical: logicalRow !== undefined,
          transport: transportRow !== undefined,
          physical: physicalRow !== undefined,
        },
      };
    });
  }

  // -------------------------------------------------------------------------
  // validateCrossLayer — check consistency between all three layers
  // -------------------------------------------------------------------------

  async validateCrossLayer(id: SignalId): Promise<ValidationResult> {
    const signal = await this.getSignal(id);
    return this.crossLayerValidator.validate(signal);
  }

  // -------------------------------------------------------------------------
  // querySignals — filtering + pagination with total count
  // -------------------------------------------------------------------------

  async querySignals(
    filter: SignalFilter,
    pagination: Pagination,
  ): Promise<PaginatedResult<Signal>> {
    const queryFilter: SignalQueryFilter = {
      projectId: filter.projectId as string | undefined,
      status: filter.status,
      criticality: filter.criticality,
      nameSearch: filter.nameSearch,
    };

    const page = Math.max(1, pagination.page);
    const pageSize = Math.max(1, Math.min(pagination.pageSize, 200));
    const offset = (page - 1) * pageSize;
    const orderBy = pagination.sortBy ?? 'created_at';
    const orderDir = pagination.sortOrder ?? 'desc';

    const [total, signalRows] = await Promise.all([
      this.signalRepo.countWithFilter(queryFilter),
      this.signalRepo.findWithFilter(queryFilter, {
        limit: pageSize,
        offset,
        orderBy,
        orderDir,
      }),
    ]);

    // Fetch layers for each signal in parallel
    const signals = await Promise.all(
      signalRows.map(async (row) => {
        const [logicalRow, transportRow, physicalRow] = await Promise.all([
          this.logicalRepo.findBySignalId(row.id),
          this.transportRepo.findBySignalId(row.id),
          this.physicalRepo.findBySignalId(row.id),
        ]);
        return toSignalDomain(row, logicalRow, transportRow, physicalRow);
      }),
    );

    return {
      data: signals,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // -------------------------------------------------------------------------
  // bulkImport — map raw records to normalized schema and create signals
  // -------------------------------------------------------------------------

  async bulkImport(
    records: Record<string, unknown>[],
    fieldMapping: FieldMapping,
  ): Promise<BulkImportResult> {
    // Determine which mapped target fields are unknown
    const unmappedFields: string[] = [];
    const validMappings: Record<string, string> = {};

    for (const [sourceField, targetField] of Object.entries(fieldMapping)) {
      if (KNOWN_SCHEMA_FIELDS.has(targetField)) {
        validMappings[sourceField] = targetField;
      } else {
        unmappedFields.push(sourceField);
      }
    }

    // Also collect source fields present in records but absent from the mapping
    const mappedSourceFields = new Set(Object.keys(fieldMapping));
    for (const record of records) {
      for (const key of Object.keys(record)) {
        if (!mappedSourceFields.has(key) && !unmappedFields.includes(key)) {
          unmappedFields.push(key);
        }
      }
    }

    let createdCount = 0;
    const errors: BulkImportRecordError[] = [];

    for (let i = 0; i < records.length; i++) {
      try {
        const input = this.mapRecordToCreateInput(records[i]!, validMappings);
        await this.createSignal(input);
        createdCount++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ index: i, error: message });
      }
    }

    return {
      createdCount,
      failedCount: errors.length,
      unmappedFields,
      errors,
    };
  }

  // -------------------------------------------------------------------------
  // mapRecordToCreateInput — apply field mapping to a single raw record
  // -------------------------------------------------------------------------

  private mapRecordToCreateInput(
    record: Record<string, unknown>,
    validMappings: Record<string, string>,
  ): CreateSignalInput {
    const flat: Record<string, unknown> = {};

    for (const [sourceField, targetField] of Object.entries(validMappings)) {
      if (sourceField in record) {
        flat[targetField] = record[sourceField];
      }
    }

    return {
      name: (flat['name'] as string) ?? '',
      projectId: (flat['projectId'] as ProjectId) ?? ('' as ProjectId),
      status: flat['status'] as SignalStatus | undefined,
      criticality: flat['criticality'] as Criticality | undefined,
      createdBy: flat['createdBy'] as UserId | undefined,
      logical: {
        dataType: (flat['logical.dataType'] as string) ?? '',
        minValue: (flat['logical.minValue'] as number) ?? null,
        maxValue: (flat['logical.maxValue'] as number) ?? null,
        units: (flat['logical.units'] as string) ?? '',
        description: (flat['logical.description'] as string) ?? '',
        sourceSystem: (flat['logical.sourceSystem'] as string) ?? '',
        destSystem: (flat['logical.destSystem'] as string) ?? '',
        refreshRateHz: (flat['logical.refreshRateHz'] as number) ?? 0,
        functionalCategory: (flat['logical.functionalCategory'] as string) ?? '',
      },
      transport: {
        protocolId: (flat['transport.protocolId'] as import('@connectedicd/shared-types').ProtocolId) ?? ('' as import('@connectedicd/shared-types').ProtocolId),
        busId: (flat['transport.busId'] as import('@connectedicd/shared-types').BusId) ?? ('' as import('@connectedicd/shared-types').BusId),
        protocolAttrs: (flat['transport.protocolAttrs'] as Record<string, unknown>) ?? {},
        bitOffset: (flat['transport.bitOffset'] as number) ?? 0,
        bitLength: (flat['transport.bitLength'] as number) ?? 0,
        encoding: (flat['transport.encoding'] as Encoding) ?? 'unsigned',
        scaleFactor: (flat['transport.scaleFactor'] as number) ?? 1,
        offsetValue: (flat['transport.offsetValue'] as number) ?? 0,
        byteOrder: (flat['transport.byteOrder'] as ByteOrder) ?? 'big_endian',
      },
      physical: {
        connectorId: (flat['physical.connectorId'] as import('@connectedicd/shared-types').ConnectorId) ?? ('' as import('@connectedicd/shared-types').ConnectorId),
        pinNumber: (flat['physical.pinNumber'] as string) ?? '',
        cableBundleId: (flat['physical.cableBundleId'] as import('@connectedicd/shared-types').CableBundleId) ?? ('' as import('@connectedicd/shared-types').CableBundleId),
        wireGauge: (flat['physical.wireGauge'] as string) ?? '',
        wireColor: (flat['physical.wireColor'] as string) ?? '',
        wireType: (flat['physical.wireType'] as string) ?? '',
        maxLengthM: (flat['physical.maxLengthM'] as number) ?? 0,
        shielding: (flat['physical.shielding'] as string) ?? '',
      },
    };
  }
}
