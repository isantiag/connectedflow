/**
 * ICD Export REST routes — thin wrappers delegating to service.
 * §1 Backend: Business logic in services, NOT here.
 */

import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';
import { IcdExportQuerySchema, createIcdExportService } from '../services/phase2-services.js';

export async function registerIcdExportRoutes(
  app: FastifyInstance,
  db: Knex,
): Promise<void> {
  const service = createIcdExportService(db);

  // GET /api/icd-export?systemA=ID&systemB=ID&format=json|csv
  app.get('/api/icd-export', async (request, reply) => {
    const parsed = IcdExportQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues },
      });
    }

    const data = await service.generate(parsed.data.systemA, parsed.data.systemB);
    if (!data) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'One or both systems not found' } });
    }

    if (parsed.data.format === 'csv') {
      void reply.header('Content-Type', 'text/csv');
      void reply.header('Content-Disposition', 'attachment; filename="icd-export.csv"');
      return service.toCsv(data.signals);
    }

    return data;
  });
}
