/**
 * Signal REST routes — thin wrappers delegating to SignalService.
 */

import type { FastifyInstance } from 'fastify';
import type { SignalId, ProjectId, Pagination, SignalStatus } from '@connectedicd/shared-types';
import type { SignalService, SignalFilter } from '@connectedicd/core-services';
import type { RbacService } from '@connectedicd/core-services';
import { createRbacHook } from '../middleware/rbac-middleware.js';

export interface SignalRouteDeps {
  signalService: SignalService;
  rbacService: RbacService;
}

export async function registerSignalRoutes(
  app: FastifyInstance,
  deps: SignalRouteDeps,
): Promise<void> {
  const { signalService, rbacService } = deps;
  const readHook = createRbacHook(rbacService, { resource: 'signal', action: 'read' });
  const writeHook = createRbacHook(rbacService, { resource: 'signal', action: 'write' });
  const deleteHook = createRbacHook(rbacService, { resource: 'signal', action: 'delete' });

  app.get('/api/signals', { preHandler: readHook }, async (request) => {
    const query = request.query as Record<string, string>;
    const filter: SignalFilter = {};
    if (query.projectId) filter.projectId = query.projectId as unknown as ProjectId;
    if (query.name) filter.nameSearch = query.name;
    if (query.status) filter.status = query.status as SignalStatus;

    const pagination: Pagination = {
      page: parseInt(query.page ?? '1', 10),
      pageSize: parseInt(query.pageSize ?? '20', 10),
      sortBy: query.sortBy,
      sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
    };

    return signalService.querySignals(filter, pagination);
  });

  app.get<{ Params: { id: string } }>(
    '/api/signals/:id',
    { preHandler: readHook },
    async (request) => {
      return signalService.getSignal(request.params.id as SignalId);
    },
  );

  app.post('/api/signals', { preHandler: writeHook }, async (request, reply) => {
    const result = await signalService.createSignal(request.body as any);
    void reply.status(201);
    return result;
  });

  app.put<{ Params: { id: string } }>(
    '/api/signals/:id',
    { preHandler: writeHook },
    async (request) => {
      return signalService.updateSignal(request.params.id as SignalId, request.body as any);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/signals/:id',
    { preHandler: deleteHook },
    async (request) => {
      return signalService.deleteSignal(request.params.id as SignalId);
    },
  );

  app.post('/api/signals/bulk-import', { preHandler: writeHook }, async (request, reply) => {
    const body = request.body as { records: Record<string, unknown>[]; fieldMapping: any };
    const result = await signalService.bulkImport(body.records, body.fieldMapping);
    void reply.status(201);
    return result;
  });

  app.post<{ Params: { id: string } }>(
    '/api/signals/:id/validate',
    { preHandler: readHook },
    async (request) => {
      return signalService.validateCrossLayer(request.params.id as SignalId);
    },
  );
}
