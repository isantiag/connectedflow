/**
 * AI Analysis REST routes for ConnectedICD.
 */
import type { FastifyInstance } from 'fastify';
import { ConnectionManager } from '@connectedicd/core-services/src/db/connection.js';
import { AiAnalysisService } from '@connectedicd/core-services/src/services/ai-analysis-service.js';
import { LlmService } from '@connectedicd/core-services/src/services/llm-service.js';

export async function aiAnalysisRoutes(app: FastifyInstance) {
  const db = ConnectionManager.getInstance().getConnection();
  const ai = new AiAnalysisService(db);
  const llm = new LlmService();

  app.get('/api/ai/providers', async () => ({ available: llm.availableProviders }));

  app.post<{ Body: { projectId?: string } }>('/api/ai/throughput', async (req) => ai.analyzeThroughput(req.body.projectId));

  app.post<{ Body: { sourceSystem: string; destSystem: string; dataRequirements: string } }>(
    '/api/ai/routing', async (req) => ai.proposeRouting(req.body.sourceSystem, req.body.destSystem, req.body.dataRequirements));

  app.post<{ Body: { projectId?: string } }>('/api/ai/trends', async (req) => ai.analyzeTrends(req.body.projectId));

  app.post<{ Body: { projectId?: string } }>('/api/ai/constraints', async (req) => ai.validateConstraints(req.body.projectId));

  app.post<{ Body: { projectId?: string } }>('/api/ai/architecture', async (req) => ai.architectureInsights(req.body.projectId));

  app.post<{ Body: { projectId?: string } }>('/api/ai/anomalies', async (req) => ai.detectAnomalies(req.body.projectId));
}
