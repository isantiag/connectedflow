/**
 * Workflow REST routes — thin wrappers delegating to WorkflowService.
 */

import type { FastifyInstance } from 'fastify';
import type { ChangeRequestId, UserId, Pagination } from '@connectedicd/shared-types';
import type { WorkflowService, ChangeRequestFilter, RbacService } from '@connectedicd/core-services';
import { createRbacHook } from '../middleware/rbac-middleware.js';

export interface WorkflowRouteDeps {
  workflowService: WorkflowService;
  rbacService: RbacService;
}

export async function registerWorkflowRoutes(
  app: FastifyInstance,
  deps: WorkflowRouteDeps,
): Promise<void> {
  const { workflowService, rbacService } = deps;
  const readHook = createRbacHook(rbacService, { resource: 'change_request', action: 'read' });
  const writeHook = createRbacHook(rbacService, { resource: 'change_request', action: 'write' });
  const approveHook = createRbacHook(rbacService, { resource: 'change_request', action: 'approve' });

  app.get('/api/change-requests', { preHandler: readHook }, async (request) => {
    const query = request.query as Record<string, string>;
    const filter: ChangeRequestFilter = {};
    if (query.status) filter.status = query.status as any;
    if (query.signalId) filter.signalId = query.signalId as any;
    if (query.submittedBy) filter.submittedBy = query.submittedBy as any;

    const pagination: Pagination = {
      page: parseInt(query.page ?? '1', 10),
      pageSize: parseInt(query.pageSize ?? '20', 10),
      sortBy: query.sortBy,
      sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
    };

    return workflowService.getChangeRequests(filter, pagination);
  });

  app.post('/api/change-requests', { preHandler: writeHook }, async (request, reply) => {
    const body = request.body as { change: any; submitterId: string };
    const result = await workflowService.submitChange(
      body.change,
      body.submitterId as UserId,
    );
    void reply.status(201);
    return result;
  });

  app.post<{ Params: { id: string } }>(
    '/api/change-requests/:id/approve',
    { preHandler: approveHook },
    async (request) => {
      const body = request.body as { approverId: string };
      return workflowService.approveChange(
        request.params.id as ChangeRequestId,
        body.approverId as UserId,
      );
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/change-requests/:id/reject',
    { preHandler: approveHook },
    async (request) => {
      const body = request.body as { approverId: string; reason: string };
      return workflowService.rejectChange(
        request.params.id as ChangeRequestId,
        body.approverId as UserId,
        body.reason,
      );
    },
  );
}
