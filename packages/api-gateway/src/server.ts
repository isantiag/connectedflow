/**
 * Fastify server setup with CORS, error handling, correlation IDs,
 * REST routes, GraphQL, and WebSocket support.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { createYoga } from 'graphql-yoga';
import { v4 as uuidv4 } from 'uuid';

import type { SignalService, RbacService, WorkflowService, AuditService, BaselineService } from '@connectedicd/core-services';

import { errorHandler } from './middleware/error-handler.js';
import { registerSignalRoutes } from './routes/signal-routes.js';
import { registerBaselineRoutes } from './routes/baseline-routes.js';
import { registerWorkflowRoutes } from './routes/workflow-routes.js';
import { registerAuditRoutes } from './routes/audit-routes.js';
import { createGraphQLSchema } from './graphql/schema.js';
import { registerLiveDataWs, type LiveDataWsDeps } from './ws/live-data-ws.js';
import { registerSystemRoutes } from './routes/system-routes.js';
import { registerPowerModeRoutes } from './routes/power-mode-routes.js';
import { registerBusInstanceRoutes } from './routes/bus-instance-routes.js';
import { registerProtocolValidationRoutes } from './routes/protocol-validation-routes.js';
import type { SystemHierarchyService } from '@connectedicd/core-services/src/services/system-hierarchy-service.js';
import type { Knex } from 'knex';

// ---------------------------------------------------------------------------
// Service container — all services injected at startup
// ---------------------------------------------------------------------------

export interface ServiceContainer {
  signalService: SignalService;
  rbacService: RbacService;
  workflowService: WorkflowService;
  auditService: AuditService;
  baselineService: BaselineService;
  systemHierarchyService?: SystemHierarchyService;
  liveDataWsDeps?: LiveDataWsDeps;
  db?: Knex;
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export async function createServer(services: ServiceContainer): Promise<FastifyInstance> {
  const app = Fastify({
    genReqId: () => uuidv4(),
    logger: false,
  });

  // --- CORS ---
  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  // --- WebSocket ---
  await app.register(websocket);

  // --- Correlation ID header ---
  app.addHook('onRequest', async (request, reply) => {
    if (!request.headers['x-correlation-id']) {
      request.headers['x-correlation-id'] = request.id;
    }
    void reply.header('x-correlation-id', request.headers['x-correlation-id']);
  });

  // --- Error handler ---
  app.setErrorHandler(errorHandler);

  // --- Health check ---
  app.get('/health', async () => ({ status: 'ok' }));

  // --- REST routes ---
  await registerSignalRoutes(app, {
    signalService: services.signalService,
    rbacService: services.rbacService,
  });

  await registerBaselineRoutes(app, {
    baselineService: services.baselineService,
    rbacService: services.rbacService,
  });

  await registerWorkflowRoutes(app, {
    workflowService: services.workflowService,
    rbacService: services.rbacService,
  });

  await registerAuditRoutes(app, {
    auditService: services.auditService,
    rbacService: services.rbacService,
  });

  // --- System Hierarchy routes ---
  if (services.systemHierarchyService) {
    await registerSystemRoutes(app, {
      systemHierarchyService: services.systemHierarchyService,
      auditService: services.auditService,
    });
  }

  // --- Architecture Model routes (Tasks 5, 6, 7) ---
  if (services.db) {
    await registerPowerModeRoutes(app, services.db, services.auditService);
    await registerBusInstanceRoutes(app, services.db, services.auditService);
    await registerProtocolValidationRoutes(app, services.db);
  }

  // --- GraphQL (graphql-yoga) ---
  const yoga = createYoga({
    schema: createGraphQLSchema({ signalService: services.signalService }),
    graphqlEndpoint: '/graphql',
    logging: false,
  });

  app.route({
    url: '/graphql',
    method: ['GET', 'POST', 'OPTIONS'],
    handler: async (request, reply) => {
      const response = await yoga.handleNodeRequestAndResponse(
        request.raw,
        reply.raw,
        {},
      );
      // graphql-yoga writes directly to the response
      void reply.hijack();
      for (const [key, value] of response.headers.entries()) {
        reply.raw.setHeader(key, value);
      }
      reply.raw.statusCode = response.status;
      const body = await response.text();
      reply.raw.end(body);
    },
  });

  // --- WebSocket live data ---
  await registerLiveDataWs(app, services.liveDataWsDeps ?? {});

  return app;
}
