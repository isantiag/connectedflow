/**
 * ConnectedICD API Route Reachability Tests
 * Ensures all registered routes respond (not 404).
 * Run: cd /home/learner/connectedflow && npx vitest run packages/api-gateway/src/routes-reachability.test.ts
 * Requires: node api-server.js running on localhost:4001, PostgreSQL running
 */
import { describe, it, expect, beforeAll } from 'vitest';

const API = 'http://localhost:4001';
let TOKEN = '';

async function api(method: string, path: string, body?: any) {
  const res = await fetch(`${API}${path}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

beforeAll(async () => {
  const r = await api('POST', '/api/auth/login', { email: 'admin@enteraero.com', password: 'Admin1!' });
  TOKEN = r.data?.token || r.data?.accessToken || '';
});

describe('Route Reachability — Auth', () => {
  it('POST /api/auth/login is reachable', async () => {
    const r = await api('POST', '/api/auth/login', { email: 'admin@enteraero.com', password: 'Admin1!' });
    expect(r.status).not.toBe(404);
  });
  it('GET /api/auth/me is reachable', async () => {
    const r = await api('GET', '/api/auth/me');
    expect(r.status).not.toBe(404);
  });
});

describe('Route Reachability — Core Resources', () => {
  it('GET /health', async () => { expect((await api('GET', '/health')).status).not.toBe(404); });
  it('GET /ready', async () => { expect((await api('GET', '/ready')).status).not.toBe(404); });
  it('GET /api/projects', async () => { expect((await api('GET', '/api/projects')).status).not.toBe(404); });
  it('GET /api/signals', async () => { expect((await api('GET', '/api/signals')).status).not.toBe(404); });
  it('GET /api/systems', async () => { expect((await api('GET', '/api/systems')).status).not.toBe(404); });
  it('GET /api/baselines', async () => { expect((await api('GET', '/api/baselines')).status).not.toBe(404); });
  it('GET /api/workflows', async () => { expect((await api('GET', '/api/workflows')).status).not.toBe(404); });
  it('GET /api/workflows/pending', async () => { expect((await api('GET', '/api/workflows/pending')).status).not.toBe(404); });
  it('GET /api/dashboard', async () => { expect((await api('GET', '/api/dashboard')).status).not.toBe(404); });
  it('GET /api/n2-matrix', async () => { expect((await api('GET', '/api/n2-matrix')).status).not.toBe(404); });
  it('GET /api/audit', async () => { expect((await api('GET', '/api/audit')).status).not.toBe(404); });
  it('GET /api/notifications', async () => { expect((await api('GET', '/api/notifications')).status).not.toBe(404); });
  it('GET /api/organizations', async () => { expect((await api('GET', '/api/organizations')).status).not.toBe(404); });
  it('GET /api/protocols', async () => { expect((await api('GET', '/api/protocols')).status).not.toBe(404); });
  it('GET /api/users', async () => { expect((await api('GET', '/api/users')).status).not.toBe(404); });
  it('GET /api/roles', async () => { expect((await api('GET', '/api/roles')).status).not.toBe(404); });
});

describe('Route Reachability — Integration & MBSE', () => {
  it('GET /api/integration/changes-since', async () => { expect((await api('GET', '/api/integration/changes-since')).status).not.toBe(404); });
  it('GET /api/integration/webhooks', async () => { expect((await api('GET', '/api/integration/webhooks')).status).not.toBe(404); });
  it('GET /api/handshakes/pending', async () => { expect((await api('GET', '/api/handshakes/pending')).status).not.toBe(404); });
  it('GET /api/ai/providers', async () => { expect((await api('GET', '/api/ai/providers')).status).not.toBe(404); });
});

describe('Route Reachability — Artifacts (§9.2 MCP)', () => {
  it('POST /api/artifacts/list is reachable', async () => {
    const r = await api('POST', '/api/artifacts/list', {});
    expect(r.status).not.toBe(404);
  });
  it('POST /api/artifacts/get is reachable', async () => {
    const r = await api('POST', '/api/artifacts/get', { id: 'test' });
    expect(r.status).not.toBe(404);
  });
  it('POST /api/artifacts/export is reachable', async () => {
    const r = await api('POST', '/api/artifacts/export', { id: 'test' });
    expect(r.status).not.toBe(404);
  });
});
