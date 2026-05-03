/**
 * SysML Import/Export REST routes.
 * §1 Backend: Business logic in services, NOT here.
 * §3 Backend: Stubs return 501, NEVER fake 200.
 */

import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import { SysmlExportQuerySchema, createSysmlExportService } from '../services/phase2-services.js';

export async function registerSysmlRoutes(
  app: FastifyInstance,
  db: Knex,
): Promise<void> {
  const service = createSysmlExportService(db);

  // POST /api/sysml/import — §3: 501 stub
  app.post('/api/sysml/import', async (_request, reply) => {
    return reply.status(501).send({
      error: { code: 'NOT_IMPLEMENTED', message: 'SysML import not yet implemented' },
    });
  });

  // GET /api/sysml/export?projectId=X&format=json|sysmlv2
  app.get('/api/sysml/export', async (request, reply) => {
    const parsed = SysmlExportQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues },
      });
    }

    if (parsed.data.format === 'sysmlv2') {
      return reply.status(501).send({
        error: { code: 'NOT_IMPLEMENTED', message: 'SysML v2 export not yet implemented' },
      });
    }

    return service.exportJson(parsed.data.projectId);
  });
}
