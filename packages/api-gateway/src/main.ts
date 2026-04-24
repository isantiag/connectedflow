/**
 * ConnectedICD API — standalone entry point.
 * Boots Fastify with all services connected to PostgreSQL.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import knex from 'knex';

const PORT = parseInt(process.env.PORT ?? '4001');
const DB_URL = process.env.DATABASE_URL ?? 'postgres://connectedflow:connectedflow_dev@localhost:5434/connectedflow';

async function main() {
  // Database
  const db = knex({ client: 'pg', connection: DB_URL, pool: { min: 2, max: 10 } });
  try { await db.raw('SELECT 1'); console.log('✅ Database connected'); }
  catch (e: any) { console.error('❌ Database connection failed:', e.message); process.exit(1); }

  // Fastify
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  // Health
  app.get('/health', async () => ({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() }));

  // ── Signal routes ──────────────────────────────────────────────
  app.get('/api/signals', async (req) => {
    const q = req.query as any;
    let query = db('signal').leftJoin('logical_layer', 'signal.id', 'logical_layer.signal_id').leftJoin('transport_layer', 'signal.id', 'transport_layer.signal_id').select('signal.*', 'logical_layer.source_system', 'logical_layer.dest_system', 'logical_layer.data_type', 'logical_layer.units', 'logical_layer.refresh_rate_hz', 'logical_layer.range_min', 'logical_layer.range_max', 'transport_layer.protocol');
    if (q.projectId) query = query.where('signal.project_id', q.projectId);
    if (q.status) query = query.where('signal.status', q.status);
    return query.limit(500);
  });

  app.get<{ Params: { id: string } }>('/api/signals/:id', async (req) => {
    return db('signal').leftJoin('logical_layer', 'signal.id', 'logical_layer.signal_id').leftJoin('transport_layer', 'signal.id', 'transport_layer.signal_id').leftJoin('physical_layer', 'signal.id', 'physical_layer.signal_id').where('signal.id', req.params.id).first();
  });

  app.post('/api/signals', async (req, reply) => {
    const body = req.body as any;
    const [signal] = await db('signal').insert({ name: body.name, project_id: body.projectId ?? 'default', criticality: body.criticality ?? 'major', status: body.status ?? 'draft' }).returning('*');
    if (body.logical) await db('logical_layer').insert({ signal_id: signal.id, ...body.logical });
    if (body.transport) await db('transport_layer').insert({ signal_id: signal.id, ...body.transport });
    if (body.physical) await db('physical_layer').insert({ signal_id: signal.id, ...body.physical });
    reply.status(201);
    return signal;
  });

  // ── Baselines ──────────────────────────────────────────────────
  app.get('/api/baselines', async () => db('baseline').orderBy('created_at', 'desc'));
  app.post('/api/baselines', async (req, reply) => { const [b] = await db('baseline').insert(req.body as any).returning('*'); reply.status(201); return b; });
  app.post<{ Params: { id: string } }>('/api/baselines/:id/freeze', async (req) => db('baseline').where('id', req.params.id).update({ status: 'frozen', frozen_at: new Date() }).returning('*'));

  // ── Workflows ──────────────────────────────────────────────────
  app.get('/api/workflows', async () => db('change_request').orderBy('created_at', 'desc'));
  app.post('/api/workflows', async (req, reply) => { const [w] = await db('change_request').insert(req.body as any).returning('*'); reply.status(201); return w; });

  // ── Audit ──────────────────────────────────────────────────────
  app.get('/api/audit', async (req) => { const limit = (req.query as any).limit ?? 50; return db('audit_entry').orderBy('timestamp', 'desc').limit(limit); });

  // ── N² Matrix ──────────────────────────────────────────────────
  app.get('/api/n2-matrix', async (req) => {
    const signals = await db('signal').leftJoin('logical_layer', 'signal.id', 'logical_layer.signal_id').leftJoin('transport_layer', 'signal.id', 'transport_layer.signal_id').select('signal.*', 'logical_layer.source_system', 'logical_layer.dest_system', 'transport_layer.protocol');
    const systemSet = new Set<string>();
    const cellMap = new Map<string, { count: number; status: string }>();
    for (const s of signals) {
      if (s.source_system) systemSet.add(s.source_system);
      if (s.dest_system) systemSet.add(s.dest_system);
      if (s.source_system && s.dest_system) {
        const key = `${s.source_system}→${s.dest_system}`;
        const cell = cellMap.get(key) ?? { count: 0, status: 'green' };
        cell.count++;
        cellMap.set(key, cell);
      }
    }
    return { systems: Array.from(systemSet).sort(), cells: Array.from(cellMap.entries()).map(([k, v]) => ({ interface: k, ...v })), totalSignals: signals.length };
  });

  // ── Collaboration ──────────────────────────────────────────────
  app.get<{ Params: { signalId: string } }>('/api/signals/:signalId/comments', async (req) => db('signal_comment').where('signal_id', req.params.signalId).orderBy('created_at'));
  app.post<{ Params: { signalId: string } }>('/api/signals/:signalId/comments', async (req, reply) => { const [c] = await db('signal_comment').insert({ ...(req.body as any), signal_id: req.params.signalId, id: require('crypto').randomUUID().replace(/-/g, '').slice(0, 26) }).returning('*'); reply.status(201); return c; });
  app.get('/api/handshakes/pending', async () => db('signal_ownership').whereNot('handshake_status', 'approved'));
  app.get('/api/organizations', async () => db('organization').orderBy('name'));

  // ── Notifications ──────────────────────────────────────────────
  app.get('/api/notifications', async (req) => { const userId = (req.query as any).userId; return userId ? db('notification').where('recipient_id', userId).orderBy('created_at', 'desc').limit(20) : db('notification').orderBy('created_at', 'desc').limit(20); });

  // ── AI Analysis (proxy to Python service or inline) ────────────
  app.get('/api/ai/providers', async () => ({ available: ['claude', 'gemini'] }));

  // Start
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🚀 ConnectedICD API running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Signals: http://localhost:${PORT}/api/signals`);
}

main().catch(console.error);
