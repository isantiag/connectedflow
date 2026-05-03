/**
 * Power Mode REST routes — thin wrappers delegating to PowerModeService.
 * §1 Backend: Business logic in services, NOT here.
 */

import type { FastifyInstance } from 'fastify';
import { CreatePowerModeSchema, createPowerModeService } from '../services/architecture-services.js';
import type { Knex } from 'knex';
import type { AuditWriter } from '@connectedicd/core-services';

export async function registerPowerModeRoutes(
  app: FastifyInstance,
  db: Knex,
  audit?: AuditWriter,
): Promise<void> {
  const service = createPowerModeService(db);

  // POST /api/systems/:systemId/power-modes
  app.post<{ Params: { systemId: string } }>(
    '/api/systems/:systemId/power-modes',
    async (request, reply) => {
      const parsed = CreatePowerModeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(422).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues },
        });
      }
      const result = await service.create(request.params.systemId, parsed.data);
      if (audit) {
        await audit.record({ entityType: 'system_power_mode', entityId: (result as any).id ?? request.params.systemId, action: 'create', afterState: result as Record<string, unknown>, timestamp: new Date() });
      }
      void reply.status(201);
      return result;
    },
  );

  // GET /api/systems/:systemId/power-modes
  app.get<{ Params: { systemId: string } }>(
    '/api/systems/:systemId/power-modes',
    async (request) => {
      return service.list(request.params.systemId);
    },
  );

  // DELETE /api/systems/:systemId/power-modes/:modeId
  app.delete<{ Params: { systemId: string; modeId: string } }>(
    '/api/systems/:systemId/power-modes/:modeId',
    async (request, reply) => {
      const result = await service.remove(request.params.systemId, request.params.modeId);
      if (!result.deleted) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Power mode not found' },
        });
      }
      if (audit) {
        await audit.record({ entityType: 'system_power_mode', entityId: request.params.modeId, action: 'delete', beforeState: { systemId: request.params.systemId, modeId: request.params.modeId }, timestamp: new Date() });
      }
      return result;
    },
  );
}
