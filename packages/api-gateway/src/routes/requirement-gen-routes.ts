/**
 * Requirement Generation REST routes.
 */
import type { FastifyInstance } from 'fastify';
import { RequirementGeneratorService } from '@connectedflow/core-services/src/services/requirement-generator-service.js';
import { ConnectionManager } from '@connectedflow/core-services/src/db/connection.js';

export async function requirementGenRoutes(app: FastifyInstance) {
  const db = ConnectionManager.getInstance().getConnection();
  const gen = new RequirementGeneratorService(db);

  // GET /api/requirements/generate?projectId=X — preview generated requirements
  app.get<{ Querystring: { projectId?: string } }>('/api/requirements/generate', async (request) => {
    return gen.generateFromSignals(request.query.projectId);
  });

  // GET /api/requirements/generate/reqif?projectId=X — export as ReqIF
  app.get<{ Querystring: { projectId?: string } }>('/api/requirements/generate/reqif', async (request, reply) => {
    const reqs = await gen.generateFromSignals(request.query.projectId);
    const xml = gen.generateReqIF(reqs);
    reply.header('Content-Type', 'application/xml');
    reply.header('Content-Disposition', 'attachment; filename="connectedflow-requirements.reqif"');
    return reply.send(xml);
  });

  // POST /api/requirements/push-to-assureflow — push to AssureFlow
  app.post<{ Body: { assureFlowUrl: string; projectId: string; token: string; sourceProjectId?: string } }>(
    '/api/requirements/push-to-assureflow', async (request) => {
      const { assureFlowUrl, projectId, token, sourceProjectId } = request.body;
      const reqs = await gen.generateFromSignals(sourceProjectId);
      return gen.pushToAssureFlow(reqs, assureFlowUrl, projectId, token);
    }
  );
}
