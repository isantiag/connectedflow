/**
 * Baseline REST routes — thin wrappers delegating to BaselineService.
 */

import type { FastifyInstance } from 'fastify';
import type { BaselineId, Pagination } from '@connectedflow/shared-types';
import type { BaselineService, BaselineFilter, RbacService } from '@connectedflow/core-services';
import { createRbacHook } from '../middleware/rbac-middleware.js';

export interface BaselineRouteDeps {
  baselineService: BaselineService;
  rbacService: RbacService;
}

export async function registerBaselineRoutes(
  app: FastifyInstance,
  deps: BaselineRouteDeps,
): Promise<void> {
  const { baselineService, rbacService } = deps;
  const readHook = createRbacHook(rbacService, { resource: 'baseline', action: 'read' });
  const writeHook = createRbacHook(rbacService, { resource: 'baseline', action: 'write' });

  app.get('/api/baselines', { preHandler: readHook }, async (request) => {
    const query = request.query as Record<string, string>;
    const filter: BaselineFilter = {};
    if (query.projectId) filter.projectId = query.projectId as any;
    if (query.status) filter.status = query.status as any;

    const pagination: Pagination = {
      page: parseInt(query.page ?? '1', 10),
      pageSize: parseInt(query.pageSize ?? '20', 10),
      sortBy: query.sortBy,
      sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
    };

    return baselineService.listBaselines(filter, pagination);
  });

  app.get<{ Params: { id: string } }>(
    '/api/baselines/:id',
    { preHandler: readHook },
    async (request) => {
      return baselineService.getBaseline(request.params.id as BaselineId);
    },
  );

  app.post('/api/baselines', { preHandler: writeHook }, async (request, reply) => {
    const result = await baselineService.createBaseline(request.body as any);
    void reply.status(201);
    return result;
  });

  app.post<{ Params: { id: string } }>(
    '/api/baselines/:id/diff',
    { preHandler: readHook },
    async (request) => {
      const body = request.body as { compareWith: string };
      return baselineService.diffBaselines(
        request.params.id as BaselineId,
        body.compareWith as BaselineId,
      );
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/baselines/:id/revert',
    { preHandler: writeHook },
    async (request) => {
      const body = request.body as { reason: string };
      return baselineService.revertToBaseline(
        request.params.id as BaselineId,
        body.reason,
      );
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/baselines/:id/export',
    { preHandler: readHook },
    async (request) => {
      const body = request.body as { standard: any };
      return baselineService.exportForCertification(
        request.params.id as BaselineId,
        body.standard,
      );
    },
  );
}
