/**
 * Unit tests for digital-thread.ts
 *
 * Uses an in-memory fake DbQuery to validate traceability, impact analysis,
 * ICD validation, and baseline diffing without a live database.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  digitalThread,
  icd,
  type DbQuery,
  type TraceResult,
  type ImpactResult,
  type ValidateResult,
  type DiffResult,
} from './digital-thread.js';

// ---------------------------------------------------------------------------
// In-memory fake DB
// ---------------------------------------------------------------------------

interface FakeTable {
  [table: string]: Record<string, unknown>[];
}

function createFakeDb(tables: FakeTable): DbQuery {
  return {
    async raw<T>(sql: string, bindings: unknown[] = []): Promise<{ rows: T[] }> {
      const s = sql.replace(/\s+/g, ' ').trim();
      const rows = matchQuery(s, bindings, tables);
      return { rows: rows as T[] };
    },
  };
}

function matchQuery(sql: string, bindings: unknown[], tables: FakeTable): Record<string, unknown>[] {
  // Signal by id
  if (sql.includes('FROM signal WHERE id =') && !sql.includes('JOIN')) {
    return (tables.signal ?? []).filter(r => r.id === bindings[0]);
  }
  // Parameter by id
  if (sql.includes('FROM parameter WHERE id =')) {
    return (tables.parameter ?? []).filter(r => r.id === bindings[0]);
  }
  // Message by id (single)
  if (sql.includes('FROM message WHERE id =')) {
    return (tables.message ?? []).filter(r => r.id === bindings[0]);
  }
  // Trace link by id
  if (sql.includes('FROM trace_link WHERE id =')) {
    return (tables.trace_link ?? []).filter(r => r.id === bindings[0]);
  }
  // Trace links for signal
  if (sql.includes('FROM trace_link WHERE signal_id =')) {
    return (tables.trace_link ?? []).filter(r => r.signal_id === bindings[0]);
  }
  // Parameters linked to signal via signal_parameter_link
  if (sql.includes('JOIN signal_parameter_link spl ON spl.parameter_id = p.id') && sql.includes('spl.signal_id =')) {
    const links = (tables.signal_parameter_link ?? []).filter(r => r.signal_id === bindings[0]);
    const paramIds = links.map(l => l.parameter_id);
    return (tables.parameter ?? []).filter(r => paramIds.includes(r.id));
  }
  // Signals linked to parameter via signal_parameter_link
  if (sql.includes('JOIN signal_parameter_link spl ON spl.signal_id = s.id') && sql.includes('spl.parameter_id =')) {
    const links = (tables.signal_parameter_link ?? []).filter(r => r.parameter_id === bindings[0]);
    const sigIds = links.map(l => l.signal_id);
    return (tables.signal ?? []).filter(r => sigIds.includes(r.id));
  }
  // Signals linked to parameters IN (...)
  if (sql.includes('JOIN signal_parameter_link spl ON spl.signal_id = s.id') && sql.includes('IN (')) {
    const links = (tables.signal_parameter_link ?? []).filter(r => bindings.includes(r.parameter_id));
    const sigIds = [...new Set(links.map(l => l.signal_id))];
    return (tables.signal ?? []).filter(r => sigIds.includes(r.id));
  }
  // Connection by id
  if (sql.includes('FROM connection WHERE id =')) {
    return (tables.connection ?? []).filter(r => r.id === bindings[0]);
  }
  // Messages by connection_id
  if (sql.includes('FROM message WHERE connection_id =')) {
    return (tables.message ?? []).filter(r => r.connection_id === bindings[0]);
  }
  // Parameters by message_id
  if (sql.includes('FROM parameter WHERE message_id =')) {
    return (tables.parameter ?? []).filter(r => r.message_id === bindings[0]);
  }
  // Trace links for signals IN (...)
  if (sql.includes('FROM trace_link WHERE signal_id IN')) {
    return (tables.trace_link ?? []).filter(r => bindings.includes(r.signal_id));
  }
  // Orphan ports (ports without connections)
  if (sql.includes('FROM system_port sp') && sql.includes('NOT EXISTS')) {
    const ports = (tables.system_port ?? []).filter(r => r.system_id === bindings[0]);
    return ports.filter(p => {
      const conns = tables.connection ?? [];
      return !conns.some(c => c.source_port_id === p.id || c.dest_port_id === p.id);
    });
  }
  // Connections for system (via ports)
  if (sql.includes('FROM connection c') && sql.includes('JOIN system_port sp') && sql.includes('sp.system_id =')) {
    const ports = (tables.system_port ?? []).filter(r => r.system_id === bindings[0]);
    const portIds = ports.map(p => p.id);
    const conns = (tables.connection ?? []).filter(c =>
      portIds.includes(c.source_port_id) || portIds.includes(c.dest_port_id),
    );
    // Deduplicate
    return [...new Map(conns.map(c => [c.id, c])).values()];
  }
  // COUNT messages for connection
  if (sql.includes('COUNT(*)') && sql.includes('FROM message WHERE connection_id =')) {
    const cnt = (tables.message ?? []).filter(r => r.connection_id === bindings[0]).length;
    return [{ cnt: String(cnt) }];
  }
  // Messages with no parameters (IN connections)
  if (sql.includes('FROM message m') && sql.includes('NOT EXISTS') && sql.includes('IN (')) {
    const msgs = (tables.message ?? []).filter(r => bindings.includes(r.connection_id));
    return msgs.filter(m => !(tables.parameter ?? []).some(p => p.message_id === m.id));
  }
  // Parameters for messages in connections
  if (sql.includes('FROM parameter p') && sql.includes('JOIN message m') && sql.includes('IN (')) {
    const msgs = (tables.message ?? []).filter(r => bindings.includes(r.connection_id));
    const msgIds = msgs.map(m => m.id);
    return (tables.parameter ?? []).filter(p => msgIds.includes(p.message_id));
  }
  // Baseline snapshots
  if (sql.includes('FROM baseline_snapshot WHERE baseline_id =')) {
    return (tables.baseline_snapshot ?? []).filter(r => r.baseline_id === bindings[0]);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Test data factory
// ---------------------------------------------------------------------------

function buildTestData() {
  return {
    signal: [
      { id: 'sig-1', name: 'IAS_SPEED', project_id: 'proj-1' },
      { id: 'sig-2', name: 'BARO_ALT', project_id: 'proj-1' },
    ],
    trace_link: [
      { id: 'tl-1', signal_id: 'sig-1', external_requirement_id: 'REQ-001', requirement_text: 'Airspeed display', requirement_tool: 'doors', link_status: 'active' },
    ],
    signal_parameter_link: [
      { signal_id: 'sig-1', parameter_id: 'param-1' },
      { signal_id: 'sig-2', parameter_id: 'param-2' },
    ],
    parameter: [
      { id: 'param-1', name: 'AIRSPEED_IAS', message_id: 'msg-1', units: 'knots', min_value: 0, max_value: 500 },
      { id: 'param-2', name: 'ALTITUDE_BARO', message_id: 'msg-1', units: '', min_value: null, max_value: null },
      { id: 'param-3', name: 'NO_UNITS', message_id: 'msg-2', units: '', min_value: 0, max_value: 100 },
    ],
    message: [
      { id: 'msg-1', name: 'Airspeed Label', connection_id: 'conn-1' },
      { id: 'msg-2', name: 'Altitude Label', connection_id: 'conn-1' },
    ],
    connection: [
      { id: 'conn-1', name: 'FCC→ADC Link', source_port_id: 'port-1', dest_port_id: 'port-2', project_id: 'proj-1' },
    ],
    system_port: [
      { id: 'port-1', name: 'A429_TX_1', system_id: 'sys-1' },
      { id: 'port-2', name: 'A429_RX_1', system_id: 'sys-2' },
      { id: 'port-3', name: 'DISC_OUT_1', system_id: 'sys-1' }, // orphan port
    ],
    baseline_snapshot: [] as Record<string, unknown>[],
  };
}

// ---------------------------------------------------------------------------
// Tests: digitalThread.trace
// ---------------------------------------------------------------------------

describe('digitalThread.trace', () => {
  it('traces from a signal through parameters, messages, interfaces, and requirements', async () => {
    const data = buildTestData();
    const db = createFakeDb(data);
    const result = await digitalThread.trace('sig-1', db);

    expect(result.rootId).toBe('sig-1');
    const types = result.chain.map(c => c.type);
    expect(types).toContain('signal');
    expect(types).toContain('parameter');
    expect(types).toContain('message');
    expect(types).toContain('interface');
    expect(types).toContain('requirement');
  });

  it('traces from a parameter up to message, interface, and linked signals', async () => {
    const data = buildTestData();
    const db = createFakeDb(data);
    const result = await digitalThread.trace('param-1', db);

    expect(result.rootId).toBe('param-1');
    const types = result.chain.map(c => c.type);
    expect(types).toContain('parameter');
    expect(types).toContain('message');
    expect(types).toContain('interface');
    expect(types).toContain('signal');
  });

  it('traces from a requirement to its linked signal', async () => {
    const data = buildTestData();
    const db = createFakeDb(data);
    const result = await digitalThread.trace('tl-1', db);

    expect(result.rootId).toBe('tl-1');
    const types = result.chain.map(c => c.type);
    expect(types).toContain('requirement');
    expect(types).toContain('signal');
  });

  it('traces from a message to interface and parameters', async () => {
    const data = buildTestData();
    const db = createFakeDb(data);
    const result = await digitalThread.trace('msg-1', db);

    expect(result.rootId).toBe('msg-1');
    const types = result.chain.map(c => c.type);
    expect(types).toContain('message');
    expect(types).toContain('interface');
    expect(types).toContain('parameter');
  });

  it('returns empty chain for unknown item', async () => {
    const db = createFakeDb({});
    const result = await digitalThread.trace('unknown-id', db);
    expect(result.chain).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: digitalThread.impact
// ---------------------------------------------------------------------------

describe('digitalThread.impact', () => {
  it('finds all affected items for a connection change', async () => {
    const data = buildTestData();
    const db = createFakeDb(data);
    const result = await digitalThread.impact('conn-1', db);

    expect(result.interfaceId).toBe('conn-1');
    const types = result.affected.map(a => a.type);
    expect(types).toContain('message');
    expect(types).toContain('parameter');
    expect(types).toContain('signal');
    expect(types).toContain('requirement');
  });

  it('returns empty affected list for connection with no messages', async () => {
    const db = createFakeDb({ message: [], parameter: [], signal_parameter_link: [] });
    const result = await digitalThread.impact('conn-empty', db);
    expect(result.affected).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: icd.validate
// ---------------------------------------------------------------------------

describe('icd.validate', () => {
  it('reports orphan ports as warnings', async () => {
    const data = buildTestData();
    const db = createFakeDb(data);
    const result = await icd.validate('sys-1', db);

    const orphanIssues = result.issues.filter(i => i.entity === 'port');
    expect(orphanIssues.length).toBeGreaterThan(0);
    expect(orphanIssues[0].message).toContain('DISC_OUT_1');
  });

  it('reports parameters missing units as errors', async () => {
    const data = buildTestData();
    const db = createFakeDb(data);
    const result = await icd.validate('sys-1', db);

    const unitIssues = result.issues.filter(i => i.message.includes('missing units'));
    expect(unitIssues.length).toBeGreaterThan(0);
  });

  it('reports parameters missing range as warnings', async () => {
    const data = buildTestData();
    const db = createFakeDb(data);
    const result = await icd.validate('sys-1', db);

    const rangeIssues = result.issues.filter(i => i.message.includes('missing min/max'));
    expect(rangeIssues.length).toBeGreaterThan(0);
  });

  it('returns valid=true when no errors (only warnings)', async () => {
    const data = {
      system_port: [{ id: 'port-a', name: 'TX1', system_id: 'sys-ok' }],
      connection: [{ id: 'conn-a', name: 'Link', source_port_id: 'port-a', dest_port_id: 'port-b' }],
      message: [{ id: 'msg-a', name: 'Msg', connection_id: 'conn-a' }],
      parameter: [{ id: 'p-a', name: 'P1', message_id: 'msg-a', units: 'V', min_value: 0, max_value: 28 }],
    };
    const db = createFakeDb(data);
    const result = await icd.validate('sys-ok', db);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests: icd.diff
// ---------------------------------------------------------------------------

describe('icd.diff', () => {
  it('detects added signals between baselines', async () => {
    const data = {
      baseline_snapshot: [
        { baseline_id: 'bl-1', signal_id: 'sig-1', logical_snapshot: { name: 'IAS' }, transport_snapshot: {}, physical_snapshot: {} },
        { baseline_id: 'bl-2', signal_id: 'sig-1', logical_snapshot: { name: 'IAS' }, transport_snapshot: {}, physical_snapshot: {} },
        { baseline_id: 'bl-2', signal_id: 'sig-2', logical_snapshot: { name: 'ALT' }, transport_snapshot: {}, physical_snapshot: {} },
      ],
    };
    const db = createFakeDb(data);
    const result = await icd.diff('bl-1', 'bl-2', db);

    const added = result.entries.filter(e => e.change === 'added');
    expect(added).toHaveLength(1);
    expect(added[0].id).toBe('sig-2');
  });

  it('detects removed signals between baselines', async () => {
    const data = {
      baseline_snapshot: [
        { baseline_id: 'bl-1', signal_id: 'sig-1', logical_snapshot: { name: 'IAS' }, transport_snapshot: {}, physical_snapshot: {} },
        { baseline_id: 'bl-1', signal_id: 'sig-2', logical_snapshot: { name: 'ALT' }, transport_snapshot: {}, physical_snapshot: {} },
        { baseline_id: 'bl-2', signal_id: 'sig-1', logical_snapshot: { name: 'IAS' }, transport_snapshot: {}, physical_snapshot: {} },
      ],
    };
    const db = createFakeDb(data);
    const result = await icd.diff('bl-1', 'bl-2', db);

    const removed = result.entries.filter(e => e.change === 'removed');
    expect(removed).toHaveLength(1);
    expect(removed[0].id).toBe('sig-2');
  });

  it('detects modified signals between baselines', async () => {
    const data = {
      baseline_snapshot: [
        { baseline_id: 'bl-1', signal_id: 'sig-1', logical_snapshot: { name: 'IAS', units: 'knots' }, transport_snapshot: {}, physical_snapshot: {} },
        { baseline_id: 'bl-2', signal_id: 'sig-1', logical_snapshot: { name: 'IAS', units: 'mph' }, transport_snapshot: {}, physical_snapshot: {} },
      ],
    };
    const db = createFakeDb(data);
    const result = await icd.diff('bl-1', 'bl-2', db);

    const modified = result.entries.filter(e => e.change === 'modified');
    expect(modified).toHaveLength(1);
    expect(modified[0].details).toHaveProperty('logical');
  });

  it('returns empty entries for identical baselines', async () => {
    const snap = { name: 'IAS', units: 'knots' };
    const data = {
      baseline_snapshot: [
        { baseline_id: 'bl-1', signal_id: 'sig-1', logical_snapshot: snap, transport_snapshot: {}, physical_snapshot: {} },
        { baseline_id: 'bl-2', signal_id: 'sig-1', logical_snapshot: snap, transport_snapshot: {}, physical_snapshot: {} },
      ],
    };
    const db = createFakeDb(data);
    const result = await icd.diff('bl-1', 'bl-2', db);
    expect(result.entries).toHaveLength(0);
  });
});
