/**
 * N² Interface Matrix REST route.
 */
import type { FastifyInstance } from 'fastify';
import { N2MatrixService } from '@connectedicd/core-services/src/services/n2-matrix-service.js';
import { ConnectionManager } from '@connectedicd/core-services/src/db/connection.js';

export async function n2Routes(app: FastifyInstance) {
  const db = ConnectionManager.getInstance().getConnection();
  const n2 = new N2MatrixService(db);

  // GET /api/n2-matrix?projectId=X
  app.get<{ Querystring: { projectId?: string } }>('/api/n2-matrix', async (request) => {
    return n2.generate(request.query.projectId);
  });
}
