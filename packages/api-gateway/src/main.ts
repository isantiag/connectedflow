/**
 * ConnectedICD API — standalone entry point.
 * §1 Backend: Thin bootstrap only — all routes and logic in server.ts + services.
 */
import { createServer } from './server.js';
import { SystemHierarchyService } from '@connectedicd/core-services/src/services/system-hierarchy-service.js';

const knex = require('knex');
const PORT = parseInt(process.env.PORT ?? '4001');
const DB_URL = process.env.DATABASE_URL ?? 'postgres://connectedflow:connectedflow_dev@localhost:5434/connectedflow';

async function main() {
  // --- Database ---
  const db = knex({ client: 'pg', connection: DB_URL, pool: { min: 2, max: 10 } });
  try { await db.raw('SELECT 1'); console.log('Database connected'); }
  catch (e: any) { console.error('Database connection failed:', e.message); process.exit(1); }

  // --- Minimal service adapters wrapping Knex for the ServiceContainer interface ---
  const signalService = {
    findAll: async (opts: any) => {
      let q = db('signal').leftJoin('logical_layer', 'signal.id', 'logical_layer.signal_id')
        .leftJoin('transport_layer', 'signal.id', 'transport_layer.signal_id')
        .select('signal.*', 'logical_layer.source_system', 'logical_layer.dest_system',
          'logical_layer.data_type', 'logical_layer.units', 'logical_layer.refresh_rate_hz',
          'logical_layer.range_min', 'logical_layer.range_max', 'transport_layer.protocol');
      if (opts?.projectId) q = q.where('signal.project_id', opts.projectId);
      if (opts?.status) q = q.where('signal.status', opts.status);
      return q.limit(500);
    },
    findById: async (id: string) => db('signal')
      .leftJoin('logical_layer', 'signal.id', 'logical_layer.signal_id')
      .leftJoin('transport_layer', 'signal.id', 'transport_layer.signal_id')
      .leftJoin('physical_layer', 'signal.id', 'physical_layer.signal_id')
      .where('signal.id', id).first(),
    create: async (data: any) => {
      const [signal] = await db('signal').insert({ name: data.name, project_id: data.projectId ?? 'default', criticality: data.criticality ?? 'major', status: data.status ?? 'draft' }).returning('*');
      if (data.logical) await db('logical_layer').insert({ signal_id: signal.id, ...data.logical });
      if (data.transport) await db('transport_layer').insert({ signal_id: signal.id, ...data.transport });
      if (data.physical) await db('physical_layer').insert({ signal_id: signal.id, ...data.physical });
      return signal;
    },
  };

  const baselineService = {
    findAll: async () => db('baseline').orderBy('created_at', 'desc'),
    create: async (data: any) => { const [b] = await db('baseline').insert(data).returning('*'); return b; },
    freeze: async (id: string) => db('baseline').where('id', id).update({ status: 'frozen', frozen_at: new Date() }).returning('*'),
  };

  const workflowService = {
    findAll: async () => db('change_request').orderBy('created_at', 'desc'),
    create: async (data: any) => { const [w] = await db('change_request').insert(data).returning('*'); return w; },
  };

  const auditService = {
    findAll: async (opts: any) => db('audit_entry').orderBy('timestamp', 'desc').limit(opts?.limit ?? 50),
  };

  const rbacService = {
    checkPermission: async () => true,
    requirePermission: async () => {},
  };

  // --- System Hierarchy Service ---
  const systemHierarchyService = new SystemHierarchyService(db);

  // --- Server (all routes registered in server.ts) ---
  const app = await createServer({
    signalService, baselineService, workflowService, auditService, rbacService,
    systemHierarchyService,
    db,
  } as any);

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`ConnectedICD API running on http://localhost:${PORT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
