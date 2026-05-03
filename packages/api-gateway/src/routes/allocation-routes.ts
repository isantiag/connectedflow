/**
 * Allocation REST routes — thin wrappers delegating to service.
 * §1 Backend: Business logic in services, NOT here.
 */

import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import type { AuditWriter } from '@connectedicd/core-services';
import {
  CreateAllocationSchema,
  AllocationQuerySchema,
  createAllocationService,
} from '../services/phase2-services.js';

export async function registerAllocationRoutes(
  app: FastifyInstance,
  db: Knex,
  audit?: AuditWriter,
): Promise<void> {
  const service = createAllocationService(db);

  // POST /api/allocations
  app.post('/api/allocations', async (request, reply) => {
    const parsed = CreateAllocationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues },
      });
    }
    const result = await service.create(parsed.data);
    if (audit) {
      await audit.record({ entityType: 'allocation', entityId: (result as any).id, action: 'create', afterState: result as Record<string, unknown>, timestamp: new Date() });
    }
    return reply.status(201).send(result);
  });

  // GET /api/allocations?projectId=X
  app.get('/api/allocations', async (request, reply) => {
    const parsed = AllocationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues },
      });
    }
    return service.list(parsed.data);
  });

  // DELETE /api/allocations/:id
  app.delete<{ Params: { id: string } }>('/api/allocations/:id', async (request, reply) => {
    if (audit) {
      await audit.record({ entityType: 'allocation', entityId: request.params.id, action: 'delete', timestamp: new Date() });
    }
    const result = await service.remove(request.params.id);
    return result;
  });
}
