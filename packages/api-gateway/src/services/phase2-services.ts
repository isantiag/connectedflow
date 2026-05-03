/**
 * Phase 2 services — Device Templates, Allocations, ICD Export, SysML Export.
 * §1 Backend: All business logic here, NOT in route handlers.
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { Knex } from 'knex';

// ============================================================
// Zod Schemas — §2 Backend: .strict() on every input
// ============================================================

export const CreateDeviceTemplateSchema = z.object({
  name: z.string().min(1),
  part_number: z.string().min(1),
  manufacturer: z.string().default(''),
  system_type: z.string().default('lru'),
  description: z.string().default(''),
  profile_data: z.record(z.unknown()).default({}),
  ports: z.array(z.object({
    name: z.string().min(1),
    direction: z.string().default('tx'),
    protocol_id: z.string().uuid().optional(),
    connector_label: z.string().default(''),
  }).strict()).default([]),
  functions: z.array(z.object({
    name: z.string().min(1),
    description: z.string().default(''),
    criticality: z.string().default('major'),
    dal: z.string().default(''),
  }).strict()).default([]),
}).strict();

export const InstantiateTemplateSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1),
  parent_system_id: z.string().uuid().nullable().optional(),
}).strict();

export const CreateAllocationSchema = z.object({
  project_id: z.string().uuid(),
  source_canonical_id: z.string().min(1),
  target_canonical_id: z.string().min(1),
  allocation_type: z.enum(['functional', 'logical', 'physical', 'resource', 'specifies', 'failure_mode']),
  source_product: z.string().default('connectedicd'),
  target_product: z.string().default('connectedicd'),
  rationale: z.string().default(''),
}).strict();

export const AllocationQuerySchema = z.object({
  projectId: z.string().uuid(),
  sourceCanonicalId: z.string().optional(),
  targetCanonicalId: z.string().optional(),
  allocationType: z.string().optional(),
}).strict();

export const IcdExportQuerySchema = z.object({
  systemA: z.string().uuid(),
  systemB: z.string().uuid(),
  format: z.enum(['json', 'csv']),
}).strict();

export const SysmlExportQuerySchema = z.object({
  projectId: z.string().uuid(),
  format: z.enum(['json', 'sysmlv2']),
}).strict();

// ============================================================
// Device Template Service
// ============================================================

export function createDeviceTemplateService(db: Knex) {
  return {
    async create(input: z.infer<typeof CreateDeviceTemplateSchema>) {
      const { ports, functions, ...templateData } = input;
      const id = uuidv4();

      await db.transaction(async (trx) => {
        await trx('device_template').insert({ id, ...templateData });
        if (ports.length > 0) {
          await trx('device_template_port').insert(
            ports.map((p) => ({ id: uuidv4(), template_id: id, ...p })),
          );
        }
        if (functions.length > 0) {
          await trx('device_template_function').insert(
            functions.map((f) => ({ id: uuidv4(), template_id: id, ...f })),
          );
        }
      });

      return this.getById(id);
    },

    async list() {
      return db('device_template').orderBy('name');
    },

    async getById(id: string) {
      const template = await db('device_template').where('id', id).first();
      if (!template) return null;
      const ports = await db('device_template_port').where('template_id', id).orderBy('name');
      const functions = await db('device_template_function').where('template_id', id).orderBy('name');
      return { ...template, ports, functions };
    },

    async instantiate(templateId: string, input: z.infer<typeof InstantiateTemplateSchema>) {
      const template = await this.getById(templateId);
      if (!template) return null;

      const systemId = uuidv4();
      const canonicalId = `ee-aero.sys.${systemId.substring(0, 8)}`;

      await db.transaction(async (trx) => {
        await trx('system').insert({
          id: systemId,
          project_id: input.project_id,
          name: input.name,
          description: template.description || '',
          manufacturer: template.manufacturer || '',
          part_number: template.part_number || '',
          system_type: template.system_type || 'lru',
          canonical_id: canonicalId,
          parent_system_id: input.parent_system_id ?? null,
          template_id: templateId,
          profile_data: template.profile_data || {},
        });

        if (template.ports.length > 0) {
          await trx('system_port').insert(
            template.ports.map((p: any) => ({
              id: uuidv4(),
              system_id: systemId,
              name: p.name,
              direction: p.direction || 'tx',
              protocol_id: p.protocol_id || null,
              connector_label: p.connector_label || '',
            })),
          );
        }

        if (template.functions.length > 0) {
          await trx('system_function').insert(
            template.functions.map((f: any) => ({
              id: uuidv4(),
              system_id: systemId,
              name: f.name,
              description: f.description || '',
              criticality: f.criticality || 'major',
              dal: f.dal || '',
            })),
          );
        }
      });

      return db('system').where('id', systemId).first();
    },
  };
}

// ============================================================
// Allocation Service
// ============================================================

export function createAllocationService(db: Knex) {
  return {
    async create(input: z.infer<typeof CreateAllocationSchema>) {
      const [row] = await db('allocation').insert({ id: uuidv4(), ...input }).returning('*');
      return row;
    },

    async list(query: z.infer<typeof AllocationQuerySchema>) {
      let q = db('allocation').where('project_id', query.projectId);
      if (query.sourceCanonicalId) q = q.where('source_canonical_id', query.sourceCanonicalId);
      if (query.targetCanonicalId) q = q.where('target_canonical_id', query.targetCanonicalId);
      if (query.allocationType) q = q.where('allocation_type', query.allocationType);
      return q.orderBy('created_at');
    },

    async remove(id: string) {
      const count = await db('allocation').where('id', id).del();
      return { deleted: count > 0 };
    },
  };
}

// ============================================================
// ICD Export Service
// ============================================================

export function createIcdExportService(db: Knex) {
  return {
    async generate(systemAId: string, systemBId: string) {
      // Get systems
      const [systemA, systemB] = await Promise.all([
        db('system').where('id', systemAId).first(),
        db('system').where('id', systemBId).first(),
      ]);
      if (!systemA || !systemB) return null;

      // Get project
      const project = await db('project').where('id', systemA.project_id).first();

      // Get ports for both systems
      const portsA = await db('system_port').where('system_id', systemAId).select('id');
      const portsB = await db('system_port').where('system_id', systemBId).select('id');
      const portIdsA = portsA.map((p: any) => p.id);
      const portIdsB = portsB.map((p: any) => p.id);

      if (portIdsA.length === 0 || portIdsB.length === 0) {
        return { cover: { systemA: systemA.name, systemB: systemB.name, project: project?.name || '', date: new Date().toISOString() }, sections: [], signals: [] };
      }

      // Connections between A→B and B→A
      const connections = await db('connection')
        .where(function () {
          this.whereIn('source_port_id', portIdsA).whereIn('dest_port_id', portIdsB);
        })
        .orWhere(function () {
          this.whereIn('source_port_id', portIdsB).whereIn('dest_port_id', portIdsA);
        });

      if (connections.length === 0) {
        return { cover: { systemA: systemA.name, systemB: systemB.name, project: project?.name || '', date: new Date().toISOString() }, sections: [], signals: [] };
      }

      const connIds = connections.map((c: any) => c.id);
      const messages = await db('message').whereIn('connection_id', connIds);
      const msgIds = messages.map((m: any) => m.id);
      const parameters = msgIds.length > 0 ? await db('parameter').whereIn('message_id', msgIds) : [];

      // Get protocols
      const protocolIds = [...new Set(connections.map((c: any) => c.protocol_id))];
      const protocols = protocolIds.length > 0
        ? await db('protocol_definition').whereIn('id', protocolIds)
        : [];
      const protocolMap = Object.fromEntries(protocols.map((p: any) => [p.id, p]));

      // Group by protocol
      const sections = protocols.map((proto: any) => {
        const protoConns = connections.filter((c: any) => c.protocol_id === proto.id);
        const protoConnIds = protoConns.map((c: any) => c.id);
        const protoMsgs = messages.filter((m: any) => protoConnIds.includes(m.connection_id));
        const protoMsgIds = protoMsgs.map((m: any) => m.id);
        const protoParams = parameters.filter((p: any) => protoMsgIds.includes(p.message_id));
        return {
          protocol: proto.protocol_name,
          connections: protoConns.length,
          messages: protoMsgs.map((m: any) => ({
            id: m.id,
            name: m.name,
            message_id_primary: m.message_id_primary,
            direction: m.direction,
            refresh_rate_hz: m.refresh_rate_hz,
            parameters: protoParams
              .filter((p: any) => p.message_id === m.id)
              .map((p: any) => ({
                name: p.name,
                bit_offset: p.bit_offset,
                bit_length: p.bit_length,
                encoding: p.encoding,
                units: p.units,
                min_value: p.min_value,
                max_value: p.max_value,
                resolution: p.resolution,
              })),
          })),
        };
      });

      // Flat signal list for CSV
      const signals: any[] = [];
      for (const msg of messages) {
        const conn = connections.find((c: any) => c.id === msg.connection_id);
        const proto = conn ? protocolMap[conn.protocol_id] : null;
        const msgParams = parameters.filter((p: any) => p.message_id === msg.id);
        for (const param of msgParams) {
          signals.push({
            signal_name: param.name,
            source: systemA.name,
            destination: systemB.name,
            protocol: proto?.protocol_name || '',
            data_type: param.encoding,
            units: param.units,
            rate_hz: msg.refresh_rate_hz,
            bit_position: param.bit_offset,
            encoding: param.encoding,
          });
        }
      }

      return {
        cover: {
          systemA: systemA.name,
          systemB: systemB.name,
          project: project?.name || '',
          date: new Date().toISOString(),
        },
        sections,
        signals,
      };
    },

    toCsv(signals: any[]): string {
      const header = 'signal_name,source,destination,protocol,data_type,units,rate_hz,bit_position,encoding';
      const rows = signals.map((s: any) =>
        [s.signal_name, s.source, s.destination, s.protocol, s.data_type, s.units, s.rate_hz ?? '', s.bit_position ?? '', s.encoding].join(','),
      );
      return [header, ...rows].join('\n');
    },
  };
}

// ============================================================
// SysML Export Service
// ============================================================

export function createSysmlExportService(db: Knex) {
  return {
    async exportJson(projectId: string) {
      const systems = await db('system').where('project_id', projectId);
      const systemIds = systems.map((s: any) => s.id);

      const ports = systemIds.length > 0
        ? await db('system_port').whereIn('system_id', systemIds)
        : [];

      const connections = await db('connection').where('project_id', projectId);

      const busInstances = await db('bus_instance').where('project_id', projectId);

      // Map to SysML-like structure
      const blocks = systems.map((s: any) => ({
        id: s.canonical_id || s.id,
        name: s.name,
        type: 'Block',
        stereotype: s.system_type,
        ports: ports
          .filter((p: any) => p.system_id === s.id)
          .map((p: any) => ({
            id: p.id,
            name: p.name,
            direction: p.direction,
            type: 'FlowPort',
          })),
      }));

      const connectors = connections.map((c: any) => ({
        id: c.id,
        name: c.name,
        source_port: c.source_port_id,
        target_port: c.dest_port_id,
        type: 'Connector',
      }));

      return {
        format: 'sysml-json',
        project_id: projectId,
        exported_at: new Date().toISOString(),
        model: { blocks, connectors, bus_instances: busInstances },
      };
    },
  };
}
