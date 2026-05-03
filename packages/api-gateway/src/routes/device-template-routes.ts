/**
 * Device Template REST routes — thin wrappers delegating to service.
 * §1 Backend: Business logic in services, NOT here.
 */

import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import type { AuditWriter } from '@connectedicd/core-services';
import {
  CreateDeviceTemplateSchema,
  InstantiateTemplateSchema,
  createDeviceTemplateService,
} from '../services/phase2-services.js';

export async function registerDeviceTemplateRoutes(
  app: FastifyInstance,
  db: Knex,
  audit?: AuditWriter,
): Promise<void> {
  const service = createDeviceTemplateService(db);

  // POST /api/device-templates
  app.post('/api/device-templates', async (request, reply) => {
    const parsed = CreateDeviceTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues },
      });
    }
    const result = await service.create(parsed.data);
    if (audit) {
      await audit.record({ entityType: 'device_template', entityId: (result as any).id, action: 'create', afterState: result as Record<string, unknown>, timestamp: new Date() });
    }
    return reply.status(201).send(result);
  });

  // GET /api/device-templates
  app.get('/api/device-templates', async () => {
    return service.list();
  });

  // GET /api/device-templates/:id
  app.get<{ Params: { id: string } }>('/api/device-templates/:id', async (request, reply) => {
    const result = await service.getById(request.params.id);
    if (!result) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Device template not found' } });
    }
    return result;
  });

  // POST /api/device-templates/:id/instantiate
  app.post<{ Params: { id: string } }>('/api/device-templates/:id/instantiate', async (request, reply) => {
    const parsed = InstantiateTemplateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues },
      });
    }
    const result = await service.instantiate(request.params.id, parsed.data);
    if (!result) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Device template not found' } });
    }
    if (audit) {
      await audit.record({ entityType: 'system', entityId: (result as any).id, action: 'instantiate_from_template', afterState: result as Record<string, unknown>, timestamp: new Date() });
    }
    return reply.status(201).send(result);
  });
}
