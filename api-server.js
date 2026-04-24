#!/usr/bin/env node
/**
 * ConnectedICD API — standalone server.
 * Run: node api-server.js
 */
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const knex = require('knex');

const PORT = process.env.PORT || 4001;
const DB_URL = process.env.DATABASE_URL || 'postgres://connectedflow:connectedflow_dev@localhost:5434/connectedflow';
const schemas = require('./packages/schemas/src/index.js');

const db = knex({ client: 'pg', connection: DB_URL, pool: { min: 1, max: 5 } });

// Zod validation helper — standard error envelope
function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message, code: i.code }));
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Input validation failed', details } };
  }
  return { ok: true, data: result.data };
}

async function start() {
  const app = Fastify();
  await app.register(cors, { origin: true });

  app.get('/health', async () => ({ status: 'ok', db: 'connected' }));

  app.get('/ready', async (req, reply) => {
    try {
      await db.raw('SELECT 1');
      return { ready: true, db: 'connected', version: '1.0.0', timestamp: new Date().toISOString() };
    } catch {
      reply.status(503);
      return { ready: false, db: 'disconnected' };
    }
  });

  // ============================================================
  // Auth & RBAC — AuthProvider interface (Foundation #2)
  // Swap EmailPasswordProvider for SamlProvider/OidcProvider later.
  // ============================================================

  const { EmailPasswordProvider, hasPermission } = require('./services/auth-provider');
  const authProvider = new EmailPasswordProvider(db, {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
  const LOCAL_MODE = authProvider.localMode;

  // Auth middleware — delegates to provider
  async function authenticate(req) {
    return authProvider.getUser(req);
  }

  function getSession(req) {
    return req._authUser || null;
  }

  // hasPermission — from auth-provider.js

  // Auth hook — runs before every request
  app.addHook('onRequest', async (req) => {
    req._authUser = await authenticate(req);
  });

  // Audit logging for mutations
  app.addHook('onResponse', async (req, reply) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && !req.url.includes('/auth/login')) {
      await db('audit_entry').insert({
        user_id: req._authUser?.userId || 'anonymous',
        entity_type: req.url.split('/')[2] || 'unknown',
        entity_id: req.params?.id || 'n/a',
        action: req.method.toLowerCase(),
        before_state: null,
        after_state: { status: reply.statusCode },
      }).catch(() => {});
    }
  });

  // Login
  app.post('/api/auth/login', async (req, reply) => {
    const v = validate(schemas.LoginSchema, req.body); if (!v.ok) return reply.status(422).send(v.error);
    const result = await authProvider.login(v.data.email, v.data.password);
    if (result.error) return reply.status(result.status || 401).send({ error: { code: 'AUTH_FAILED', message: result.error } });
    return result;
  });

  app.get('/api/auth/me', async (req, reply) => {
    const user = getSession(req);
    if (!user) return reply.status(401).send({ error: 'Not authenticated' });
    return user;
  });

  app.put('/api/auth/password', async (req, reply) => {
    const user = getSession(req);
    if (!user) return reply.status(401).send({ error: 'Not authenticated' });
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return reply.status(400).send({ error: 'Password must be at least 6 characters' });
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      return reply.status(400).send({ error: 'Password must contain uppercase, lowercase, digit, and special character' });
    }
    const dbUser = await db('user').where('id', user.userId).first();
    if (dbUser.password_hash && currentPassword) {
      const valid = await bcrypt.compare(currentPassword, dbUser.password_hash);
      if (!valid) return reply.status(401).send({ error: 'Current password is incorrect' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await db('user').where('id', user.userId).update({ password_hash: hash });
    return { ok: true };
  });

  app.post('/api/auth/logout', async () => ({ ok: true }));

  // API Keys
  app.post('/api/auth/api-keys', async (req, reply) => {
    const user = getSession(req);
    if (!user) return reply.status(401).send({ error: 'Not authenticated' });
    const label = req.body.label || 'default';
    const rawKey = 'cicd_' + crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 12) + '...';
    await db('api_key').insert({ user_id: user.userId, key_hash: keyHash, key_prefix: keyPrefix, label });
    return { key: rawKey, prefix: keyPrefix, label, message: 'Save this key — it will not be shown again.' };
  });

  app.get('/api/auth/api-keys', async (req, reply) => {
    const user = getSession(req);
    if (!user) return reply.status(401).send({ error: 'Not authenticated' });
    return db('api_key').where({ user_id: user.userId, revoked: false }).select('id', 'key_prefix', 'label', 'created_at');
  });

  app.delete('/api/auth/api-keys/:id', async (req, reply) => {
    const user = getSession(req);
    if (!user) return reply.status(401).send({ error: 'Not authenticated' });
    await db('api_key').where({ id: req.params.id, user_id: user.userId }).update({ revoked: true });
    reply.status(204).send();
  });

  // User management (admin only)
  app.get('/api/users', async (req, reply) => {
    const users = await db('user').orderBy('display_name');
    return users.map(u => ({ id: u.id, email: u.email, displayName: u.display_name, role: u.role || 'viewer', lastLogin: u.last_login, createdAt: u.created_at }));
  });

  app.post('/api/users', async (req, reply) => {
    const user = getSession(req);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'Admin only' });
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) return reply.status(400).send({ error: 'email, password, displayName required' });
    const hash = await bcrypt.hash(password, 10);
    const [newUser] = await db('user').insert({ email, display_name: displayName, password_hash: hash, auth_provider: 'local' }).returning('*');
    reply.status(201);
    return { id: newUser.id, email: newUser.email, displayName: newUser.display_name };
  });

  app.put('/api/users/:id/password', async (req, reply) => {
    const user = getSession(req);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'Admin only' });
    const { newPassword } = req.body;
    if (!newPassword) return reply.status(400).send({ error: 'newPassword required' });
    const hash = await bcrypt.hash(newPassword, 10);
    await db('user').where('id', req.params.id).update({ password_hash: hash });
    return { ok: true };
  });

  app.get('/api/roles', async () => db('role').orderBy('name'));

  // Projects
  app.get('/api/projects', async () => db('project').orderBy('updated_at', 'desc'));

  app.post('/api/projects', async (req, reply) => {
    const v = validate(schemas.CreateProjectSchema, req.body); if (!v.ok) return reply.status(422).send(v.error);
    const b = v.data;
    const [proj] = await db('project').insert({ name: b.name, aircraft_type: b.aircraft_type || '', certification_basis: b.certification_basis || '', program_phase: b.program_phase || 'concept' }).returning('*');
    reply.status(201); return proj;
  });

  app.get('/api/projects/:id', async (req) => db('project').where('id', req.params.id).first());

  app.put('/api/projects/:id', async (req, reply) => {
    const v = validate(schemas.UpdateProjectSchema, req.body); if (!v.ok) return reply.status(422).send(v.error);
    const b = v.data;
    const [proj] = await db('project').where('id', req.params.id).update({ name: b.name, aircraft_type: b.aircraft_type, certification_basis: b.certification_basis, program_phase: b.program_phase, updated_at: db.fn.now() }).returning('*');
    return proj;
  });

  app.delete('/api/projects/:id', async (req, reply) => {
    await db('project').where('id', req.params.id).del();
    reply.status(204).send();
  });

  // Dashboard stats
  app.get('/api/dashboard', async (req) => {
    const projectId = req.query.projectId || (await db('project').first('id'))?.id;
    if (!projectId) return { systems: 0, connections: 0, messages: 0, parameters: 0, protocols: 0, signals: 0 };
    const systems = await db('system').where('project_id', projectId).count('* as c').first();
    const sysIds = (await db('system').where('project_id', projectId).select('id')).map(s => s.id);
    const portIds = sysIds.length ? (await db('system_port').whereIn('system_id', sysIds).select('id')).map(p => p.id) : [];
    const connections = portIds.length ? await db('connection').where('project_id', projectId).count('* as c').first() : { c: 0 };
    const connIds = portIds.length ? (await db('connection').where('project_id', projectId).select('id')).map(c => c.id) : [];
    const messages = connIds.length ? await db('message').whereIn('connection_id', connIds).count('* as c').first() : { c: 0 };
    const msgIds = connIds.length ? (await db('message').whereIn('connection_id', connIds).select('id')).map(m => m.id) : [];
    const parameters = msgIds.length ? await db('parameter').whereIn('message_id', msgIds).count('* as c').first() : { c: 0 };
    const protoCount = connIds.length ? (await db('connection').where('project_id', projectId).countDistinct('protocol_id as c').first()) : { c: 0 };
    const signals = await db('signal').where('project_id', projectId).count('* as c').first();
    // Bus type breakdown
    const busBreakdown = connIds.length ? await db('connection').where('project_id', projectId).join('protocol_definition', 'connection.protocol_id', 'protocol_definition.id').select('protocol_definition.protocol_name').count('* as count').groupBy('protocol_definition.protocol_name').orderBy('count', 'desc') : [];
    // Recent activity (from audit or just recent entities)
    const recentSystems = await db('system').where('project_id', projectId).orderBy('created_at', 'desc').limit(5).select('name', 'created_at');
    return {
      systems: parseInt(systems.c), connections: parseInt(connections.c), messages: parseInt(messages.c),
      parameters: parseInt(parameters.c), protocols: parseInt(protoCount.c), signals: parseInt(signals.c),
      busBreakdown: busBreakdown.map(b => ({ protocol: b.protocol_name, count: parseInt(b.count) })),
      recentSystems: recentSystems.map(s => ({ name: s.name, time: s.created_at })),
    };
  });

  // Signals
  app.get('/api/signals', async (req) => {
    const q = req.query;
    let query = db('signal').leftJoin('logical_layer', 'signal.id', 'logical_layer.signal_id').leftJoin('transport_layer', 'signal.id', 'transport_layer.signal_id').select('signal.*', 'logical_layer.source_system', 'logical_layer.dest_system', 'logical_layer.data_type', 'logical_layer.units', 'logical_layer.refresh_rate_hz', 'transport_layer.protocol_id as protocol');
    if (q.projectId) query = query.where('signal.project_id', q.projectId);
    return query.limit(500);
  });

  app.post('/api/signals', async (req, reply) => {
    const b = req.body;
    const [sig] = await db('signal').insert({ name: b.name, project_id: b.projectId, criticality: b.criticality || 'major', status: b.status || 'draft' }).returning('*');
    if (b.logical) await db('logical_layer').insert({ signal_id: sig.id, source_system: b.logical.source_system || '', dest_system: b.logical.dest_system || '', data_type: b.logical.data_type || '', units: b.logical.units || '', description: '', refresh_rate_hz: b.logical.refresh_rate_hz || 0, functional_category: '' }).catch(() => {});
    if (b.transport) await db('transport_layer').insert({ signal_id: sig.id, protocol: b.transport.protocol || '' }).catch(() => {});
    reply.status(201); return sig;
  });

  // N2 Matrix (legacy)
  app.get('/api/n2-matrix', async () => {
    const sigs = await db('signal').leftJoin('logical_layer', 'signal.id', 'logical_layer.signal_id').select('signal.name', 'logical_layer.source_system', 'logical_layer.dest_system');
    const systems = new Set(); const cells = new Map();
    sigs.forEach(s => { if (s.source_system) systems.add(s.source_system); if (s.dest_system) systems.add(s.dest_system); if (s.source_system && s.dest_system) { const k = s.source_system + '→' + s.dest_system; cells.set(k, (cells.get(k) || 0) + 1); } });
    return { systems: [...systems].sort(), cells: [...cells.entries()].map(([k, v]) => ({ interface: k, count: v })), totalSignals: sigs.length };
  });

  // N2 Matrix v2 (new hierarchy)
  app.get('/api/n2-matrix-v2', async (req) => {
    const projectId = req.query.projectId || (await db('project').first('id'))?.id;
    if (!projectId) return { systems: [], cells: [] };
    const systems = await db('system').where('project_id', projectId).orderBy('name');
    const sysMap = new Map(systems.map(s => [s.id, s.name]));
    const connections = await db('connection').where('project_id', projectId);
    const cells = [];
    for (const conn of connections) {
      const srcPort = await db('system_port').where('id', conn.source_port_id).first();
      const dstPort = await db('system_port').where('id', conn.dest_port_id).first();
      if (!srcPort || !dstPort) continue;
      const proto = await db('protocol_definition').where('id', conn.protocol_id).first();
      const msgCount = await db('message').where('connection_id', conn.id).count('* as c').first();
      cells.push({ source: sysMap.get(srcPort.system_id), dest: sysMap.get(dstPort.system_id), protocol: proto?.protocol_name, count: parseInt(msgCount.c), connectionId: conn.id });
    }
    return { systems: systems.map(s => s.name), cells };
  });

  // Baselines (with hierarchy snapshots)
  app.get('/api/baselines', async (req) => {
    const projectId = req.query.projectId || (await db('project').first('id'))?.id;
    const baselines = await db('baseline').where('project_id', projectId).orderBy('created_at', 'desc');
    const result = [];
    for (const b of baselines) {
      const snap = await db('baseline_hierarchy_snapshot').where('baseline_id', b.id).first();
      result.push({ ...b, hierarchy: snap ? { systems: snap.systems_count, connections: snap.connections_count, messages: snap.messages_count, parameters: snap.parameters_count } : null });
    }
    return result;
  });

  app.post('/api/baselines', async (req, reply) => {
    const session = getSession(req);
    if (session && !hasPermission(session, 'baselines', 'create')) {
      return reply.status(403).send({ error: 'Only admin users can create baselines' });
    }
    const v = validate(schemas.CreateBaselineSchema, req.body); if (!v.ok) return reply.status(422).send(v.error);
    const b = v.data;
    const projectId = b.projectId || (await db('project').first('id'))?.id;

    // Create baseline record
    const [baseline] = await db('baseline').insert({
      project_id: projectId, version_label: b.versionLabel || 'v1.0',
      description: b.description || '', status: 'frozen',
      created_by: session?.userId || null,
    }).returning('*');

    // Snapshot the entire hierarchy
    const systems = await db('system').where('project_id', projectId);
    const sysIds = systems.map(s => s.id);
    const ports = sysIds.length ? await db('system_port').whereIn('system_id', sysIds) : [];
    const functions = sysIds.length ? await db('system_function').whereIn('system_id', sysIds) : [];
    const connections = await db('connection').where('project_id', projectId);
    const connIds = connections.map(c => c.id);
    const messages = connIds.length ? await db('message').whereIn('connection_id', connIds) : [];
    const msgIds = messages.map(m => m.id);
    const parameters = msgIds.length ? await db('parameter').whereIn('message_id', msgIds) : [];

    const snapshotData = {
      systems: systems.map(s => ({ ...s })),
      ports: ports.map(p => ({ ...p })),
      functions: functions.map(f => ({ ...f })),
      connections: connections.map(c => ({ ...c })),
      messages: messages.map(m => ({ ...m })),
      parameters: parameters.map(p => ({ ...p })),
    };

    await db('baseline_hierarchy_snapshot').insert({
      baseline_id: baseline.id, snapshot_data: snapshotData,
      systems_count: systems.length, connections_count: connections.length,
      messages_count: messages.length, parameters_count: parameters.length,
    });

    // Also snapshot legacy signals
    const signals = await db('signal').where('project_id', projectId);
    for (const sig of signals) {
      const logical = await db('logical_layer').where('signal_id', sig.id).first();
      const transport = await db('transport_layer').where('signal_id', sig.id).first();
      const physical = await db('physical_layer').where('signal_id', sig.id).first();
      await db('baseline_snapshot').insert({
        baseline_id: baseline.id, signal_id: sig.id,
        logical_snapshot: logical || {}, transport_snapshot: transport || {}, physical_snapshot: physical || {},
      });
    }

    reply.status(201);
    return { ...baseline, hierarchy: { systems: systems.length, connections: connections.length, messages: messages.length, parameters: parameters.length } };
  });

  app.get('/api/baselines/:id', async (req) => {
    const baseline = await db('baseline').where('id', req.params.id).first();
    if (!baseline) return { error: 'Not found' };
    const snap = await db('baseline_hierarchy_snapshot').where('baseline_id', baseline.id).first();
    return { ...baseline, snapshot: snap?.snapshot_data || null, hierarchy: snap ? { systems: snap.systems_count, connections: snap.connections_count, messages: snap.messages_count, parameters: snap.parameters_count } : null };
  });

  app.post('/api/baselines/:id/compare', async (req) => {
    const baselineA = await db('baseline_hierarchy_snapshot').where('baseline_id', req.params.id).first();
    const baselineB = req.body.compareToId ? await db('baseline_hierarchy_snapshot').where('baseline_id', req.body.compareToId).first() : null;
    if (!baselineA) return { error: 'Baseline A not found' };

    const a = baselineA.snapshot_data || {};
    const b = baselineB?.snapshot_data || { systems: [], connections: [], messages: [], parameters: [] };

    const diff = {
      systems: { added: (a.systems || []).filter(s => !(b.systems || []).find(x => x.name === s.name)), removed: (b.systems || []).filter(s => !(a.systems || []).find(x => x.name === s.name)) },
      connections: { added: (a.connections || []).filter(c => !(b.connections || []).find(x => x.name === c.name)), removed: (b.connections || []).filter(c => !(a.connections || []).find(x => x.name === c.name)) },
      messages: { count_a: (a.messages || []).length, count_b: (b.messages || []).length },
      parameters: { count_a: (a.parameters || []).length, count_b: (b.parameters || []).length },
    };
    return { diff };
  });

  app.delete('/api/baselines/:id', async (req, reply) => {
    const session = getSession(req);
    if (session && !hasPermission(session, 'baselines', 'delete')) {
      return reply.status(403).send({ error: 'Only admin users can delete baselines' });
    }
    await db('baseline').where('id', req.params.id).del();
    reply.status(204).send();
  });

  // Approval Workflows
  app.get('/api/workflows', async (req) => {
    const projectId = req.query.projectId;
    let query = db('change_request').orderBy('submitted_at', 'desc');
    if (projectId) query = query.where('project_id', projectId);
    return query.limit(100);
  });

  app.post('/api/workflows', async (req, reply) => {
    const v = validate(schemas.CreateWorkflowSchema, req.body); if (!v.ok) return reply.status(422).send(v.error);
    const session = getSession(req);
    const b = v.data;

    const [cr] = await db('change_request').insert({
      signal_id: b.entity_type === 'signal' ? b.entity_id : null,
      entity_type: b.entity_type,
      entity_id: b.entity_id,
      entity_name: b.entity_name || '',
      project_id: b.project_id || null,
      submitted_by: session?.userId || null,
      status: 'pending',
      change_payload: b.change_payload || {},
    }).returning('*');
    reply.status(201);
    return cr;
  });

  app.put('/api/workflows/:id/approve', async (req, reply) => {
    const session = getSession(req);
    if (session && session.role !== 'admin' && session.role !== 'reviewer') {
      return reply.status(403).send({ error: 'Only admin or reviewer users can approve changes' });
    }
    // Independence check: creator ≠ approver (ARP 4754B §5.4)
    const cr = await db('change_request').where('id', req.params.id).first();
    if (cr && session && cr.created_by === session.userId) {
      return reply.status(403).send({ error: 'Independence violation: the creator of this change request cannot also approve it (ARP 4754B §5.4)' });
    }
    const [updated] = await db('change_request').where('id', req.params.id).update({
      status: 'approved',
      approved_by: session?.userId || null,
      resolved_at: db.fn.now(),
    }).returning('*');

    // Apply the change if payload contains the update
    if (updated && updated.change_payload && updated.entity_type && updated.entity_id) {
      const tableMap = { system: 'system', connection: 'connection', message: 'message', parameter: 'parameter', signal: 'signal' };
      const table = tableMap[updated.entity_type];
      if (table && Object.keys(updated.change_payload).length > 0) {
        await db(table).where('id', updated.entity_id).update(updated.change_payload).catch(() => {});
      }
    }
    return updated;
  });

  app.put('/api/workflows/:id/reject', async (req, reply) => {
    const session = getSession(req);
    if (session && session.role !== 'admin') {
      return reply.status(403).send({ error: 'Only admin users can reject changes' });
    }
    const [cr] = await db('change_request').where('id', req.params.id).update({
      status: 'rejected',
      approved_by: session?.userId || null,
      rejection_reason: req.body.reason || '',
      resolved_at: db.fn.now(),
    }).returning('*');
    return cr;
  });

  app.get('/api/workflows/pending', async (req) => {
    const projectId = req.query.projectId;
    let query = db('change_request').where('status', 'pending').orderBy('submitted_at', 'desc');
    if (projectId) query = query.where('project_id', projectId);
    return query;
  });

  // Audit
  app.get('/api/audit', async (req) => db('audit_entry').orderBy('timestamp', 'desc').limit(req.query.limit || 50));

  // Comments
  app.get('/api/signals/:id/comments', async (req) => db('signal_comment').where('signal_id', req.params.id).orderBy('created_at'));

  // Notifications
  app.get('/api/notifications', async () => db('notification').orderBy('created_at', 'desc').limit(20));

  // Handshakes
  app.get('/api/handshakes/pending', async () => db('signal_ownership').whereNot('handshake_status', 'approved'));

  // Organizations
  app.get('/api/organizations', async () => db('organization').orderBy('name'));

  // AI
  app.get('/api/ai/providers', async () => ({ available: ['claude', 'gemini'] }));

  // ============================================================
  // 3-Level ICD Hierarchy Endpoints
  // ============================================================

  // Protocols (for dynamic form rendering)
  app.get('/api/protocols', async () => db('protocol_definition').orderBy('protocol_name'));

  // Systems
  app.get('/api/systems', async (req) => {
    const q = req.query;
    const rows = await db('system')
      .select('system.*',
        db.raw('(select count(*) from system_port where system_port.system_id = system.id)::int as port_count'),
        db.raw('(select count(*) from connection where connection.source_port_id in (select id from system_port where system_id = system.id) or connection.dest_port_id in (select id from system_port where system_id = system.id))::int as connection_count'))
      .modify(qb => { if (q.projectId) qb.where('system.project_id', q.projectId); })
      .orderBy('system.name');
    return rows;
  });

  app.post('/api/systems', async (req, reply) => {
    const v = validate(schemas.CreateSystemSchema, req.body); if (!v.ok) return reply.status(422).send(v.error);
    const b = v.data;
    const projectId = b.project_id || (await db('project').first('id')).id;
    const [sys] = await db('system').insert({ project_id: projectId, name: b.name, description: b.description || '', manufacturer: b.manufacturer || '', part_number: b.part_number || '', ata_chapter: b.ata_chapter || '', system_type: b.system_type || 'lru' }).returning('*');
    reply.status(201); return sys;
  });

  app.put('/api/systems/:id', async (req, reply) => {
    const v = validate(schemas.UpdateSystemSchema, req.body); if (!v.ok) return reply.status(422).send(v.error);
    const b = v.data;
    const [sys] = await db('system').where('id', req.params.id).update({ name: b.name, description: b.description, manufacturer: b.manufacturer, part_number: b.part_number, ata_chapter: b.ata_chapter, system_type: b.system_type, updated_at: db.fn.now() }).returning('*');
    return sys;
  });

  app.delete('/api/systems/:id', async (req, reply) => {
    await db('system').where('id', req.params.id).del();
    reply.status(204).send();
  });

  // System ports
  app.post('/api/ports', async (req, reply) => {
    const v = validate(schemas.CreatePortSchema, req.body); if (!v.ok) return reply.status(422).send(v.error);
    const b = v.data;
    const [port] = await db('system_port').insert({ system_id: b.system_id, name: b.name, protocol_id: b.protocol_id || null, direction: b.direction || 'tx', connector_label: b.connector_label || '' }).returning('*');
    reply.status(201); return port;
  });

  app.delete('/api/ports/:id', async (req, reply) => {
    await db('system_port').where('id', req.params.id).del();
    reply.status(204).send();
  });

  app.put('/api/ports/:id', async (req, reply) => {
    const v = validate(schemas.UpdatePortSchema, req.body); if (!v.ok) return reply.status(422).send(v.error);
    const b = v.data;
    const [row] = await db('system_port').where('id', req.params.id).update({ name: b.name, protocol_id: b.protocol_id || null, direction: b.direction, connector_label: b.connector_label }).returning('*');
    return row;
  });

  // System functions
  app.post('/api/functions', async (req, reply) => {
    const v = validate(schemas.CreateFunctionSchema, req.body); if (!v.ok) return reply.status(422).send(v.error);
    const b = v.data;
    const [fn] = await db('system_function').insert({ system_id: b.system_id, name: b.name, criticality: b.criticality || 'major', dal: b.dal || '' }).returning('*');
    reply.status(201); return fn;
  });

  app.delete('/api/functions/:id', async (req, reply) => {
    await db('system_function').where('id', req.params.id).del();
    reply.status(204).send();
  });

  app.put('/api/functions/:id', async (req, reply) => {
    const v = validate(schemas.UpdateFunctionSchema, req.body); if (!v.ok) return reply.status(422).send(v.error);
    const b = v.data;
    const [row] = await db('system_function').where('id', req.params.id).update({ name: b.name, criticality: b.criticality, dal: b.dal }).returning('*');
    return row;
  });

  app.get('/api/systems/:id', async (req) => {
    const sys = await db('system').where('id', req.params.id).first();
    if (!sys) return { error: 'Not found' };
    const ports = await db('system_port').leftJoin('protocol_definition', 'system_port.protocol_id', 'protocol_definition.id').where('system_port.system_id', sys.id).select('system_port.*', 'protocol_definition.protocol_name');
    const functions = await db('system_function').where('system_id', sys.id);
    return { ...sys, ports, functions };
  });

  // System connections
  app.get('/api/systems/:id/connections', async (req) => {
    const sysId = req.params.id;
    const myPorts = await db('system_port').where('system_id', sysId).select('id');
    const portIds = myPorts.map(p => p.id);
    if (!portIds.length) return [];

    const conns = await db('connection')
      .whereIn('source_port_id', portIds).orWhereIn('dest_port_id', portIds)
      .select('connection.*');

    const result = [];
    for (const c of conns) {
      const srcPort = await db('system_port').where('id', c.source_port_id).first();
      const dstPort = await db('system_port').where('id', c.dest_port_id).first();
      const isSource = portIds.includes(c.source_port_id);
      const remotePortId = isSource ? c.dest_port_id : c.source_port_id;
      const remotePort = isSource ? dstPort : srcPort;
      const remoteSys = await db('system').where('id', remotePort.system_id).first();
      const proto = await db('protocol_definition').where('id', c.protocol_id).first();
      const msgCount = await db('message').where('connection_id', c.id).count('* as count').first();
      result.push({
        id: c.id, name: c.name || `${srcPort.name} → ${dstPort.name}`,
        remote_system_name: remoteSys.name, remote_system_id: remoteSys.id,
        protocol_name: proto.protocol_name, protocol_id: c.protocol_id,
        source_port_name: srcPort.name, dest_port_name: dstPort.name,
        direction: isSource ? 'tx' : 'rx',
        message_count: parseInt(msgCount.count)
      });
    }
    return result;
  });

  // Connection messages
  app.get('/api/connections/:id', async (req) => {
    return db('connection').where('id', req.params.id).first();
  });

  app.get('/api/connections/:id/messages', async (req) => {
    const msgs = await db('message').where('connection_id', req.params.id)
      .select('message.*',
        db.raw('(select count(*) from parameter where parameter.message_id = message.id)::int as parameter_count'))
      .orderBy('message_id_primary');
    return msgs;
  });

  // Message parameters
  app.get('/api/messages/:id', async (req) => {
    return db('message').where('id', req.params.id).first();
  });

  app.get('/api/messages/:id/parameters', async (req) => {
    const params = await db('parameter')
      .leftJoin('system_function', 'parameter.function_id', 'system_function.id')
      .where('parameter.message_id', req.params.id)
      .select('parameter.*', 'system_function.name as function_name')
      .orderBy('parameter.bit_offset');
    return params;
  });

  // Create connection
  app.post('/api/connections', async (req, reply) => {
    const v = validate(schemas.CreateConnectionSchema, req.body); if (!v.ok) return reply.status(422).send(v.error);
    const b = v.data;
    const projectId = b.project_id || (await db('project').first('id')).id;
    const [conn] = await db('connection').insert({ project_id: projectId, source_port_id: b.source_port_id, dest_port_id: b.dest_port_id, protocol_id: b.protocol_id, bus_id: b.bus_id || null, name: b.name || '' }).returning('*');
    reply.status(201); return conn;
  });

  app.delete('/api/connections/:id', async (req, reply) => {
    await db('connection').where('id', req.params.id).del();
    reply.status(204).send();
  });

  app.put('/api/connections/:id', async (req) => {
    const b = req.body;
    const [row] = await db('connection').where('id', req.params.id).update({ name: b.name, protocol_id: b.protocol_id, source_port_id: b.source_port_id, dest_port_id: b.dest_port_id, updated_at: db.fn.now() }).returning('*');
    return row;
  });

  // Create message
  app.post('/api/messages', async (req, reply) => {
    const v = validate(schemas.CreateMessageSchema, req.body); if (!v.ok) return reply.status(422).send(v.error);
    const b = v.data;
    const [msg] = await db('message').insert({ connection_id: b.connection_id, protocol_id: b.protocol_id, message_id_primary: b.message_id_primary, message_id_secondary: b.message_id_secondary || null, name: b.name || '', direction: b.direction || 'tx', refresh_rate_hz: b.refresh_rate_hz || null, word_count: b.word_count || null, protocol_attrs: b.protocol_attrs || {} }).returning('*');
    reply.status(201); return msg;
  });

  app.delete('/api/messages/:id', async (req, reply) => {
    await db('message').where('id', req.params.id).del();
    reply.status(204).send();
  });

  app.put('/api/messages/:id', async (req, reply) => {
    const v = validate(schemas.UpdateMessageSchema, req.body); if (!v.ok) return reply.status(422).send(v.error);
    const b = v.data;
    const [row] = await db('message').where('id', req.params.id).update({ message_id_primary: b.message_id_primary, message_id_secondary: b.message_id_secondary, name: b.name, direction: b.direction, refresh_rate_hz: b.refresh_rate_hz, protocol_attrs: b.protocol_attrs || {}, updated_at: db.fn.now() }).returning('*');
    return row;
  });

  // Create parameter
  app.post('/api/parameters', async (req, reply) => {
    const v = validate(schemas.CreateParameterSchema, req.body); if (!v.ok) return reply.status(422).send(v.error);
    const b = v.data;
    const [param] = await db('parameter').insert({ message_id: b.message_id, function_id: b.function_id || null, name: b.name, description: b.description || '', bit_offset: b.bit_offset || 0, bit_length: b.bit_length || 1, byte_order: b.byte_order || 'big_endian', encoding: b.encoding || 'unsigned', units: b.units || '', min_value: b.min_value ?? null, max_value: b.max_value ?? null, resolution: b.resolution ?? null, scale_factor: b.scale_factor || 1.0, offset_value: b.offset_value || 0.0, ssm_convention: b.ssm_convention || null, protocol_attrs: b.protocol_attrs || {}, criticality: b.criticality || 'major' }).returning('*');
    reply.status(201); return param;
  });

  app.delete('/api/parameters/:id', async (req, reply) => {
    await db('parameter').where('id', req.params.id).del();
    reply.status(204).send();
  });

  app.put('/api/parameters/:id', async (req, reply) => {
    const v = validate(schemas.UpdateParameterSchema, req.body); if (!v.ok) return reply.status(422).send(v.error);
    const b = v.data;
    const [row] = await db('parameter').where('id', req.params.id).update({ name: b.name, bit_offset: b.bit_offset, bit_length: b.bit_length, encoding: b.encoding, units: b.units, min_value: b.min_value ?? null, max_value: b.max_value ?? null, resolution: b.resolution ?? null, scale_factor: b.scale_factor, offset_value: b.offset_value, byte_order: b.byte_order, ssm_convention: b.ssm_convention, protocol_attrs: b.protocol_attrs || {}, criticality: b.criticality, function_id: b.function_id || null, updated_at: db.fn.now() }).returning('*');
    return row;
  });

  // ============================================================
  // AI Document Parsing (Gemini-powered)
  // ============================================================

  const GEMINI_KEY = process.env.GEMINI_API_KEY || 'AIzaSyADjC55wtMdRPbrcZhmx9aluv18hkmmWio';

  async function callGemini(prompt, maxTokens = 4096) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  app.post('/api/parse/excel', async (req, reply) => {
    const ExcelJS = require('exceljs');
    const data = req.body;
    if (!data.base64) return reply.status(400).send({ error: 'Missing base64 file data' });

    const buf = Buffer.from(data.base64, 'base64');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    const extracted = [];
    const unmapped = [];

    // Column name patterns for auto-detection
    const patterns = {
      name: /^(signal|parameter|param|name|label|message)/i,
      source: /^(source|src|from|transmit|tx)/i,
      dest: /^(dest|dst|to|receive|rx|target)/i,
      protocol: /^(protocol|bus|interface|type)/i,
      label: /^(label|id|msg.?id|can.?id|vl.?id)/i,
      units: /^(unit|eng.?unit)/i,
      dataType: /^(data.?type|type|encoding|format)/i,
      bitOffset: /^(bit.?off|start.?bit|bit.?pos)/i,
      bitLength: /^(bit.?len|length|size|bits)/i,
      min: /^(min|low|range.?min)/i,
      max: /^(max|high|range.?max)/i,
      rate: /^(rate|refresh|freq|hz)/i,
      resolution: /^(res|resolution|lsb)/i,
      description: /^(desc|description|comment|note)/i,
    };

    for (const ws of wb.worksheets) {
      const headerRow = ws.getRow(1);
      const colMap = {};
      headerRow.eachCell((cell, colNum) => {
        const val = String(cell.value || '').trim();
        for (const [key, regex] of Object.entries(patterns)) {
          if (regex.test(val)) { colMap[key] = colNum; break; }
        }
        if (!Object.values(colMap).includes(colNum) && val) {
          unmapped.push({ sheet: ws.name, column: val, colNum });
        }
      });

      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const get = (key) => { const c = colMap[key]; return c ? String(row.getCell(c).value || '').trim() : ''; };
        const name = get('name');
        if (!name) continue;

        const confidence = Object.keys(colMap).length / Object.keys(patterns).length;
        extracted.push({
          sheet: ws.name, row: r, confidence: Math.round(confidence * 100) / 100,
          name, source: get('source'), dest: get('dest'), protocol: get('protocol'),
          label: get('label'), units: get('units'), dataType: get('dataType'),
          bitOffset: parseInt(get('bitOffset')) || null, bitLength: parseInt(get('bitLength')) || null,
          min: parseFloat(get('min')) || null, max: parseFloat(get('max')) || null,
          rate: parseFloat(get('rate')) || null, resolution: parseFloat(get('resolution')) || null,
          description: get('description'),
        });
      }
    }

    // Store parse job
    const [job] = await db('parse_job').insert({
      document_id: data.fileName || 'upload',
      status: 'review_pending',
      total_tables_found: wb.worksheets.length,
      total_signals_extracted: extracted.length,
      avg_confidence: extracted.length ? extracted.reduce((s, e) => s + e.confidence, 0) / extracted.length : 0,
      high_confidence_count: extracted.filter(e => e.confidence >= 0.5).length,
      low_confidence_count: extracted.filter(e => e.confidence < 0.5).length,
      unmapped_field_count: unmapped.length,
    }).returning('*');

    // Store extracted signals
    for (const e of extracted) {
      await db('extracted_signal').insert({
        parse_job_id: job.id, data: e, confidence: e.confidence,
        source_row: e.row, needs_review: e.confidence < 0.7,
      });
    }

    return { jobId: job.id, extracted, unmapped, stats: { total: extracted.length, highConfidence: job.high_confidence_count, lowConfidence: job.low_confidence_count, unmappedFields: unmapped.length } };
  });

  // Confirm extraction — create hierarchy from AI-extracted data
  app.post('/api/parse-jobs/:id/confirm-hierarchy', async (req, reply) => {
    const job = await db('parse_job').where('id', req.params.id).first();
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    const extracted = await db('extracted_signal').where('parse_job_id', req.params.id);
    const projectId = req.body.projectId || (await db('project').first('id')).id;

    const stats = { systems: 0, connections: 0, messages: 0, parameters: 0 };
    const sysCache = new Map();
    const portCache = new Map();
    const connCache = new Map();
    const msgCache = new Map();

    // Get or create protocol by name
    async function getProto(name) {
      if (!name) return null;
      const p = await db('protocol_definition').whereRaw('LOWER(protocol_name) LIKE ?', [`%${name.toLowerCase()}%`]).first();
      return p?.id || null;
    }

    // Get or create system
    async function getOrCreateSys(name) {
      if (!name) return null;
      const key = name.toUpperCase().trim();
      if (sysCache.has(key)) return sysCache.get(key);
      let sys = await db('system').where({ project_id: projectId }).whereRaw('UPPER(name) = ?', [key]).first();
      if (!sys) {
        [sys] = await db('system').insert({ project_id: projectId, name: key, system_type: 'lru' }).returning('*');
        stats.systems++;
      }
      sysCache.set(key, sys.id);
      return sys.id;
    }

    // Get or create port
    async function getOrCreatePort(sysId, protoId, dir, label) {
      const key = `${sysId}:${protoId}:${dir}:${label}`;
      if (portCache.has(key)) return portCache.get(key);
      const portName = label || `${dir}_${stats.connections}`;
      let port = await db('system_port').where({ system_id: sysId, name: portName }).first();
      if (!port) {
        [port] = await db('system_port').insert({ system_id: sysId, name: portName, protocol_id: protoId, direction: dir, connector_label: '' }).returning('*');
      }
      portCache.set(key, port.id);
      return port.id;
    }

    for (const ext of extracted) {
      const d = ext.data;
      if (!d.name) continue;

      const srcSysId = await getOrCreateSys(d.source_system || d.source);
      const dstSysId = await getOrCreateSys(d.dest_system || d.dest);
      const protoId = await getProto(d.protocol);

      if (srcSysId && dstSysId && protoId) {
        const srcPortId = await getOrCreatePort(srcSysId, protoId, 'tx', d.source_port || `TX_${d.protocol}`);
        const dstPortId = await getOrCreatePort(dstSysId, protoId, 'rx', d.dest_port || `RX_${d.protocol}`);

        // Get or create connection
        const connKey = `${srcPortId}:${dstPortId}`;
        let connId = connCache.get(connKey);
        if (!connId) {
          let conn = await db('connection').where({ source_port_id: srcPortId, dest_port_id: dstPortId }).first();
          if (!conn) {
            [conn] = await db('connection').insert({ project_id: projectId, source_port_id: srcPortId, dest_port_id: dstPortId, protocol_id: protoId, name: `${d.source_system || d.source} → ${d.dest_system || d.dest}` }).returning('*');
            stats.connections++;
          }
          connId = conn.id;
          connCache.set(connKey, connId);
        }

        // Get or create message
        const msgKey = `${connId}:${d.label || d.message_id || d.name}`;
        let msgId = msgCache.get(msgKey);
        if (!msgId) {
          const mid = d.label || d.message_id || d.name;
          let msg = await db('message').where({ connection_id: connId, message_id_primary: mid }).first();
          if (!msg) {
            [msg] = await db('message').insert({ connection_id: connId, protocol_id: protoId, message_id_primary: mid, name: d.message_name || d.name, refresh_rate_hz: d.rate || d.refresh_rate_hz || null, protocol_attrs: {} }).returning('*');
            stats.messages++;
          }
          msgId = msg.id;
          msgCache.set(msgKey, msgId);
        }

        // Create parameter
        const existing = await db('parameter').where({ message_id: msgId, name: d.name }).first();
        if (!existing) {
          await db('parameter').insert({
            message_id: msgId, name: d.name,
            bit_offset: d.bitOffset || d.bit_offset || 0,
            bit_length: d.bitLength || d.bit_length || 1,
            encoding: d.encoding || d.dataType || 'unsigned',
            units: d.units || '', min_value: d.min ?? d.min_value ?? null,
            max_value: d.max ?? d.max_value ?? null,
            resolution: d.resolution ?? null, scale_factor: 1, offset_value: 0,
            byte_order: 'big_endian', protocol_attrs: {}, criticality: 'major',
          });
          stats.parameters++;
        }
      }
    }

    await db('parse_job').where('id', req.params.id).update({ status: 'confirmed' });
    return { confirmed: true, stats };
  });

  // AI-powered ingestion: use Gemini to extract hierarchy from Excel
  app.post('/api/parse/ai-extract', async (req, reply) => {
    const ExcelJS = require('exceljs');
    const data = req.body;
    if (!data.base64) return reply.status(400).send({ error: 'Missing base64 file data' });

    const buf = Buffer.from(data.base64, 'base64');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    // Extract raw table data from all sheets
    const sheets = [];
    for (const ws of wb.worksheets) {
      const rows = [];
      ws.eachRow((row, rowNum) => {
        const cells = [];
        row.eachCell((cell) => cells.push(String(cell.value || '').trim()));
        rows.push(cells.join(' | '));
      });
      sheets.push({ name: ws.name, preview: rows.slice(0, 30).join('\n') });
    }

    const sheetsText = sheets.map(s => `--- Sheet: ${s.name} ---\n${s.preview}`).join('\n\n');

    // Ask Gemini to extract structured ICD data
    const prompt = `You are an aerospace ICD (Interface Control Document) data extraction expert.

Analyze this Excel ICD data and extract ALL signals/parameters into a structured JSON array.

For each signal/parameter, extract:
- name: parameter name (e.g. "AIRSPEED_IAS")
- source_system: source LRU/system name (e.g. "ADC", "FCC")
- dest_system: destination LRU/system name
- protocol: bus protocol (e.g. "ARINC 429", "ARINC 825", "Discrete", "Analog", "AFDX", "MIL-STD-1553")
- label: message/label identifier (e.g. "0310" for A429, CAN ID for A825)
- message_name: human-readable message name
- encoding: data encoding (BNR, BCD, discrete, unsigned, signed, float32)
- bit_offset: start bit position (integer)
- bit_length: number of bits (integer)
- units: engineering units (knots, degrees, volts, etc.)
- min_value: minimum range value (number or null)
- max_value: maximum range value (number or null)
- resolution: LSB resolution (number or null)
- rate: refresh rate in Hz (number or null)
- confidence: your confidence 0.0-1.0 in the extraction accuracy

Return ONLY a JSON array, no markdown, no explanation. Example:
[{"name":"AIRSPEED","source_system":"ADC","dest_system":"FCC","protocol":"ARINC 429","label":"0206","message_name":"Computed Airspeed","encoding":"BNR","bit_offset":10,"bit_length":19,"units":"knots","min_value":0,"max_value":512,"resolution":0.0625,"rate":12.5,"confidence":0.95}]

Excel data:
${sheetsText}`;

    try {
      const aiResponse = await callGemini(prompt, 8192);
      // Parse JSON from response (handle markdown code blocks)
      let jsonStr = aiResponse.trim();
      if (jsonStr.startsWith('```')) jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const extracted = JSON.parse(jsonStr);

      // Store parse job
      const [job] = await db('parse_job').insert({
        document_id: data.fileName || 'ai-upload',
        status: 'review_pending',
        total_tables_found: sheets.length,
        total_signals_extracted: extracted.length,
        avg_confidence: extracted.length ? extracted.reduce((s, e) => s + (e.confidence || 0.5), 0) / extracted.length : 0,
        high_confidence_count: extracted.filter(e => (e.confidence || 0) >= 0.7).length,
        low_confidence_count: extracted.filter(e => (e.confidence || 0) < 0.7).length,
      }).returning('*');

      for (const e of extracted) {
        await db('extracted_signal').insert({
          parse_job_id: job.id, data: e, confidence: e.confidence || 0.5,
          needs_review: (e.confidence || 0) < 0.7,
        });
      }

      return { jobId: job.id, extracted, stats: { total: extracted.length, sheets: sheets.length, highConfidence: job.high_confidence_count, lowConfidence: job.low_confidence_count } };
    } catch (e) {
      return reply.status(500).send({ error: 'AI extraction failed: ' + e.message });
    }
  });

  // Get parse job results
  app.get('/api/parse-jobs', async () => db('parse_job').orderBy('created_at', 'desc'));

  app.get('/api/parse-jobs/:id/results', async (req) => {
    const job = await db('parse_job').where('id', req.params.id).first();
    const signals = await db('extracted_signal').where('parse_job_id', req.params.id).orderBy('created_at');
    return { job, signals: signals.map(s => ({ ...s, ...s.data })) };
  });

  // Confirm extraction — create real signals/parameters from extracted data
  app.post('/api/parse-jobs/:id/confirm', async (req, reply) => {
    const job = await db('parse_job').where('id', req.params.id).first();
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    const signals = await db('extracted_signal').where('parse_job_id', req.params.id);
    const projectId = req.body.projectId || (await db('project').first('id')).id;
    let created = 0;
    for (const s of signals) {
      const d = s.data;
      if (!d.name) continue;
      await db('signal').insert({ name: d.name, project_id: projectId, status: 'draft', criticality: 'major' }).onConflict().ignore();
      created++;
    }
    await db('parse_job').where('id', req.params.id).update({ status: 'confirmed' });
    reply.status(200);
    return { confirmed: created };
  });

  // ============================================================
  // Anomaly Detection
  // ============================================================

  app.get('/api/anomalies', async (req) => {
    const projectId = req.query.projectId || (await db('project').first('id')).id;
    const anomalies = [];

    // Get all connections, messages, parameters for this project
    const systems = await db('system').where('project_id', projectId);
    const sysIds = systems.map(s => s.id);
    const ports = await db('system_port').whereIn('system_id', sysIds);
    const portIds = ports.map(p => p.id);
    const connections = await db('connection').where('project_id', projectId);
    const allMessages = [];
    const allParams = [];
    for (const conn of connections) {
      const msgs = await db('message').where('connection_id', conn.id);
      for (const msg of msgs) {
        allMessages.push({ ...msg, connection: conn });
        const params = await db('parameter').where('message_id', msg.id);
        allParams.push(...params.map(p => ({ ...p, message: msg, connection: conn })));
      }
    }

    // Rule 1: Duplicate label numbers on same connection
    const labelMap = new Map();
    for (const msg of allMessages) {
      const key = `${msg.connection_id}:${msg.message_id_primary}`;
      if (labelMap.has(key)) {
        anomalies.push({ severity: 'error', category: 'duplicate_label', title: `Duplicate label ${msg.message_id_primary}`, description: `Label/ID "${msg.message_id_primary}" appears multiple times on connection "${msg.connection.name}"`, affected: [msg.id, labelMap.get(key)], suggestion: 'Remove the duplicate or assign different label numbers' });
      }
      labelMap.set(key, msg.id);
    }

    // Rule 2: Bit overlap within a message
    const msgParamGroups = new Map();
    for (const p of allParams) {
      const key = p.message_id;
      if (!msgParamGroups.has(key)) msgParamGroups.set(key, []);
      msgParamGroups.get(key).push(p);
    }
    for (const [msgId, params] of msgParamGroups) {
      for (let i = 0; i < params.length; i++) {
        for (let j = i + 1; j < params.length; j++) {
          const a = params[i], b = params[j];
          const aEnd = a.bit_offset + a.bit_length - 1;
          const bEnd = b.bit_offset + b.bit_length - 1;
          if (a.bit_offset <= bEnd && b.bit_offset <= aEnd) {
            anomalies.push({ severity: 'error', category: 'bit_overlap', title: `Bit overlap: ${a.name} ↔ ${b.name}`, description: `Parameters "${a.name}" (bits ${a.bit_offset}-${aEnd}) and "${b.name}" (bits ${b.bit_offset}-${bEnd}) overlap in message "${a.message.message_id_primary}"`, affected: [a.id, b.id], suggestion: 'Adjust bit offsets so parameters do not overlap' });
          }
        }
      }
    }

    // Rule 3: Parameter exceeds word size (A429 = 32 bits)
    for (const p of allParams) {
      const proto = await db('protocol_definition').where('id', p.connection.protocol_id).first();
      if (!proto) continue;
      const rules = proto.validation_rules || {};
      const wordSize = rules.word_size || rules.max_dlc ? (rules.max_dlc || 8) * 8 : null;
      if (wordSize && (p.bit_offset + p.bit_length) > wordSize) {
        anomalies.push({ severity: 'error', category: 'word_overflow', title: `Word overflow: ${p.name}`, description: `Parameter "${p.name}" extends to bit ${p.bit_offset + p.bit_length - 1} but ${proto.protocol_name} word size is ${wordSize} bits`, affected: [p.id], suggestion: `Reduce bit_offset or bit_length to fit within ${wordSize} bits` });
      }
    }

    // Rule 4: Range conflicts (min >= max)
    for (const p of allParams) {
      if (p.min_value != null && p.max_value != null && p.min_value >= p.max_value) {
        anomalies.push({ severity: 'warning', category: 'range_conflict', title: `Invalid range: ${p.name}`, description: `Parameter "${p.name}" has min (${p.min_value}) >= max (${p.max_value})`, affected: [p.id], suggestion: 'Swap min and max values or correct the range' });
      }
    }

    // Rule 5: Missing units on numeric parameters
    for (const p of allParams) {
      if (p.encoding !== 'discrete' && !p.units && p.min_value != null) {
        anomalies.push({ severity: 'info', category: 'missing_units', title: `Missing units: ${p.name}`, description: `Parameter "${p.name}" has a numeric range but no units defined`, affected: [p.id], suggestion: 'Add engineering units (knots, degrees, volts, etc.)' });
      }
    }

    // Rule 6: Orphan systems (no connections)
    for (const sys of systems) {
      const sysPorts = ports.filter(p => p.system_id === sys.id);
      const sysPortIds = sysPorts.map(p => p.id);
      const hasConn = connections.some(c => sysPortIds.includes(c.source_port_id) || sysPortIds.includes(c.dest_port_id));
      if (!hasConn) {
        anomalies.push({ severity: 'warning', category: 'orphan_system', title: `Unconnected system: ${sys.name}`, description: `System "${sys.name}" has no connections to other systems`, affected: [sys.id], suggestion: 'Add connections or remove the system if unused' });
      }
    }

    return { anomalies, summary: { total: anomalies.length, errors: anomalies.filter(a => a.severity === 'error').length, warnings: anomalies.filter(a => a.severity === 'warning').length, info: anomalies.filter(a => a.severity === 'info').length } };
  });

  // ============================================================
  // AI Analysis (Gemini-powered)
  // ============================================================

  app.post('/api/ai/analyze', async (req, reply) => {
    const projectId = req.body.projectId || (await db('project').first('id')).id;
    const project = await db('project').where('id', projectId).first();
    const systems = await db('system').where('project_id', projectId);
    const connections = await db('connection').where('project_id', projectId);

    // Build context for Gemini
    const sysNames = systems.map(s => `${s.name} (${s.system_type}, ${s.description})`).join('\n');
    let connDetails = '';
    for (const c of connections.slice(0, 20)) {
      const msgs = await db('message').where('connection_id', c.id);
      const proto = await db('protocol_definition').where('id', c.protocol_id).first();
      connDetails += `${c.name} [${proto?.protocol_name}]: ${msgs.length} messages\n`;
    }

    const analysisType = req.body.type || 'general';
    const prompts = {
      general: `Analyze this avionics ICD architecture for the "${project.name}" (${project.aircraft_type}) project. Identify strengths, weaknesses, and recommendations.\n\nSystems:\n${sysNames}\n\nConnections:\n${connDetails}`,
      bus_loading: `Analyze the bus loading and bandwidth utilization for this avionics architecture. Flag any buses that may be overloaded.\n\nConnections:\n${connDetails}`,
      safety: `Perform a preliminary safety assessment of this ICD architecture. Identify single points of failure, missing redundancy, and criticality concerns per ARP 4761.\n\nSystems:\n${sysNames}\n\nConnections:\n${connDetails}`,
      compliance: `Check this ICD architecture for compliance with ARINC 429, ARINC 825, and DO-178C/DO-254 considerations. Flag any non-standard configurations.\n\nSystems:\n${sysNames}\n\nConnections:\n${connDetails}`,
    };

    try {
      const analysis = await callGemini(prompts[analysisType] || prompts.general);
      return { type: analysisType, project: project.name, analysis, timestamp: new Date().toISOString() };
    } catch (e) {
      return reply.status(500).send({ error: 'AI analysis failed: ' + e.message });
    }
  });

  app.post('/api/ai/chat', async (req, reply) => {
    const { message, projectId } = req.body;
    if (!message) return reply.status(400).send({ error: 'Missing message' });

    const pid = projectId || (await db('project').first('id'))?.id;
    let context = '';
    if (pid) {
      const project = await db('project').where('id', pid).first();
      const systems = await db('system').where('project_id', pid);
      context = `Project: ${project?.name} (${project?.aircraft_type}). Systems: ${systems.map(s => s.name).join(', ')}.`;
    }

    try {
      const response = await callGemini(`You are an aerospace ICD expert assistant for ConnectedICD. ${context}\n\nUser question: ${message}\n\nProvide a helpful, technically accurate response.`);
      return { response, timestamp: new Date().toISOString() };
    } catch (e) {
      return reply.status(500).send({ error: 'AI chat failed: ' + e.message });
    }
  });

  // ============================================================
  // AI Insights & Troubleshooting Agent
  // ============================================================

  app.get('/api/ai/insights', async (req) => {
    const projectId = req.query.projectId || (await db('project').first('id'))?.id;
    if (!projectId) return { insights: [] };
    const insights = [];
    const systems = await db('system').where('project_id', projectId);
    const sysIds = systems.map(s => s.id);
    const ports = sysIds.length ? await db('system_port').whereIn('system_id', sysIds) : [];
    const connections = await db('connection').where('project_id', projectId);
    const connIds = connections.map(c => c.id);
    let totalMsgs = 0, totalParams = 0;
    for (const c of connections) { const mc = await db('message').where('connection_id', c.id).count('* as c').first(); totalMsgs += parseInt(mc.c); }
    const msgIds = connIds.length ? (await db('message').whereIn('connection_id', connIds).select('id')).map(m => m.id) : [];
    if (msgIds.length) { const pc = await db('parameter').whereIn('message_id', msgIds).count('* as c').first(); totalParams = parseInt(pc.c); }
    const baselines = await db('baseline').where('project_id', projectId);

    // Unused ports
    for (const sys of systems) {
      const sysPorts = ports.filter(p => p.system_id === sys.id);
      const connPortIds = new Set([...connections.map(c => c.source_port_id), ...connections.map(c => c.dest_port_id)]);
      const unused = sysPorts.filter(p => !connPortIds.has(p.id));
      if (unused.length > 0) insights.push({ type: 'warning', category: 'unused_ports', title: `${sys.name}: ${unused.length} unused port(s)`, description: `Ports ${unused.map(p => p.name).join(', ')} have no connections.`, suggestion: 'Connect or remove unused ports.', priority: 2 });
    }
    // Empty messages
    for (const conn of connections) {
      const msgs = await db('message').where('connection_id', conn.id);
      for (const msg of msgs) { const pc = await db('parameter').where('message_id', msg.id).count('* as c').first(); if (parseInt(pc.c) === 0) insights.push({ type: 'warning', category: 'empty_message', title: `Message ${msg.message_id_primary} has no parameters`, description: `"${msg.name}" on "${conn.name}" is empty.`, suggestion: 'Add parameters or remove the message.', priority: 2 }); }
    }
    // Missing units
    const noUnits = msgIds.length ? await db('parameter').whereIn('message_id', msgIds).where('encoding', '!=', 'discrete').where(function() { this.where('units', '').orWhereNull('units'); }).count('* as c').first() : { c: 0 };
    if (parseInt(noUnits.c) > 0) insights.push({ type: 'info', category: 'missing_units', title: `${noUnits.c} parameter(s) missing units`, description: 'Numeric parameters need engineering units.', suggestion: 'Add units to all numeric parameters.', priority: 3 });
    // No baselines
    if (baselines.length === 0 && totalParams > 5) insights.push({ type: 'warning', category: 'no_baseline', title: 'No baselines frozen', description: `${totalParams} parameters but no baselines. Changes untracked.`, suggestion: 'Freeze a baseline before the next review.', priority: 1 });
    // Orphan systems
    for (const sys of systems) { const sp = ports.filter(p => p.system_id === sys.id).map(p => p.id); if (sp.length > 0 && !connections.some(c => sp.includes(c.source_port_id) || sp.includes(c.dest_port_id))) insights.push({ type: 'error', category: 'orphan_system', title: `${sys.name} is isolated`, description: 'Has ports but no connections.', suggestion: 'Connect this system or remove it.', priority: 1 }); }
    // Completeness
    const score = Math.min(100, Math.round((systems.length > 0 ? 20 : 0) + (connections.length > 0 ? 20 : 0) + (totalMsgs > 0 ? 20 : 0) + (totalParams > 5 ? 20 : 0) + (baselines.length > 0 ? 20 : 0)));
    insights.push({ type: 'info', category: 'completeness', title: `ICD Completeness: ${score}%`, description: `${systems.length} systems, ${connections.length} conn, ${totalMsgs} msgs, ${totalParams} params, ${baselines.length} baselines.`, suggestion: score < 100 ? 'Add more detail to reach 100%.' : 'Well-defined. Freeze a baseline.', priority: 4 });

    insights.sort((a, b) => a.priority - b.priority);
    return { insights, summary: { total: insights.length, errors: insights.filter(i => i.type === 'error').length, warnings: insights.filter(i => i.type === 'warning').length, info: insights.filter(i => i.type === 'info').length } };
  });

  app.post('/api/ai/troubleshoot', async (req, reply) => {
    const { question, projectId } = req.body;
    if (!question) return reply.status(400).send({ error: 'Question required' });
    const pid = projectId || (await db('project').first('id'))?.id;
    const project = await db('project').where('id', pid).first();
    const systems = await db('system').where('project_id', pid);
    const connections = await db('connection').where('project_id', pid);
    let context = `Project: ${project?.name} (${project?.aircraft_type})\nSystems: ${systems.map(s => `${s.name}(${s.system_type})`).join(', ')}\n`;
    for (const conn of connections.slice(0, 15)) {
      const proto = await db('protocol_definition').where('id', conn.protocol_id).first();
      const srcPort = await db('system_port').where('id', conn.source_port_id).first();
      const dstPort = await db('system_port').where('id', conn.dest_port_id).first();
      const srcSys = srcPort ? systems.find(s => s.id === srcPort.system_id) : null;
      const dstSys = dstPort ? systems.find(s => s.id === dstPort.system_id) : null;
      const msgs = await db('message').where('connection_id', conn.id);
      context += `\n${srcSys?.name}→${dstSys?.name} [${proto?.protocol_name}]:\n`;
      for (const msg of msgs.slice(0, 5)) {
        const params = await db('parameter').where('message_id', msg.id);
        context += `  ${msg.message_id_primary} "${msg.name}": ${params.map(p => `${p.name}[bits ${p.bit_offset}-${p.bit_offset+p.bit_length-1}] ${p.encoding} ${p.min_value??'?'}..${p.max_value??'?'} ${p.units}`).join(', ')}\n`;
      }
    }
    try {
      const response = await callGemini(`You are an expert aerospace ICD troubleshooting agent. You have deep access to the project data.\n\nRoles: diagnose ICD issues, suggest specific fixes with parameter names/bit positions, reference ARINC specs, flag safety implications, recommend architecture improvements.\n\nProject data:\n${context}\n\nQuestion: ${question}\n\nProvide specific, actionable answers referencing actual data above.`);
      return { answer: response, context_used: { systems: systems.length, connections: connections.length } };
    } catch (e) { return reply.status(500).send({ error: 'AI failed: ' + e.message }); }
  });

  // ICD Export (Simulink .m script — generates bus objects and signal definitions)
  app.get('/api/export/simulink', async (req, reply) => {
    const projectId = req.query.projectId || (await db('project').first('id')).id;
    const project = await db('project').where('id', projectId).first();
    const systems = await db('system').where('project_id', projectId).orderBy('name');

    let m = '';
    m += `%% ConnectedICD Simulink Export — ${project.name}\n`;
    m += `%% Generated: ${new Date().toISOString()}\n`;
    m += `%% This script creates Simulink.Bus objects and signal definitions\n`;
    m += `%% Run in MATLAB before opening the model\n\n`;

    for (const sys of systems) {
      const ports = await db('system_port').where('system_id', sys.id);
      const portIds = ports.map(p => p.id);
      if (!portIds.length) continue;
      const conns = await db('connection').whereIn('source_port_id', portIds).orWhereIn('dest_port_id', portIds);
      if (!conns.length) continue;

      m += `%% ════════════════════════════════════════\n`;
      m += `%% System: ${sys.name}\n`;
      m += `%% ════════════════════════════════════════\n\n`;

      for (const conn of conns) {
        const proto = await db('protocol_definition').where('id', conn.protocol_id).first();
        const msgs = await db('message').where('connection_id', conn.id).orderBy('message_id_primary');
        if (!msgs.length) continue;

        m += `%% Connection: ${conn.name || proto?.protocol_name}\n`;

        for (const msg of msgs) {
          const params = await db('parameter').where('message_id', msg.id).orderBy('bit_offset');
          if (!params.length) continue;

          const busName = `${sys.name}_${msg.name || msg.message_id_primary}`.replace(/[^a-zA-Z0-9_]/g, '_');

          // Create bus element definitions
          m += `%% Message: ${msg.message_id_primary} — ${msg.name}\n`;
          m += `clear elems;\n`;

          params.forEach((p, i) => {
            const dtMap = { 'BNR': 'double', 'BCD': 'double', 'discrete': 'boolean', 'unsigned': 'uint32', 'signed': 'int32', 'float32': 'single' };
            const dt = dtMap[p.encoding] || 'double';
            m += `elems(${i + 1}) = Simulink.BusElement;\n`;
            m += `elems(${i + 1}).Name = '${p.name}';\n`;
            m += `elems(${i + 1}).DataType = '${dt}';\n`;
            m += `elems(${i + 1}).Dimensions = 1;\n`;
            if (p.units) m += `elems(${i + 1}).DocUnits = '${p.units}';\n`;
            if (p.min_value != null) m += `elems(${i + 1}).Min = ${p.min_value};\n`;
            if (p.max_value != null) m += `elems(${i + 1}).Max = ${p.max_value};\n`;
            if (p.description) m += `elems(${i + 1}).Description = '${p.description.replace(/'/g, "''")}';\n`;
            m += `\n`;
          });

          m += `${busName} = Simulink.Bus;\n`;
          m += `${busName}.Elements = elems;\n`;
          m += `${busName}.Description = '${msg.name} [${proto?.protocol_name}] ${msg.message_id_primary}';\n`;
          m += `assignin('base', '${busName}', ${busName});\n\n`;

          // Create signal objects with scaling
          params.forEach(p => {
            const sigName = `${sys.name}_${p.name}`.replace(/[^a-zA-Z0-9_]/g, '_');
            m += `${sigName} = Simulink.Signal;\n`;
            m += `${sigName}.DataType = 'Bus: ${busName}';\n`;
            if (p.resolution) m += `${sigName}.Description = 'Resolution: ${p.resolution} ${p.units}';\n`;
            m += `assignin('base', '${sigName}', ${sigName});\n`;
          });
          m += `\n`;
        }
      }
    }

    m += `%% ════════════════════════════════════════\n`;
    m += `%% Export complete. ${systems.length} systems processed.\n`;
    m += `%% Load this script before running your Simulink model.\n`;
    m += `disp('ConnectedICD bus definitions loaded successfully.');\n`;

    reply.header('Content-Type', 'text/plain');
    reply.header('Content-Disposition', `attachment; filename="${project.name}_Simulink.m"`);
    return reply.send(m);
  });

  // ICD Export (DBC — Vector CANdb++ format for CAN/A825 signals)
  app.get('/api/export/dbc', async (req, reply) => {
    const projectId = req.query.projectId || (await db('project').first('id')).id;
    const project = await db('project').where('id', projectId).first();

    // Find all A825/CAN connections
    const a825Proto = await db('protocol_definition').whereRaw("LOWER(protocol_name) LIKE '%825%' OR LOWER(protocol_name) LIKE '%can%'").first();
    if (!a825Proto) return reply.status(404).send({ error: 'No ARINC 825/CAN protocol defined' });

    const connections = await db('connection').where({ project_id: projectId, protocol_id: a825Proto.id });
    if (!connections.length) return reply.status(404).send({ error: 'No CAN/A825 connections in this project' });

    // Build DBC content
    let dbc = '';
    dbc += 'VERSION ""\n\n';
    dbc += 'NS_ :\n\n';
    dbc += 'BS_:\n\n';

    // Collect all nodes (systems)
    const nodeSet = new Set();
    for (const conn of connections) {
      const srcPort = await db('system_port').where('id', conn.source_port_id).first();
      const dstPort = await db('system_port').where('id', conn.dest_port_id).first();
      if (srcPort) { const sys = await db('system').where('id', srcPort.system_id).first(); if (sys) nodeSet.add(sys.name); }
      if (dstPort) { const sys = await db('system').where('id', dstPort.system_id).first(); if (sys) nodeSet.add(sys.name); }
    }
    dbc += 'BU_: ' + [...nodeSet].join(' ') + '\n\n';

    // Messages and signals
    for (const conn of connections) {
      const msgs = await db('message').where('connection_id', conn.id).orderBy('message_id_primary');
      const srcPort = await db('system_port').where('id', conn.source_port_id).first();
      const srcSys = srcPort ? await db('system').where('id', srcPort.system_id).first() : null;
      const txNode = srcSys?.name || 'Vector__XXX';

      for (const msg of msgs) {
        const params = await db('parameter').where('message_id', msg.id).orderBy('bit_offset');
        const canId = msg.protocol_attrs?.can_id || msg.message_id_primary;
        const dlc = msg.protocol_attrs?.dlc || 8;
        // Parse CAN ID — handle hex strings
        let idNum = 0;
        if (typeof canId === 'string') {
          idNum = canId.startsWith('0x') ? parseInt(canId, 16) : parseInt(canId);
        } else { idNum = canId; }
        // Extended frame flag (bit 31)
        const isExtended = idNum > 0x7FF;
        const dbcId = isExtended ? (idNum | 0x80000000) >>> 0 : idNum;

        dbc += `BO_ ${dbcId} ${msg.name.replace(/\s+/g, '_')}: ${dlc} ${txNode}\n`;

        for (const p of params) {
          const startBit = p.bit_offset || 0;
          const length = p.bit_length || 1;
          const byteOrder = p.byte_order === 'little_endian' ? 1 : 0; // 0=Motorola(BE), 1=Intel(LE)
          const signed = (p.encoding === 'signed' || p.encoding === 'BNR') ? '-' : '+';
          const factor = p.scale_factor || 1;
          const offset = p.offset_value || 0;
          const min = p.min_value ?? 0;
          const max = p.max_value ?? 0;
          const unit = p.units || '';

          dbc += ` SG_ ${p.name} : ${startBit}|${length}@${byteOrder}${signed} (${factor},${offset}) [${min}|${max}] "${unit}" Vector__XXX\n`;
        }
        dbc += '\n';
      }
    }

    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Disposition', `attachment; filename="${project.name}_CAN.dbc"`);
    return reply.send(dbc);
  });

  // ICD Export (PDF)
  app.get('/api/export/icd-pdf', async (req, reply) => {
    const PDFDocument = require('pdfkit');
    const projectId = req.query.projectId || (await db('project').first('id')).id;
    const project = await db('project').where('id', projectId).first();
    const systems = await db('system').where('project_id', projectId).orderBy('name');

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));

    // Title page
    doc.fontSize(24).text('Interface Control Document', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).text(project.name, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#666').text(`Aircraft: ${project.aircraft_type || 'N/A'}  |  Basis: ${project.certification_basis || 'N/A'}  |  Phase: ${project.program_phase || 'N/A'}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.text(`Generated: ${new Date().toISOString().split('T')[0]}  |  Systems: ${systems.length}`, { align: 'center' });
    doc.fillColor('#000');

    for (const sys of systems) {
      const ports = await db('system_port').where('system_id', sys.id);
      const portIds = ports.map(p => p.id);
      if (!portIds.length) continue;
      const conns = await db('connection').whereIn('source_port_id', portIds).orWhereIn('dest_port_id', portIds);
      if (!conns.length) continue;

      doc.addPage();
      doc.fontSize(16).text(sys.name, { underline: true });
      doc.fontSize(9).fillColor('#666').text(`${sys.system_type} | ${sys.manufacturer || ''} | ATA ${sys.ata_chapter || 'N/A'}`);
      doc.fillColor('#000').moveDown();

      for (const conn of conns) {
        const proto = await db('protocol_definition').where('id', conn.protocol_id).first();
        const msgs = await db('message').where('connection_id', conn.id).orderBy('message_id_primary');
        if (!msgs.length) continue;

        doc.fontSize(11).text(`${conn.name || proto?.protocol_name}`, { underline: false });
        doc.moveDown(0.3);

        for (const msg of msgs) {
          const params = await db('parameter').where('message_id', msg.id).orderBy('bit_offset');
          doc.fontSize(9).fillColor('#333').text(`  ${msg.message_id_primary}  ${msg.name}  ${msg.refresh_rate_hz ? msg.refresh_rate_hz + ' Hz' : ''}`);

          for (const p of params) {
            const range = p.min_value != null ? `${p.min_value}..${p.max_value}` : '';
            doc.fontSize(8).fillColor('#555').text(`    ${p.name}  bits ${p.bit_offset}-${p.bit_offset + p.bit_length - 1}  ${p.encoding}  ${range} ${p.units}  ${p.resolution ? 'res:' + p.resolution : ''}`);
          }
        }
        doc.fillColor('#000').moveDown(0.5);
      }
    }

    const end = new Promise(resolve => doc.on('end', resolve));
    doc.end();
    await end;

    const buf = Buffer.concat(chunks);
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${project.name}_ICD.pdf"`);
    return reply.send(buf);
  });

  // ICD Export (Excel)
  app.get('/api/export/icd', async (req, reply) => {
    const ExcelJS = require('exceljs');
    const projectId = req.query.projectId || (await db('project').first('id')).id;
    const project = await db('project').where('id', projectId).first();
    const systems = await db('system').where('project_id', projectId).orderBy('name');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ConnectedICD';

    // Summary sheet
    const summary = wb.addWorksheet('Summary');
    summary.columns = [{ header: 'Property', key: 'prop', width: 25 }, { header: 'Value', key: 'val', width: 40 }];
    summary.addRow({ prop: 'Project', val: project.name });
    summary.addRow({ prop: 'Aircraft Type', val: project.aircraft_type });
    summary.addRow({ prop: 'Certification Basis', val: project.certification_basis });
    summary.addRow({ prop: 'Phase', val: project.program_phase });
    summary.addRow({ prop: 'Systems', val: systems.length });
    summary.addRow({ prop: 'Generated', val: new Date().toISOString() });
    summary.getRow(1).font = { bold: true };

    // Per-system sheets
    for (const sys of systems) {
      const ports = await db('system_port').where('system_id', sys.id);
      const portIds = ports.map(p => p.id);
      if (!portIds.length) continue;
      const conns = await db('connection').whereIn('source_port_id', portIds).orWhereIn('dest_port_id', portIds);
      if (!conns.length) continue;

      const ws = wb.addWorksheet(sys.name.substring(0, 31));
      ws.columns = [
        { header: 'Connection', key: 'conn', width: 25 },
        { header: 'Message ID', key: 'mid', width: 15 },
        { header: 'Message Name', key: 'mname', width: 25 },
        { header: 'Rate (Hz)', key: 'rate', width: 10 },
        { header: 'Parameter', key: 'param', width: 25 },
        { header: 'Bits', key: 'bits', width: 12 },
        { header: 'Encoding', key: 'enc', width: 10 },
        { header: 'Range', key: 'range', width: 20 },
        { header: 'Resolution', key: 'res', width: 12 },
        { header: 'Units', key: 'units', width: 10 },
      ];
      ws.getRow(1).font = { bold: true };

      for (const conn of conns) {
        const proto = await db('protocol_definition').where('id', conn.protocol_id).first();
        const msgs = await db('message').where('connection_id', conn.id).orderBy('message_id_primary');
        for (const msg of msgs) {
          const params = await db('parameter').where('message_id', msg.id).orderBy('bit_offset');
          if (params.length === 0) {
            ws.addRow({ conn: conn.name || proto.protocol_name, mid: msg.message_id_primary, mname: msg.name, rate: msg.refresh_rate_hz });
          }
          for (const p of params) {
            ws.addRow({ conn: conn.name || proto.protocol_name, mid: msg.message_id_primary, mname: msg.name, rate: msg.refresh_rate_hz, param: p.name, bits: `${p.bit_offset}-${p.bit_offset + p.bit_length - 1}`, enc: p.encoding, range: p.min_value != null ? `${p.min_value} to ${p.max_value}` : '', res: p.resolution, units: p.units });
          }
        }
      }
    }

    const buf = await wb.xlsx.writeBuffer();
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename="${project.name}_ICD.xlsx"`);
    return reply.send(Buffer.from(buf));
  });

  // ============================================================
  // Live Hardware Connectivity
  // ============================================================

  const liveSessions = new Map(); // sessionId -> { interval, params, adapterId }
  const { SocketCANAdapter } = require('./lib/socketcan-adapter.js');

  app.get('/api/live/adapters', async () => {
    // Detect real SocketCAN interfaces
    const canInterfaces = await SocketCANAdapter.listInterfaces();
    const realAdapters = canInterfaces.map(iface => ({
      id: `can:${iface.name}`,
      name: `${iface.name} (${iface.type === 'virtual' ? 'Virtual CAN' : 'Hardware CAN'})`,
      protocol: 'ARINC 825 / CAN',
      status: iface.isUp ? 'available' : 'down',
      type: iface.type,
      interface: iface.name,
    }));

    // Always include simulators
    const simulators = [
      { id: 'sim-a429', name: 'Simulated ARINC 429', protocol: 'ARINC 429', status: 'available', type: 'simulator' },
      { id: 'sim-can', name: 'Simulated CAN/A825', protocol: 'ARINC 825', status: 'available', type: 'simulator' },
      { id: 'sim-disc', name: 'Simulated Discrete I/O', protocol: 'Discrete', status: 'available', type: 'simulator' },
    ];

    return [...realAdapters, ...simulators];
  });

  app.post('/api/live/start', async (req, reply) => {
    const { adapterId, projectId, connectionId } = req.body;
    if (!adapterId) return reply.status(400).send({ error: 'adapterId required' });

    const pid = projectId || (await db('project').first('id'))?.id;
    // Get parameters to monitor
    let params = [];
    if (connectionId) {
      const msgs = await db('message').where('connection_id', connectionId);
      for (const m of msgs) {
        const ps = await db('parameter').where('message_id', m.id);
        params.push(...ps.map(p => ({ ...p, message_name: m.name, message_id_primary: m.message_id_primary })));
      }
    } else {
      // Get all parameters in project
      const systems = await db('system').where('project_id', pid);
      const sysIds = systems.map(s => s.id);
      const portIds = sysIds.length ? (await db('system_port').whereIn('system_id', sysIds).select('id')).map(p => p.id) : [];
      const conns = portIds.length ? await db('connection').where('project_id', pid) : [];
      for (const c of conns.slice(0, 5)) {
        const msgs = await db('message').where('connection_id', c.id).limit(3);
        for (const m of msgs) {
          const ps = await db('parameter').where('message_id', m.id);
          params.push(...ps.map(p => ({ ...p, message_name: m.name, message_id_primary: m.message_id_primary })));
        }
      }
    }

    const sessionId = require('crypto').randomUUID();
    liveSessions.set(sessionId, { adapterId, params, readings: [], startedAt: new Date().toISOString() });

    // If real CAN adapter, start capture
    if (adapterId.startsWith('can:')) {
      const ifaceName = adapterId.replace('can:', '');
      const adapter = new SocketCANAdapter(ifaceName);
      const session = liveSessions.get(sessionId);
      session.canAdapter = adapter;
      session.isRealHardware = true;

      adapter.on('frame', (frame) => {
        // Match frame to parameters by CAN ID
        const matchingParams = params.filter(p => {
          const paramCanId = p.protocol_attrs?.can_id;
          if (!paramCanId) return false;
          const paramIdNum = typeof paramCanId === 'string' && paramCanId.startsWith('0x') ? parseInt(paramCanId, 16) : parseInt(paramCanId);
          return paramIdNum === frame.canId;
        });

        if (matchingParams.length > 0) {
          const decoded = SocketCANAdapter.decodeFrame(frame, matchingParams);
          const readings = decoded.map(d => ({
            ...d,
            message_id: frame.canIdHex,
            timestamp: frame.timestampISO,
            min_value: matchingParams.find(p => p.name === d.parameter_name)?.min_value,
            max_value: matchingParams.find(p => p.name === d.parameter_name)?.max_value,
          }));
          session.readings.push(...readings);
          if (session.readings.length > 2000) session.readings = session.readings.slice(-1000);
        }
      });

      adapter.on('error', (err) => { session.lastError = err.message; });
      adapter.start();
    }

    reply.status(201);
    return { sessionId, adapterId, parameterCount: params.length, parameters: params.map(p => ({ id: p.id, name: p.name, units: p.units, min: p.min_value, max: p.max_value, message: p.message_id_primary })) };
  });

  app.get('/api/live/session/:id', async (req) => {
    const session = liveSessions.get(req.params.id);
    if (!session) return { error: 'Session not found' };
    return { sessionId: req.params.id, adapterId: session.adapterId, parameterCount: session.params.length, readingCount: session.readings.length, startedAt: session.startedAt };
  });

  // Get simulated live readings for a session
  app.get('/api/live/session/:id/readings', async (req) => {
    const session = liveSessions.get(req.params.id);
    if (!session) return { error: 'Session not found' };

    // Real hardware — return captured and decoded readings
    if (session.isRealHardware) {
      const latest = session.readings.slice(-50);
      return { sessionId: req.params.id, timestamp: new Date().toISOString(), readings: latest, source: 'hardware', frameCount: session.canAdapter?.frameCount || 0, lastError: session.lastError || null };
    }

    // Simulator — generate fake readings
    const now = new Date();
    const readings = session.params.map(p => {
      const min = p.min_value ?? 0;
      const max = p.max_value ?? 100;
      const range = max - min;
      // Simulate value with some noise around midpoint
      const mid = (min + max) / 2;
      const noise = (Math.random() - 0.5) * range * 0.3;
      let value = mid + noise + Math.sin(Date.now() / 1000 + p.bit_offset) * range * 0.2;
      // Occasionally generate out-of-range values (5% chance)
      const outOfRange = Math.random() < 0.05;
      if (outOfRange) value = max + range * 0.1;
      const inRange = value >= min && value <= max;
      const severity = !inRange ? (Math.abs(value - (value > max ? max : min)) > range * 0.2 ? 'error' : 'warning') : null;

      return {
        parameter_id: p.id,
        parameter_name: p.name,
        message_id: p.message_id_primary,
        timestamp: now.toISOString(),
        decoded_value: Math.round(value * 1000) / 1000,
        units: p.units || '',
        in_range: inRange,
        deviation_severity: severity,
        min_value: min,
        max_value: max,
      };
    });

    // Store readings
    session.readings.push(...readings);
    if (session.readings.length > 1000) session.readings = session.readings.slice(-500);

    return { sessionId: req.params.id, timestamp: now.toISOString(), readings };
  });

  app.post('/api/live/stop', async (req) => {
    const { sessionId } = req.body;
    const session = liveSessions.get(sessionId);
    if (!session) return { error: 'Session not found' };
    if (session.canAdapter) session.canAdapter.stop();
    const readingCount = session.readings.length;
    liveSessions.delete(sessionId);
    return { stopped: true, readingCount, source: session.isRealHardware ? 'hardware' : 'simulator' };
  });

  // Send a CAN frame (stimulus/testing)
  app.post('/api/live/send', async (req, reply) => {
    const { sessionId, canId, data } = req.body;
    const session = liveSessions.get(sessionId);
    if (!session?.canAdapter) return reply.status(400).send({ error: 'No active hardware session' });
    try {
      const result = await session.canAdapter.send(canId, data);
      return result;
    } catch (e) { return reply.status(500).send({ error: e.message }); }
  });

  // ============================================================
  // Hardware ICD Templates (reusable LRU definitions)
  // ============================================================

  app.get('/api/hw-templates', async () => {
    const templates = await db('hw_icd_template').orderBy('name');
    const result = [];
    for (const t of templates) {
      const portCount = await db('hw_icd_template_port').where('template_id', t.id).count('* as c').first();
      const fnCount = await db('hw_icd_template_function').where('template_id', t.id).count('* as c').first();
      result.push({ ...t, port_count: parseInt(portCount.c), function_count: parseInt(fnCount.c) });
    }
    return result;
  });

  app.post('/api/hw-templates', async (req, reply) => {
    const b = req.body;
    if (!b.name) return reply.status(400).send({ error: 'Name required' });
    const [tmpl] = await db('hw_icd_template').insert({ name: b.name, manufacturer: b.manufacturer || '', part_number: b.part_number || '', description: b.description || '', system_type: b.system_type || 'lru', ata_chapter: b.ata_chapter || '' }).returning('*');
    // Create template ports
    if (b.ports) for (const p of b.ports) { await db('hw_icd_template_port').insert({ template_id: tmpl.id, name: p.name, protocol_id: p.protocol_id || null, direction: p.direction || 'tx', connector_label: p.connector_label || '' }).catch(() => {}); }
    // Create template functions
    if (b.functions) for (const f of b.functions) { await db('hw_icd_template_function').insert({ template_id: tmpl.id, name: f.name, criticality: f.criticality || 'major', dal: f.dal || '' }).catch(() => {}); }
    reply.status(201); return tmpl;
  });

  app.get('/api/hw-templates/:id', async (req) => {
    const tmpl = await db('hw_icd_template').where('id', req.params.id).first();
    if (!tmpl) return { error: 'Not found' };
    const ports = await db('hw_icd_template_port').leftJoin('protocol_definition', 'hw_icd_template_port.protocol_id', 'protocol_definition.id').where('template_id', tmpl.id).select('hw_icd_template_port.*', 'protocol_definition.protocol_name');
    const functions = await db('hw_icd_template_function').where('template_id', tmpl.id);
    return { ...tmpl, ports, functions };
  });

  app.delete('/api/hw-templates/:id', async (req, reply) => {
    await db('hw_icd_template').where('id', req.params.id).del();
    reply.status(204).send();
  });

  // Instantiate template into a project as a new system
  app.post('/api/hw-templates/:id/instantiate', async (req, reply) => {
    const tmpl = await db('hw_icd_template').where('id', req.params.id).first();
    if (!tmpl) return reply.status(404).send({ error: 'Template not found' });
    const projectId = req.body.project_id || (await db('project').first('id'))?.id;
    const systemName = req.body.name || tmpl.name;

    // Create system from template
    const [sys] = await db('system').insert({ project_id: projectId, name: systemName, description: tmpl.description, manufacturer: tmpl.manufacturer, part_number: tmpl.part_number, ata_chapter: tmpl.ata_chapter, system_type: tmpl.system_type }).returning('*');

    // Copy ports
    const tmplPorts = await db('hw_icd_template_port').where('template_id', tmpl.id);
    for (const p of tmplPorts) {
      await db('system_port').insert({ system_id: sys.id, name: p.name, protocol_id: p.protocol_id, direction: p.direction, connector_label: p.connector_label }).catch(() => {});
    }

    // Copy functions
    const tmplFns = await db('hw_icd_template_function').where('template_id', tmpl.id);
    for (const f of tmplFns) {
      await db('system_function').insert({ system_id: sys.id, name: f.name, criticality: f.criticality, dal: f.dal }).catch(() => {});
    }

    reply.status(201);
    return { system: sys, portsCreated: tmplPorts.length, functionsCreated: tmplFns.length };
  });

  // ============================================================
  // ARINC 653 Software Partitions
  // ============================================================

  app.get('/api/systems/:id/partitions', async (req) => {
    const partitions = await db('software_partition').where('system_id', req.params.id).orderBy('partition_id');
    const result = [];
    for (const p of partitions) {
      const portMappings = await db('partition_port_mapping').join('system_port', 'partition_port_mapping.system_port_id', 'system_port.id').where('partition_port_mapping.partition_id', p.id).select('system_port.name as port_name', 'partition_port_mapping.port_direction', 'partition_port_mapping.refresh_period_ms');
      const fnMappings = await db('partition_function_mapping').join('system_function', 'partition_function_mapping.function_id', 'system_function.id').where('partition_function_mapping.partition_id', p.id).select('system_function.name as function_name', 'system_function.criticality');
      result.push({ ...p, ports: portMappings, functions: fnMappings });
    }
    return result;
  });

  app.post('/api/partitions', async (req, reply) => {
    const b = req.body;
    if (!b.system_id || !b.partition_id || !b.name) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'system_id, partition_id, and name required' } });
    try {
      const [part] = await db('software_partition').insert({
        system_id: b.system_id, partition_id: b.partition_id, name: b.name,
        description: b.description || '', scheduling_period_ms: b.scheduling_period_ms || null,
        scheduling_duration_ms: b.scheduling_duration_ms || null, memory_bytes: b.memory_bytes || null,
        criticality: b.criticality || 'major', dal: b.dal || '',
        partition_type: b.partition_type || 'application',
      }).returning('*');
      reply.status(201); return part;
    } catch (e) { return reply.status(409).send({ error: 'Partition ID already exists on this system' }); }
  });

  app.delete('/api/partitions/:id', async (req, reply) => {
    await db('software_partition').where('id', req.params.id).del();
    reply.status(204).send();
  });

  app.post('/api/partitions/:id/map-port', async (req, reply) => {
    const b = req.body;
    await db('partition_port_mapping').insert({ partition_id: req.params.id, system_port_id: b.port_id, port_direction: b.direction || 'sampling', refresh_period_ms: b.refresh_period_ms || null }).onConflict(['partition_id', 'system_port_id']).ignore();
    reply.status(201).send({ ok: true });
  });

  app.post('/api/partitions/:id/map-function', async (req, reply) => {
    const b = req.body;
    await db('partition_function_mapping').insert({ partition_id: req.params.id, function_id: b.function_id }).onConflict(['partition_id', 'function_id']).ignore();
    reply.status(201).send({ ok: true });
  });

  // ============================================================
  // Cross-Tool Artifact Interface (ConnectedFlow)
  // artifacts.list, artifacts.get, artifacts.export
  // ============================================================

  async function buildConnectedFlowArtifacts(projectId) {
    const project = await db('project').where('id', projectId).first();
    if (!project) return [];
    const systems = await db('system').where('project_id', projectId);
    const sysIds = systems.map(s => s.id);
    const portIds = sysIds.length ? (await db('system_port').whereIn('system_id', sysIds).select('id')).map(p => p.id) : [];
    const connections = await db('connection').where('project_id', projectId);
    let totalMsgs = 0, totalParams = 0;
    for (const c of connections) {
      const mc = await db('message').where('connection_id', c.id).count('* as c').first();
      totalMsgs += parseInt(mc.c);
    }
    const connIds = connections.map(c => c.id);
    const msgIds = connIds.length ? (await db('message').whereIn('connection_id', connIds).select('id')).map(m => m.id) : [];
    if (msgIds.length) { const pc = await db('parameter').whereIn('message_id', msgIds).count('* as c').first(); totalParams = parseInt(pc.c); }

    const signals = await db('signal').where('project_id', projectId);
    const now = new Date().toISOString();
    const artifacts = [];

    // ICD artifacts — one per system pair with connections
    const seenPairs = new Set();
    for (const conn of connections) {
      const srcPort = await db('system_port').where('id', conn.source_port_id).first();
      const dstPort = await db('system_port').where('id', conn.dest_port_id).first();
      if (!srcPort || !dstPort) continue;
      const srcSys = systems.find(s => s.id === srcPort.system_id);
      const dstSys = systems.find(s => s.id === dstPort.system_id);
      if (!srcSys || !dstSys) continue;
      const pairKey = [srcSys.name, dstSys.name].sort().join('-');
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      const pairConns = connections.filter(c2 => {
        const sp = portIds.includes(c2.source_port_id) || portIds.includes(c2.dest_port_id);
        return sp;
      });
      const pairMsgCount = await db('message').whereIn('connection_id', pairConns.filter(c2 => c2.id === conn.id).map(c2 => c2.id)).count('* as c').first();
      artifacts.push({
        id: `ICD-${srcSys.name}-${dstSys.name}`, projectId, toolSource: 'connectedflow',
        artifactType: 'ICD', title: `ICD: ${srcSys.name} ↔ ${dstSys.name}`,
        description: `Interface Control Document between ${srcSys.name} and ${dstSys.name}`,
        version: '1.0', programPhase: project.program_phase,
        applicableReviews: ['SRR', 'PDR', 'CDR'],
        status: parseInt(pairMsgCount.c) > 0 ? 'draft' : 'not-started',
        completeness: parseInt(pairMsgCount.c) > 0 ? 0.5 : 0,
        lastModified: now, modifiedBy: 'system',
        tracesTo: [], tracesFrom: [], relatedArtifacts: [],
        exportFormats: ['json', 'csv', 'html'], reviewReady: false, openIssues: 0, approvals: [],
      });
    }

    // SIGNAL_LIST artifact
    if (totalParams > 0 || signals.length > 0) {
      const defined = totalParams || signals.length;
      const total = Math.max(defined, defined); // In real app, compare against expected
      artifacts.push({
        id: `SIGNAL_LIST-${project.name.replace(/\s+/g, '-')}`, projectId, toolSource: 'connectedflow',
        artifactType: 'SIGNAL_LIST', title: `Signal List: ${project.name}`,
        description: `Complete signal/parameter list for ${project.name}. ${defined} parameters defined.`,
        version: '1.0', programPhase: project.program_phase,
        applicableReviews: ['PDR', 'CDR'],
        status: defined > 0 ? 'draft' : 'not-started',
        completeness: defined > 0 ? 0.7 : 0,
        lastModified: now, modifiedBy: 'system',
        tracesTo: [], tracesFrom: [], relatedArtifacts: [],
        exportFormats: ['json', 'csv', 'html'], reviewReady: false, openIssues: 0, approvals: [],
      });
    }

    // BUS_SPEC artifacts — one per protocol used
    const protosUsed = await db('connection').where('project_id', projectId).join('protocol_definition', 'connection.protocol_id', 'protocol_definition.id').select('protocol_definition.protocol_name').countDistinct('connection.id as conn_count').groupBy('protocol_definition.protocol_name');
    for (const p of protosUsed) {
      artifacts.push({
        id: `BUS_SPEC-${p.protocol_name.replace(/\s+/g, '-')}`, projectId, toolSource: 'connectedflow',
        artifactType: 'BUS_SPEC', title: `Bus Spec: ${p.protocol_name}`,
        description: `${p.protocol_name} bus specification. ${p.conn_count} connections.`,
        version: '1.0', programPhase: project.program_phase,
        applicableReviews: ['PDR', 'CDR'],
        status: 'draft', completeness: 0.6,
        lastModified: now, modifiedBy: 'system',
        tracesTo: [], tracesFrom: [], relatedArtifacts: [],
        exportFormats: ['json', 'csv', 'html'], reviewReady: false, openIssues: 0, approvals: [],
      });
    }

    // N2_MATRIX artifact
    if (systems.length > 1) {
      const filledCells = connections.length;
      const totalCells = systems.length * (systems.length - 1);
      artifacts.push({
        id: `N2_MATRIX-${project.name.replace(/\s+/g, '-')}`, projectId, toolSource: 'connectedflow',
        artifactType: 'N2_MATRIX', title: `N² Matrix: ${project.name}`,
        description: `${systems.length} systems, ${filledCells}/${totalCells} interfaces defined.`,
        version: '1.0', programPhase: project.program_phase,
        applicableReviews: ['SRR', 'PDR'],
        status: filledCells > 0 ? 'draft' : 'not-started',
        completeness: totalCells > 0 ? filledCells / totalCells : 0,
        lastModified: now, modifiedBy: 'system',
        tracesTo: [], tracesFrom: [], relatedArtifacts: [],
        exportFormats: ['json', 'html'], reviewReady: false, openIssues: 0, approvals: [],
      });
    }

    return artifacts;
  }

  app.post('/api/artifacts/list', async (req) => {
    const { projectId, programPhase, artifactType, status, applicableReview } = req.body || {};
    const pid = projectId || (await db('project').first('id'))?.id;
    if (!pid) return { artifacts: [] };
    let artifacts = await buildConnectedFlowArtifacts(pid);
    if (programPhase) artifacts = artifacts.filter(a => a.programPhase === programPhase);
    if (artifactType) artifacts = artifacts.filter(a => a.artifactType === artifactType);
    if (status) artifacts = artifacts.filter(a => a.status === status);
    if (applicableReview) artifacts = artifacts.filter(a => a.applicableReviews.includes(applicableReview));
    return { artifacts };
  });

  app.post('/api/artifacts/get', async (req) => {
    const { artifactId, projectId } = req.body || {};
    const pid = projectId || (await db('project').first('id'))?.id;
    if (!pid || !artifactId) return { error: 'artifactId and projectId required' };
    const artifacts = await buildConnectedFlowArtifacts(pid);
    const artifact = artifacts.find(a => a.id === artifactId);
    if (!artifact) return { error: 'Artifact not found' };
    return { artifact };
  });

  app.post('/api/artifacts/export', async (req) => {
    const { artifactId, format, projectId } = req.body || {};
    const pid = projectId || (await db('project').first('id'))?.id;
    if (!pid || !artifactId) return { error: 'artifactId, format, and projectId required' };
    const artifacts = await buildConnectedFlowArtifacts(pid);
    const artifact = artifacts.find(a => a.id === artifactId);
    if (!artifact) return { error: 'Artifact not found' };
    // For now, return JSON content directly
    return { artifact, format: format || 'json', exportedAt: new Date().toISOString() };
  });

  // Global error handler — never leak DB internals to client (§8 Backend)

  // ============================================================
  // Digital Thread — v2.0 (trace, impact, validate, diff)
  // ============================================================

  // digitalThread.trace — trace requirement → interface → signal → test
  app.get('/api/digital-thread/trace/:signalId', async (req) => {
    const sig = await db('signal').where('id', req.params.signalId).first();
    if (!sig) return { error: 'Signal not found' };
    const logical = await db('logical_layer').where('signal_id', sig.id).first();
    const transport = await db('transport_layer').where('signal_id', sig.id).first();
    const physical = await db('physical_layer').where('signal_id', sig.id).first();
    const traceLinks = await db('trace_link').where('signal_id', sig.id);
    const comments = await db('signal_comment').where('signal_id', sig.id);
    const ownership = await db('signal_ownership').where('signal_id', sig.id).first();
    return {
      signal: sig,
      layers: { logical, transport, physical },
      traceLinks,
      ownership,
      commentCount: comments.length,
      thread: [
        { level: 'requirement', items: traceLinks.map(t => ({ id: t.external_requirement_id, text: t.requirement_text, tool: t.requirement_tool, status: t.link_status })) },
        { level: 'interface', items: [{ signalId: sig.id, name: sig.name, source: logical?.source_system, dest: logical?.dest_system, protocol: transport?.protocol }] },
        { level: 'physical', items: physical ? [{ connector: physical.connector, pin: physical.pin_number, wire: physical.wire_gauge }] : [] },
      ],
    };
  });

  // digitalThread.impact — when interface changes, show all affected items
  app.get('/api/digital-thread/impact/:signalId', async (req) => {
    const sig = await db('signal').where('id', req.params.signalId).first();
    if (!sig) return { error: 'Signal not found' };
    const logical = await db('logical_layer').where('signal_id', sig.id).first();
    const affected = { requirements: [], systems: [], connections: [], signals: [] };

    // Affected requirements via trace links
    const traces = await db('trace_link').where('signal_id', sig.id);
    affected.requirements = traces.map(t => ({ id: t.external_requirement_id, text: t.requirement_text, tool: t.requirement_tool }));

    // Affected systems (source and dest)
    if (logical) {
      const systems = await db('system').whereIn('name', [logical.source_system, logical.dest_system].filter(Boolean));
      affected.systems = systems.map(s => ({ id: s.id, name: s.name }));

      // Affected connections between these systems
      const systemIds = systems.map(s => s.id);
      if (systemIds.length > 0) {
        const ports = await db('system_port').whereIn('system_id', systemIds);
        const portIds = ports.map(p => p.id);
        if (portIds.length > 0) {
          const conns = await db('connection').whereIn('source_port_id', portIds).orWhereIn('dest_port_id', portIds);
          affected.connections = conns.map(c => ({ id: c.id, name: c.name }));
        }
      }
    }

    // Other signals on same bus/protocol
    if (logical) {
      const related = await db('signal')
        .leftJoin('transport_layer', 'signal.id', 'transport_layer.signal_id')
        .where('signal.project_id', sig.project_id)
        .whereNot('signal.id', sig.id)
        .select('signal.id', 'signal.name', 'transport_layer.protocol');
      const sigTransport = await db('transport_layer').where('signal_id', sig.id).first();
      affected.signals = related.filter(r => r.protocol && r.protocol === sigTransport?.protocol);
    }

    return { signal: { id: sig.id, name: sig.name }, impactedItems: affected, totalAffected: affected.requirements.length + affected.systems.length + affected.connections.length };
  });

  // icd.validate — check ICD completeness
  app.get('/api/icd/validate/:projectId', async (req) => {
    const signals = await db('signal').where('project_id', req.params.projectId);
    const issues = [];
    for (const sig of signals) {
      const logical = await db('logical_layer').where('signal_id', sig.id).first();
      const transport = await db('transport_layer').where('signal_id', sig.id).first();
      if (!logical) issues.push({ signalId: sig.id, name: sig.name, severity: 'error', message: 'Missing logical layer definition' });
      else {
        if (!logical.source_system) issues.push({ signalId: sig.id, name: sig.name, severity: 'warning', message: 'No source system assigned' });
        if (!logical.dest_system) issues.push({ signalId: sig.id, name: sig.name, severity: 'warning', message: 'No destination system assigned' });
        if (!logical.data_type) issues.push({ signalId: sig.id, name: sig.name, severity: 'warning', message: 'No data type specified' });
        if (!logical.units) issues.push({ signalId: sig.id, name: sig.name, severity: 'info', message: 'No units specified' });
      }
      if (!transport) issues.push({ signalId: sig.id, name: sig.name, severity: 'warning', message: 'Missing transport layer definition' });
      else if (!transport.protocol) issues.push({ signalId: sig.id, name: sig.name, severity: 'warning', message: 'No protocol specified' });
      const ownership = await db('signal_ownership').where('signal_id', sig.id).first();
      if (!ownership) issues.push({ signalId: sig.id, name: sig.name, severity: 'info', message: 'No ownership assigned' });
    }
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    return { totalSignals: signals.length, issues, summary: { errors, warnings, info: issues.length - errors - warnings }, completeness: signals.length > 0 ? Math.round(((signals.length - errors) / signals.length) * 100) : 100 };
  });

  // icd.diff — compare two baseline snapshots
  app.get('/api/icd/diff/:baselineA/:baselineB', async (req) => {
    const snapA = await db('baseline_snapshot').where('baseline_id', req.params.baselineA);
    const snapB = await db('baseline_snapshot').where('baseline_id', req.params.baselineB);
    const mapA = new Map(snapA.map(s => [s.signal_id, s]));
    const mapB = new Map(snapB.map(s => [s.signal_id, s]));
    const added = snapB.filter(s => !mapA.has(s.signal_id)).map(s => ({ signalId: s.signal_id, change: 'added' }));
    const removed = snapA.filter(s => !mapB.has(s.signal_id)).map(s => ({ signalId: s.signal_id, change: 'removed' }));
    const modified = [];
    for (const [sigId, a] of mapA) {
      const b = mapB.get(sigId);
      if (b && JSON.stringify(a.snapshot_data) !== JSON.stringify(b.snapshot_data)) {
        modified.push({ signalId: sigId, change: 'modified', before: a.snapshot_data, after: b.snapshot_data });
      }
    }
    return { baselineA: req.params.baselineA, baselineB: req.params.baselineB, changes: { added, removed, modified }, totalChanges: added.length + removed.length + modified.length };
  });


  // ============================================================
  // MBSE Integration — v2.0 (SysML import, ReqIF sync, ICD generation)
  // ============================================================

  // mbse.importSysML — import SysML v2 model interfaces (JSON-LD format)
  app.post('/api/mbse/import-sysml', async (req, reply) => {
    const { projectId, model } = req.body || {};
    if (!projectId || !model) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'projectId and model required' } });

    const imported = { systems: 0, connections: 0, signals: 0 };
    // Parse SysML v2 JSON-LD blocks/parts as systems
    const parts = Array.isArray(model.parts) ? model.parts : [];
    for (const part of parts) {
      const existing = await db('system').where({ name: part.name, project_id: projectId }).first();
      if (!existing) {
        await db('system').insert({ name: part.name, description: part.description || '', project_id: projectId }).catch(() => {});
        imported.systems++;
      }
    }
    // Parse SysML ports/flows as signals
    const flows = Array.isArray(model.flows) ? model.flows : [];
    for (const flow of flows) {
      const [sig] = await db('signal').insert({ name: flow.name || `${flow.source}-${flow.target}`, project_id: projectId, criticality: flow.criticality || 'major', status: 'draft' }).returning('*').catch(() => [null]);
      if (sig) {
        await db('logical_layer').insert({ signal_id: sig.id, source_system: flow.source || '', dest_system: flow.target || '', data_type: flow.dataType || '', units: flow.units || '', description: flow.description || '', refresh_rate_hz: flow.refreshRate || 0, functional_category: '' }).catch(() => {});
        if (flow.protocol) await db('transport_layer').insert({ signal_id: sig.id, protocol: flow.protocol }).catch(() => {});
        imported.signals++;
      }
    }
    // Parse connections
    const connectors = Array.isArray(model.connectors) ? model.connectors : [];
    for (const conn of connectors) {
      const src = await db('system').where({ name: conn.source, project_id: projectId }).first();
      const dst = await db('system').where({ name: conn.target, project_id: projectId }).first();
      if (src && dst) {
        await db('connection').insert({ name: conn.name || `${conn.source}-${conn.target}`, source_system_id: src.id, dest_system_id: dst.id, project_id: projectId }).catch(() => {});
        imported.connections++;
      }
    }
    return { status: 'imported', imported };
  });

  // mbse.syncRequirements — sync requirements via ReqIF format
  app.post('/api/mbse/sync-requirements', async (req, reply) => {
    const { projectId, requirements: reqs, direction } = req.body || {};
    if (!projectId || !reqs) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'projectId and requirements required' } });

    const results = { created: 0, updated: 0, linked: 0 };
    for (const r of (Array.isArray(reqs) ? reqs : [])) {
      // Check if trace link already exists
      const existing = await db('trace_link').where({ external_requirement_id: r.id }).first();
      if (existing) {
        await db('trace_link').where('id', existing.id).update({ requirement_text: r.text, link_status: 'synced', last_synced_at: db.fn.now() });
        results.updated++;
      } else if (r.signalId) {
        await db('trace_link').insert({ signal_id: r.signalId, requirement_tool: r.tool || 'external', external_requirement_id: r.id, requirement_text: r.text, link_status: 'synced', direction: direction || 'bidirectional', last_synced_at: db.fn.now() }).catch(() => {});
        results.linked++;
      } else {
        results.created++;
      }
    }
    return { status: 'synced', results };
  });

  // mbse.generateICD — auto-generate ICD from system architecture
  app.post('/api/mbse/generate-icd', async (req, reply) => {
    const { projectId } = req.body || {};
    if (!projectId) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'projectId required' } });

    const systems = await db('system').where('project_id', projectId);
    const connections = await db('connection').where('project_id', projectId);
    const signals = await db('signal').where('project_id', projectId).leftJoin('logical_layer', 'signal.id', 'logical_layer.signal_id').leftJoin('transport_layer', 'signal.id', 'transport_layer.signal_id').select('signal.*', 'logical_layer.source_system', 'logical_layer.dest_system', 'logical_layer.data_type', 'logical_layer.units', 'transport_layer.protocol');

    // Group signals by interface (source→dest pair)
    const interfaces = new Map();
    for (const sig of signals) {
      const key = `${sig.source_system || 'unknown'} → ${sig.dest_system || 'unknown'}`;
      if (!interfaces.has(key)) interfaces.set(key, { source: sig.source_system, dest: sig.dest_system, signals: [] });
      interfaces.get(key).signals.push({ id: sig.id, name: sig.name, dataType: sig.data_type, units: sig.units, protocol: sig.protocol });
    }

    return {
      projectId,
      generatedAt: new Date().toISOString(),
      systems: systems.map(s => ({ id: s.id, name: s.name })),
      connections: connections.map(c => ({ id: c.id, name: c.name })),
      interfaces: [...interfaces.entries()].map(([key, val]) => ({ interface: key, ...val, signalCount: val.signals.length })),
      totalSystems: systems.length,
      totalConnections: connections.length,
      totalSignals: signals.length,
      totalInterfaces: interfaces.size,
    };
  });

  app.setErrorHandler((error, req, reply) => {
    const status = error.statusCode || 500;
    if (status >= 500) {
      req.log.error({ err: error, url: req.url, method: req.method }, 'Internal error');
      return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred' } });
    }
    return reply.status(status).send({ error: { code: error.code || 'ERROR', message: error.message } });
  });

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log('ConnectedICD API on http://localhost:' + PORT);
}

start().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
