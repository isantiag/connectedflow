/**
 * RBAC middleware — Fastify hook that checks permissions via RbacService.
 *
 * Expects a userId header (x-user-id) for authentication. In production
 * this would be replaced by JWT/session validation.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserId } from '@connectedflow/shared-types';
import type { RbacService, Resource, Action } from '@connectedflow/core-services';

export interface RbacOptions {
  resource: Resource;
  action: Action;
}

/**
 * Creates a Fastify preHandler hook that enforces RBAC permissions.
 */
export function createRbacHook(rbacService: RbacService, opts: RbacOptions) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userId = request.headers['x-user-id'] as string | undefined;
    if (!userId) {
      void reply.status(401).send({
        code: 'UNAUTHORIZED',
        message: 'Missing x-user-id header',
        severity: 'error',
        correlationId: request.id,
      });
      return;
    }

    const allowed = await rbacService.checkPermission(
      userId as UserId,
      opts.resource,
      opts.action,
    );

    if (!allowed) {
      void reply.status(403).send({
        code: 'PERMISSION_DENIED',
        message: `User ${userId} lacks permission ${opts.action} on ${opts.resource}`,
        severity: 'error',
        correlationId: request.id,
      });
      return;
    }
  };
}
