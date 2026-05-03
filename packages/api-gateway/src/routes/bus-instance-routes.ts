/**
 * Bus Instance REST routes — thin wrappers delegating to BusInstanceService.
 * §1 Backend: Business logic in services, NOT here.
 */

import type { FastifyInstance } from 'fastify';
import { CreateBusInstanceSchema, createBusInstanceService } from '../services/architecture-services.js';
import type { Knex } from 'knex';
import type { AuditWriter } from '@connectedicd/core-services';

export async function registerBusInstanceRoutes(
  app: FastifyInstance,
  db: Knex,
  audit?: AuditWriter,
): Promise<void> {
  const service = createBusInstanceService(db);

  // POST /api/bus-instances
  app.post('/api/bus-instances', async (request, reply) => {
    const parsed = CreateBusInstanceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues },
      });
    }
    const result = await service.create(parsed.data);
    if (audit) {
      await audit.record({ entityType: 'bus_instance', entityId: (result as any).id, action: 'create', afterState: result as Record<string, unknown>, timestamp: new Date() });
    }
    void reply.status(201);
    return result;
  });

  // GET /api/bus-instances?projectId=X
  app.get('/api/bus-instances', async (request) => {
    const query = request.query as Record<string, string>;
    if (!query.projectId) {
      return [];
    }
    return service.list(query.projectId);
  });

  // GET /api/bus-instances/:id
  app.get<{ Params: { id: string } }>(
    '/api/bus-instances/:id',
    async (request, reply) => {
      const result = await service.getById(request.params.id);
      if (!result) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Bus instance not found' },
        });
      }
      return result;
    },
  );

  // GET /api/bus-instances/:id/loading
  app.get<{ Params: { id: string } }>(
    '/api/bus-instances/:id/loading',
    async (request, reply) => {
      const result = await service.computeLoading(request.params.id);
      if (!result) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Bus instance not found' },
        });
      }
      return result;
    },
  );

  // GET /api/bus-instances/:id/messages
  app.get<{ Params: { id: string } }>(
    '/api/bus-instances/:id/messages',
    async (request) => {
      return service.getMessages(request.params.id);
    },
  );
}
