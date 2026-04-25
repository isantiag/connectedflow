/**
 * Digital Thread & ICD Validation Tools for ConnectedICD.
 *
 * Provides traceability, impact analysis, ICD completeness validation,
 * and baseline diffing — all operating against the ConnectedICD schema.
 */

import { type Knex } from 'knex';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TraceChainItem {
  type: 'requirement' | 'interface' | 'signal' | 'message' | 'parameter' | 'test' | 'verification';
  id: string;
  name: string;
  metadata?: Record<string, unknown>;
}

export interface TraceResult {
  rootId: string;
  chain: TraceChainItem[];
}

export interface ImpactItem {
  type: 'signal' | 'message' | 'parameter' | 'requirement' | 'test' | 'connection';
  id: string;
  name: string;
}

export interface ImpactResult {
  interfaceId: string;
  affected: ImpactItem[];
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  entity: string;
  entityId: string;
  message: string;
}

export interface ValidateResult {
  systemId: string;
  valid: boolean;
  issues: ValidationIssue[];
}

export interface DiffEntry {
  type: 'interface' | 'signal' | 'parameter' | 'message';
  id: string;
  name: string;
  change: 'added' | 'removed' | 'modified';
  details?: Record<string, { before: unknown; after: unknown }>;
}

export interface DiffResult {
  baselineId1: string;
  baselineId2: string;
  entries: DiffEntry[];
}

// ---------------------------------------------------------------------------
// DB query interface (injectable for testing)
// ---------------------------------------------------------------------------

export interface DbQuery {
  raw<T = unknown>(sql: string, bindings?: unknown[]): Promise<{ rows: T[] }>;
}

function wrapKnex(knex: Knex): DbQuery {
  return {
    async raw<T>(sql: string, bindings: unknown[] = []) {
      const result = await knex.raw(sql, bindings);
      return { rows: (result.rows ?? result) as T[] };
    },
  };
}

// ---------------------------------------------------------------------------
// digitalThread namespace
// ---------------------------------------------------------------------------

export const digitalThread = {
  /**
   * Trace from any item (requirement, signal, parameter, message) through
   * the full chain: requirement → interface → signal → message → parameter → test → verification.
   */
  async trace(itemId: string, db: DbQuery): Promise<TraceResult> {
    const chain: TraceChainItem[] = [];

    // Try as signal first
    const signals = await db.raw<{ id: string; name: string; project_id: string }>(
      `SELECT id, name, project_id FROM signal WHERE id = ?`, [itemId],
    );
    if (signals.rows.length > 0) {
      const sig = signals.rows[0];
      chain.push({ type: 'signal', id: sig.id, name: sig.name });
      await traceFromSignal(sig.id, chain, db);
      await traceRequirementsForSignal(sig.id, chain, db);
      return { rootId: itemId, chain };
    }

    // Try as parameter
    const params = await db.raw<{ id: string; name: string; message_id: string }>(
      `SELECT id, name, message_id FROM parameter WHERE id = ?`, [itemId],
    );
    if (params.rows.length > 0) {
      const p = params.rows[0];
      chain.push({ type: 'parameter', id: p.id, name: p.name });
      await traceFromParameter(p, chain, db);
      return { rootId: itemId, chain };
    }

    // Try as message
    const msgs = await db.raw<{ id: string; name: string; connection_id: string }>(
      `SELECT id, name, connection_id FROM message WHERE id = ?`, [itemId],
    );
    if (msgs.rows.length > 0) {
      const m = msgs.rows[0];
      chain.push({ type: 'message', id: m.id, name: m.name });
      await traceFromMessage(m, chain, db);
      return { rootId: itemId, chain };
    }

    // Try as trace_link (requirement)
    const reqs = await db.raw<{ id: string; external_requirement_id: string; requirement_text: string; signal_id: string }>(
      `SELECT id, external_requirement_id, requirement_text, signal_id FROM trace_link WHERE id = ?`, [itemId],
    );
    if (reqs.rows.length > 0) {
      const r = reqs.rows[0];
      chain.push({ type: 'requirement', id: r.id, name: r.external_requirement_id, metadata: { text: r.requirement_text } });
      const sigRows = await db.raw<{ id: string; name: string }>(
        `SELECT id, name FROM signal WHERE id = ?`, [r.signal_id],
      );
      if (sigRows.rows.length > 0) {
        chain.push({ type: 'signal', id: sigRows.rows[0].id, name: sigRows.rows[0].name });
        await traceFromSignal(sigRows.rows[0].id, chain, db);
      }
      return { rootId: itemId, chain };
    }

    return { rootId: itemId, chain };
  },

  /**
   * Given a connection (interface) change, find all affected items.
   */
  async impact(interfaceId: string, db: DbQuery): Promise<ImpactResult> {
    const affected: ImpactItem[] = [];

    // Messages on this connection
    const msgs = await db.raw<{ id: string; name: string }>(
      `SELECT id, name FROM message WHERE connection_id = ?`, [interfaceId],
    );
    for (const m of msgs.rows) {
      affected.push({ type: 'message', id: m.id, name: m.name });

      // Parameters in each message
      const params = await db.raw<{ id: string; name: string }>(
        `SELECT id, name FROM parameter WHERE message_id = ?`, [m.id],
      );
      for (const p of params.rows) {
        affected.push({ type: 'parameter', id: p.id, name: p.name });
      }
    }

    // Signals linked via signal_parameter_link to affected parameters
    const paramIds = affected.filter(a => a.type === 'parameter').map(a => a.id);
    if (paramIds.length > 0) {
      const placeholders = paramIds.map(() => '?').join(',');
      const sigs = await db.raw<{ id: string; name: string }>(
        `SELECT DISTINCT s.id, s.name FROM signal s
         JOIN signal_parameter_link spl ON spl.signal_id = s.id
         WHERE spl.parameter_id IN (${placeholders})`, paramIds,
      );
      for (const s of sigs.rows) {
        affected.push({ type: 'signal', id: s.id, name: s.name });
      }

      // Requirements linked to those signals
      const sigIds = sigs.rows.map(s => s.id);
      if (sigIds.length > 0) {
        const sp2 = sigIds.map(() => '?').join(',');
        const reqs = await db.raw<{ id: string; external_requirement_id: string }>(
          `SELECT id, external_requirement_id FROM trace_link WHERE signal_id IN (${sp2})`, sigIds,
        );
        for (const r of reqs.rows) {
          affected.push({ type: 'requirement', id: r.id, name: r.external_requirement_id });
        }
      }
    }

    return { interfaceId, affected };
  },
};

// ---------------------------------------------------------------------------
// icd namespace
// ---------------------------------------------------------------------------

export const icd = {
  /**
   * Validate ICD completeness for a system:
   * - Every port has at least one connection
   * - Every connection has at least one message
   * - Every message has at least one parameter
   * - Every parameter has units and a range (min/max)
   */
  async validate(systemId: string, db: DbQuery): Promise<ValidateResult> {
    const issues: ValidationIssue[] = [];

    // Ports without connections
    const orphanPorts = await db.raw<{ id: string; name: string }>(
      `SELECT sp.id, sp.name FROM system_port sp
       WHERE sp.system_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM connection c WHERE c.source_port_id = sp.id OR c.dest_port_id = sp.id
       )`, [systemId],
    );
    for (const p of orphanPorts.rows) {
      issues.push({ level: 'warning', entity: 'port', entityId: p.id, message: `Port "${p.name}" has no connections` });
    }

    // Connections with no messages
    const conns = await db.raw<{ id: string; name: string }>(
      `SELECT c.id, c.name FROM connection c
       JOIN system_port sp ON sp.id = c.source_port_id OR sp.id = c.dest_port_id
       WHERE sp.system_id = ?`, [systemId],
    );
    for (const c of conns.rows) {
      const msgCount = await db.raw<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM message WHERE connection_id = ?`, [c.id],
      );
      if (Number(msgCount.rows[0]?.cnt) === 0) {
        issues.push({ level: 'error', entity: 'connection', entityId: c.id, message: `Connection "${c.name}" has no messages` });
      }
    }

    // Messages with no parameters
    const connIds = conns.rows.map(c => c.id);
    if (connIds.length > 0) {
      const ph = connIds.map(() => '?').join(',');
      const emptyMsgs = await db.raw<{ id: string; name: string }>(
        `SELECT m.id, m.name FROM message m
         WHERE m.connection_id IN (${ph})
         AND NOT EXISTS (SELECT 1 FROM parameter p WHERE p.message_id = m.id)`, connIds,
      );
      for (const m of emptyMsgs.rows) {
        issues.push({ level: 'error', entity: 'message', entityId: m.id, message: `Message "${m.name}" has no parameters` });
      }

      // Parameters missing units or range
      const badParams = await db.raw<{ id: string; name: string; units: string; min_value: number | null; max_value: number | null }>(
        `SELECT p.id, p.name, p.units, p.min_value, p.max_value FROM parameter p
         JOIN message m ON m.id = p.message_id
         WHERE m.connection_id IN (${ph})`, connIds,
      );
      for (const p of badParams.rows) {
        if (!p.units || p.units.trim() === '') {
          issues.push({ level: 'error', entity: 'parameter', entityId: p.id, message: `Parameter "${p.name}" missing units` });
        }
        if (p.min_value == null || p.max_value == null) {
          issues.push({ level: 'warning', entity: 'parameter', entityId: p.id, message: `Parameter "${p.name}" missing min/max range` });
        }
      }
    }

    return { systemId, valid: issues.filter(i => i.level === 'error').length === 0, issues };
  },

  /**
   * Compare two baselines and return added/removed/modified signals.
   */
  async diff(baselineId1: string, baselineId2: string, db: DbQuery): Promise<DiffResult> {
    const entries: DiffEntry[] = [];

    const snap1 = await db.raw<{ signal_id: string; logical_snapshot: Record<string, unknown>; transport_snapshot: Record<string, unknown>; physical_snapshot: Record<string, unknown> }>(
      `SELECT signal_id, logical_snapshot, transport_snapshot, physical_snapshot FROM baseline_snapshot WHERE baseline_id = ?`, [baselineId1],
    );
    const snap2 = await db.raw<{ signal_id: string; logical_snapshot: Record<string, unknown>; transport_snapshot: Record<string, unknown>; physical_snapshot: Record<string, unknown> }>(
      `SELECT signal_id, logical_snapshot, transport_snapshot, physical_snapshot FROM baseline_snapshot WHERE baseline_id = ?`, [baselineId2],
    );

    const map1 = new Map(snap1.rows.map(r => [r.signal_id, r]));
    const map2 = new Map(snap2.rows.map(r => [r.signal_id, r]));

    // Removed (in baseline1 but not baseline2)
    for (const [sigId, s] of map1) {
      if (!map2.has(sigId)) {
        const name = (s.logical_snapshot as Record<string, unknown>)?.name as string ?? sigId;
        entries.push({ type: 'signal', id: sigId, name, change: 'removed' });
      }
    }

    // Added (in baseline2 but not baseline1)
    for (const [sigId, s] of map2) {
      if (!map1.has(sigId)) {
        const name = (s.logical_snapshot as Record<string, unknown>)?.name as string ?? sigId;
        entries.push({ type: 'signal', id: sigId, name, change: 'added' });
      }
    }

    // Modified (in both, but snapshots differ)
    for (const [sigId, s1] of map1) {
      const s2 = map2.get(sigId);
      if (!s2) continue;
      const details: Record<string, { before: unknown; after: unknown }> = {};
      if (JSON.stringify(s1.logical_snapshot) !== JSON.stringify(s2.logical_snapshot)) {
        details.logical = { before: s1.logical_snapshot, after: s2.logical_snapshot };
      }
      if (JSON.stringify(s1.transport_snapshot) !== JSON.stringify(s2.transport_snapshot)) {
        details.transport = { before: s1.transport_snapshot, after: s2.transport_snapshot };
      }
      if (JSON.stringify(s1.physical_snapshot) !== JSON.stringify(s2.physical_snapshot)) {
        details.physical = { before: s1.physical_snapshot, after: s2.physical_snapshot };
      }
      if (Object.keys(details).length > 0) {
        const name = (s1.logical_snapshot as Record<string, unknown>)?.name as string ?? sigId;
        entries.push({ type: 'signal', id: sigId, name, change: 'modified', details });
      }
    }

    return { baselineId1, baselineId2, entries };
  },
};

// ---------------------------------------------------------------------------
// Internal trace helpers
// ---------------------------------------------------------------------------

async function traceRequirementsForSignal(signalId: string, chain: TraceChainItem[], db: DbQuery) {
  const reqs = await db.raw<{ id: string; external_requirement_id: string; requirement_text: string }>(
    `SELECT id, external_requirement_id, requirement_text FROM trace_link WHERE signal_id = ?`, [signalId],
  );
  for (const r of reqs.rows) {
    chain.push({ type: 'requirement', id: r.id, name: r.external_requirement_id, metadata: { text: r.requirement_text } });
  }
}

async function traceFromSignal(signalId: string, chain: TraceChainItem[], db: DbQuery) {
  // Find parameters linked to this signal
  const params = await db.raw<{ id: string; name: string; message_id: string }>(
    `SELECT p.id, p.name, p.message_id FROM parameter p
     JOIN signal_parameter_link spl ON spl.parameter_id = p.id
     WHERE spl.signal_id = ?`, [signalId],
  );
  for (const p of params.rows) {
    chain.push({ type: 'parameter', id: p.id, name: p.name });
    // Trace up to message → connection (interface)
    const msgs = await db.raw<{ id: string; name: string; connection_id: string }>(
      `SELECT id, name, connection_id FROM message WHERE id = ?`, [p.message_id],
    );
    if (msgs.rows.length > 0) {
      const m = msgs.rows[0];
      if (!chain.some(c => c.type === 'message' && c.id === m.id)) {
        chain.push({ type: 'message', id: m.id, name: m.name });
      }
      const conns = await db.raw<{ id: string; name: string }>(
        `SELECT id, name FROM connection WHERE id = ?`, [m.connection_id],
      );
      if (conns.rows.length > 0 && !chain.some(c => c.type === 'interface' && c.id === conns.rows[0].id)) {
        chain.push({ type: 'interface', id: conns.rows[0].id, name: conns.rows[0].name });
      }
    }
  }
}

async function traceFromParameter(
  p: { id: string; name: string; message_id: string },
  chain: TraceChainItem[],
  db: DbQuery,
) {
  // Message
  const msgs = await db.raw<{ id: string; name: string; connection_id: string }>(
    `SELECT id, name, connection_id FROM message WHERE id = ?`, [p.message_id],
  );
  if (msgs.rows.length > 0) {
    chain.push({ type: 'message', id: msgs.rows[0].id, name: msgs.rows[0].name });
    const conns = await db.raw<{ id: string; name: string }>(
      `SELECT id, name FROM connection WHERE id = ?`, [msgs.rows[0].connection_id],
    );
    if (conns.rows.length > 0) {
      chain.push({ type: 'interface', id: conns.rows[0].id, name: conns.rows[0].name });
    }
  }
  // Linked signals
  const sigs = await db.raw<{ id: string; name: string }>(
    `SELECT s.id, s.name FROM signal s
     JOIN signal_parameter_link spl ON spl.signal_id = s.id
     WHERE spl.parameter_id = ?`, [p.id],
  );
  for (const s of sigs.rows) {
    chain.push({ type: 'signal', id: s.id, name: s.name });
    await traceRequirementsForSignal(s.id, chain, db);
  }
}

async function traceFromMessage(
  m: { id: string; name: string; connection_id: string },
  chain: TraceChainItem[],
  db: DbQuery,
) {
  // Connection (interface)
  const conns = await db.raw<{ id: string; name: string }>(
    `SELECT id, name FROM connection WHERE id = ?`, [m.connection_id],
  );
  if (conns.rows.length > 0) {
    chain.push({ type: 'interface', id: conns.rows[0].id, name: conns.rows[0].name });
  }
  // Parameters
  const params = await db.raw<{ id: string; name: string }>(
    `SELECT id, name FROM parameter WHERE message_id = ?`, [m.id],
  );
  for (const p of params.rows) {
    chain.push({ type: 'parameter', id: p.id, name: p.name });
  }
  // Signals via parameter links
  const paramIds = params.rows.map(p => p.id);
  if (paramIds.length > 0) {
    const ph = paramIds.map(() => '?').join(',');
    const sigs = await db.raw<{ id: string; name: string }>(
      `SELECT DISTINCT s.id, s.name FROM signal s
       JOIN signal_parameter_link spl ON spl.signal_id = s.id
       WHERE spl.parameter_id IN (${ph})`, paramIds,
    );
    for (const s of sigs.rows) {
      chain.push({ type: 'signal', id: s.id, name: s.name });
      await traceRequirementsForSignal(s.id, chain, db);
    }
  }
}
