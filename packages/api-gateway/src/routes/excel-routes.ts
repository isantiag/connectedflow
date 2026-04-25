/**
 * Excel Round-Trip REST routes — template generation, export, and import.
 */
import type { FastifyInstance } from 'fastify';
import { ExcelService } from '@connectedicd/integration-services/src/services/excel-service.js';

const excel = new ExcelService();

export async function excelRoutes(app: FastifyInstance) {

  // GET /api/signals/export-template?protocol=arinc429&projectName=Birdow
  app.get<{ Querystring: { protocol?: string; projectName?: string } }>(
    '/api/signals/export-template',
    async (request, reply) => {
      const protocol = request.query.protocol ?? 'arinc429';
      const projectName = request.query.projectName;
      const buffer = await excel.generateTemplate(protocol, projectName);
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      reply.header('Content-Disposition', `attachment; filename="connectedicd-template-${protocol}.xlsx"`);
      return reply.send(buffer);
    }
  );

  // GET /api/signals/export?projectId=X&format=xlsx
  app.get<{ Querystring: { projectId?: string; format?: string } }>(
    '/api/signals/export',
    async (request, reply) => {
      // TODO(NOT-IMPLEMENTED): TASK-046 — wire signal export to DB query
      return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED', message: 'Signal export by projectId not yet wired to database' } });
    }
  );

  // POST /api/signals/import-excel
  app.post('/api/signals/import-excel', async (request, reply) => {
    const data = await request.file?.();
    if (!data) return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: 'No file uploaded' } });
    const buffer = Buffer.from(await data.toBuffer());
    const result = await excel.parseExcel(buffer);
    return reply.send(result);
  });
}
