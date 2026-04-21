/**
 * Tests for API gateway server — route registration, error handling,
 * RBAC middleware wiring, and WebSocket setup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, type ServiceContainer } from './server.js';
import type { FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Stub services — minimal mocks that satisfy the type contracts
// ---------------------------------------------------------------------------

function stubServices(): ServiceContainer {
  return {
    signalService: {
      createSignal: vi.fn(),
      updateSignal: vi.fn(),
      deleteSignal: vi.fn(),
      getSignal: vi.fn(),
      querySignals: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
      validateCrossLayer: vi.fn(),
      bulkImport: vi.fn(),
    } as any,
    rbacService: {
      checkPermission: vi.fn().mockResolvedValue(true),
    } as any,
    workflowService: {
      submitChange: vi.fn(),
      approveChange: vi.fn(),
      rejectChange: vi.fn(),
      getChangeRequests: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    } as any,
    auditService: {
      getAuditTrail: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    } as any,
    baselineService: {
      createBaseline: vi.fn(),
      getBaseline: vi.fn(),
      listBaselines: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
      diffBaselines: vi.fn(),
      revertToBaseline: vi.fn(),
      exportForCertification: vi.fn(),
    } as any,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('API Gateway Server', () => {
  let app: FastifyInstance;
  let services: ServiceContainer;

  beforeEach(async () => {
    services = stubServices();
    app = await createServer(services);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // --- Route registration ---

  it('registers health check endpoint', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  describe('Signal routes', () => {
    it('registers GET /api/signals', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/signals',
        headers: { 'x-user-id': 'user-1' },
      });
      expect(res.statusCode).toBe(200);
      expect(services.signalService.querySignals).toHaveBeenCalled();
    });

    it('registers GET /api/signals/:id', async () => {
      (services.signalService.getSignal as any).mockResolvedValue({ id: 's1', name: 'test' });
      const res = await app.inject({
        method: 'GET',
        url: '/api/signals/s1',
        headers: { 'x-user-id': 'user-1' },
      });
      expect(res.statusCode).toBe(200);
      expect(services.signalService.getSignal).toHaveBeenCalledWith('s1');
    });

    it('registers POST /api/signals', async () => {
      (services.signalService.createSignal as any).mockResolvedValue({ id: 's1' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/signals',
        headers: { 'x-user-id': 'user-1', 'content-type': 'application/json' },
        payload: { name: 'test' },
      });
      expect(res.statusCode).toBe(201);
    });

    it('registers PUT /api/signals/:id', async () => {
      (services.signalService.updateSignal as any).mockResolvedValue({ id: 's1' });
      const res = await app.inject({
        method: 'PUT',
        url: '/api/signals/s1',
        headers: { 'x-user-id': 'user-1', 'content-type': 'application/json' },
        payload: { name: 'updated' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('registers DELETE /api/signals/:id', async () => {
      (services.signalService.deleteSignal as any).mockResolvedValue({ deleted: true });
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/signals/s1',
        headers: { 'x-user-id': 'user-1' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('registers POST /api/signals/bulk-import', async () => {
      (services.signalService.bulkImport as any).mockResolvedValue({ imported: 0, errors: [] });
      const res = await app.inject({
        method: 'POST',
        url: '/api/signals/bulk-import',
        headers: { 'x-user-id': 'user-1', 'content-type': 'application/json' },
        payload: [],
      });
      expect(res.statusCode).toBe(201);
    });

    it('registers POST /api/signals/:id/validate', async () => {
      (services.signalService.validateCrossLayer as any).mockResolvedValue({ valid: true, errors: [] });
      const res = await app.inject({
        method: 'POST',
        url: '/api/signals/s1/validate',
        headers: { 'x-user-id': 'user-1' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Baseline routes', () => {
    it('registers GET /api/baselines', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/baselines',
        headers: { 'x-user-id': 'user-1' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('registers POST /api/baselines', async () => {
      (services.baselineService.createBaseline as any).mockResolvedValue({ id: 'b1' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/baselines',
        headers: { 'x-user-id': 'user-1', 'content-type': 'application/json' },
        payload: { projectId: 'p1', versionLabel: 'v1' },
      });
      expect(res.statusCode).toBe(201);
    });

    it('registers POST /api/baselines/:id/diff', async () => {
      (services.baselineService.diffBaselines as any).mockResolvedValue({ added: [], modified: [], deleted: [] });
      const res = await app.inject({
        method: 'POST',
        url: '/api/baselines/b1/diff',
        headers: { 'x-user-id': 'user-1', 'content-type': 'application/json' },
        payload: { compareWith: 'b2' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('registers POST /api/baselines/:id/revert', async () => {
      (services.baselineService.revertToBaseline as any).mockResolvedValue({ success: true });
      const res = await app.inject({
        method: 'POST',
        url: '/api/baselines/b1/revert',
        headers: { 'x-user-id': 'user-1', 'content-type': 'application/json' },
        payload: { reason: 'rollback' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('registers POST /api/baselines/:id/export', async () => {
      (services.baselineService.exportForCertification as any).mockResolvedValue({ data: {} });
      const res = await app.inject({
        method: 'POST',
        url: '/api/baselines/b1/export',
        headers: { 'x-user-id': 'user-1', 'content-type': 'application/json' },
        payload: { standard: 'DO-178C' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Workflow routes', () => {
    it('registers GET /api/change-requests', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/change-requests',
        headers: { 'x-user-id': 'user-1' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('registers POST /api/change-requests', async () => {
      (services.workflowService.submitChange as any).mockResolvedValue({ id: 'cr1' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/change-requests',
        headers: { 'x-user-id': 'user-1', 'content-type': 'application/json' },
        payload: { change: {}, submitterId: 'user-1' },
      });
      expect(res.statusCode).toBe(201);
    });

    it('registers POST /api/change-requests/:id/approve', async () => {
      (services.workflowService.approveChange as any).mockResolvedValue({ id: 'cr1', status: 'approved' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/change-requests/cr1/approve',
        headers: { 'x-user-id': 'user-1', 'content-type': 'application/json' },
        payload: { approverId: 'user-2' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('registers POST /api/change-requests/:id/reject', async () => {
      (services.workflowService.rejectChange as any).mockResolvedValue({ id: 'cr1', status: 'rejected' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/change-requests/cr1/reject',
        headers: { 'x-user-id': 'user-1', 'content-type': 'application/json' },
        payload: { approverId: 'user-2', reason: 'not ready' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Audit routes', () => {
    it('registers GET /api/audit', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/audit',
        headers: { 'x-user-id': 'user-1' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // --- RBAC middleware ---

  describe('RBAC middleware', () => {
    it('returns 401 when x-user-id header is missing', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/signals' });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('UNAUTHORIZED');
    });

    it('returns 403 when user lacks permission', async () => {
      (services.rbacService.checkPermission as any).mockResolvedValue(false);
      const res = await app.inject({
        method: 'GET',
        url: '/api/signals',
        headers: { 'x-user-id': 'user-1' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('PERMISSION_DENIED');
    });
  });

  // --- Error handler ---

  describe('Error handler', () => {
    it('returns structured ErrorResponse with correlation ID on service error', async () => {
      const err = new Error('Something broke');
      err.name = 'PermissionDeniedError';
      (services.signalService.getSignal as any).mockRejectedValue(err);

      const res = await app.inject({
        method: 'GET',
        url: '/api/signals/s1',
        headers: { 'x-user-id': 'user-1' },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.code).toBe('PERMISSION_DENIED');
      expect(body.correlationId).toBeDefined();
      expect(body.severity).toBe('error');
    });

    it('returns 500 for unknown errors', async () => {
      (services.signalService.getSignal as any).mockRejectedValue(new Error('unexpected'));

      const res = await app.inject({
        method: 'GET',
        url: '/api/signals/s1',
        headers: { 'x-user-id': 'user-1' },
      });
      expect(res.statusCode).toBe(500);
      expect(res.json().code).toBe('INTERNAL_ERROR');
    });
  });

  // --- Correlation ID ---

  describe('Correlation ID', () => {
    it('echoes x-correlation-id header from request', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-correlation-id': 'my-trace-123' },
      });
      expect(res.headers['x-correlation-id']).toBe('my-trace-123');
    });

    it('generates correlation ID when not provided', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.headers['x-correlation-id']).toBeDefined();
    });
  });
});
