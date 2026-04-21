/**
 * Audit REST routes — thin wrapper delegating to AuditService.
 */

import type { FastifyInstance } from 'fastify';
import type { Pagination } from '@connectedflow/shared-types';
import type { AuditService, AuditFilter, RbacService } from '@connectedflow/core-services';
import { createRbacHook } from '../middleware/rbac-middleware.js';

export interface AuditRouteDeps {
  auditService: AuditService;
  rbacService: RbacService;
}

export async function registerAuditRoutes(
  app: FastifyInstance,
  deps: AuditRouteDeps,
): Promise<void> {
  const { auditService, rbacService } = deps;
  const readHook = createRbacHook(rbacService, { resource: 'signal', action: 'read' });

  app.get('/api/audit', { preHandler: readHook }, async (request) => {
    const query = request.query as Record<string, string>;
    const filter: AuditFilter = {};
    if (query.entityType) filter.entityType = query.entityType;
    if (query.entityId) filter.entityId = query.entityId;
    if (query.userId) filter.userId = query.userId;
    if (query.action) filter.action = query.action;
    if (query.fromTime) filter.fromTime = new Date(query.fromTime);
    if (query.toTime) filter.toTime = new Date(query.toTime);

    const pagination: Pagination = {
      page: parseInt(query.page ?? '1', 10),
      pageSize: parseInt(query.pageSize ?? '20', 10),
      sortBy: query.sortBy,
      sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
    };

    return auditService.getAuditTrail(filter, pagination);
  });
}
