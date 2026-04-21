// @connectedicd/api-gateway
// REST, GraphQL, and WebSocket API gateway.

export { createServer, type ServiceContainer } from './server.js';
export { errorHandler } from './middleware/error-handler.js';
export { createRbacHook, type RbacOptions } from './middleware/rbac-middleware.js';
export { registerSignalRoutes, type SignalRouteDeps } from './routes/signal-routes.js';
export { registerBaselineRoutes, type BaselineRouteDeps } from './routes/baseline-routes.js';
export { registerWorkflowRoutes, type WorkflowRouteDeps } from './routes/workflow-routes.js';
export { registerAuditRoutes, type AuditRouteDeps } from './routes/audit-routes.js';
export { createGraphQLSchema, type GraphQLDeps } from './graphql/schema.js';
export { registerLiveDataWs, type LiveDataWsDeps } from './ws/live-data-ws.js';
