/**
 * System Hierarchy REST routes — thin wrappers delegating to SystemHierarchyService.
 * §1 Backend: No business logic here. §2 Backend: Zod .strict() on every input.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SystemHierarchyService } from '@connectedicd/core-services/src/services/system-hierarchy-service.js';

// ---------------------------------------------------------------------------
// Zod Schemas — §2 Backend: .strict() on every input
// ---------------------------------------------------------------------------

const CreateSystemSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  manufacturer: z.string().optional(),
  partNumber: z.string().optional(),
  ataChapter: z.string().optional(),
  systemType: z.string().optional(),
  parentSystemId: z.string().uuid().nullable().optional(),
  dalLevel: z.string().optional(),
  redundancyGroup: z.string().optional(),
  location: z.string().optional(),
  massKg: z.number().nullable().optional(),
  powerWatts: z.number().nullable().optional(),
  volumeCm3: z.number().nullable().optional(),
  lengthMm: z.number().nullable().optional(),
  widthMm: z.number().nullable().optional(),
  heightMm: z.number().nullable().optional(),
  budgetStatus: z.string().optional(),
  diagramX: z.number().optional(),
  diagramY: z.number().optional(),
  profileData: z.record(z.unknown()).optional(),
}).strict();

const UpdateSystemSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  manufacturer: z.string().optional(),
  partNumber: z.string().optional(),
  ataChapter: z.string().optional(),
  systemType: z.string().optional(),
  parentSystemId: z.string().uuid().nullable().optional(),
  dalLevel: z.string().optional(),
  redundancyGroup: z.string().optional(),
  location: z.string().optional(),
  massKg: z.number().nullable().optional(),
  powerWatts: z.number().nullable().optional(),
  volumeCm3: z.number().nullable().optional(),
  lengthMm: z.number().nullable().optional(),
  widthMm: z.number().nullable().optional(),
  heightMm: z.number().nullable().optional(),
  budgetStatus: z.string().optional(),
  diagramX: z.number().optional(),
  diagramY: z.number().optional(),
  profileData: z.record(z.unknown()).optional(),
}).strict();

const DiagramPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
}).strict();

const ListQuerySchema = z.object({
  projectId: z.string().uuid(),
  systemType: z.string().optional(),
  dalLevel: z.string().optional(),
  location: z.string().optional(),
  redundancyGroup: z.string().optional(),
}).strict();

const SubtreeQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(50).optional(),
}).strict();

// ---------------------------------------------------------------------------
// Error helper — §8 Backend: {error: {code, message, details?}}
// ---------------------------------------------------------------------------

function notFoundReply(reply: any, message: string) {
  return reply.status(404).send({ error: { code: 'NOT_FOUND', message } });
}

function validationReply(reply: any, err: z.ZodError) {
  return reply.status(400).send({
    error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.issues },
  });
}

// ---------------------------------------------------------------------------
// Route deps
// ---------------------------------------------------------------------------

export interface SystemRouteDeps {
  systemHierarchyService: SystemHierarchyService;
  auditService?: { record(entry: { userId?: string; entityType: string; entityId: string; action: string; beforeState?: Record<string, unknown>; afterState?: Record<string, unknown>; timestamp: Date }): Promise<void> };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function registerSystemRoutes(
  app: FastifyInstance,
  deps: SystemRouteDeps,
): Promise<void> {
  const { systemHierarchyService: svc } = deps;
  const audit = deps.auditService;

  // POST /api/systems
  app.post('/api/systems', async (request, reply) => {
    const parsed = CreateSystemSchema.safeParse(request.body);
    if (!parsed.success) return validationReply(reply, parsed.error);
    const row = await svc.create(parsed.data);
    if (audit) {
      await audit.record({ entityType: 'system', entityId: (row as any).id, action: 'create', afterState: row as Record<string, unknown>, timestamp: new Date() });
    }
    return reply.status(201).send(row);
  });

  // GET /api/systems?projectId=X&systemType=Y&dalLevel=Z&location=L&redundancyGroup=R
  app.get('/api/systems', async (request, reply) => {
    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) return validationReply(reply, parsed.error);
    const rows = await svc.list(parsed.data);
    return rows;
  });

  // GET /api/systems/:id
  app.get<{ Params: { id: string } }>('/api/systems/:id', async (request, reply) => {
    try {
      return await svc.getById(request.params.id);
    } catch (e: any) {
      if (e.name === 'NotFoundError') return notFoundReply(reply, e.message);
      throw e;
    }
  });

  // PUT /api/systems/:id
  app.put<{ Params: { id: string } }>('/api/systems/:id', async (request, reply) => {
    const parsed = UpdateSystemSchema.safeParse(request.body);
    if (!parsed.success) return validationReply(reply, parsed.error);
    try {
      let beforeState: Record<string, unknown> | undefined;
      if (audit) {
        try { beforeState = await svc.getById(request.params.id) as Record<string, unknown>; } catch {}
      }
      const result = await svc.update(request.params.id, parsed.data);
      if (audit) {
        await audit.record({ entityType: 'system', entityId: request.params.id, action: 'update', beforeState, afterState: result as Record<string, unknown>, timestamp: new Date() });
      }
      return result;
    } catch (e: any) {
      if (e.name === 'NotFoundError') return notFoundReply(reply, e.message);
      throw e;
    }
  });

  // GET /api/systems/:id/children
  app.get<{ Params: { id: string } }>('/api/systems/:id/children', async (request) => {
    return svc.getChildren(request.params.id);
  });

  // GET /api/systems/:id/subtree?depth=N
  app.get<{ Params: { id: string } }>('/api/systems/:id/subtree', async (request, reply) => {
    const parsed = SubtreeQuerySchema.safeParse(request.query);
    if (!parsed.success) return validationReply(reply, parsed.error);
    return svc.getSubtree(request.params.id, parsed.data.depth ?? 10);
  });

  // PUT /api/systems/:id/diagram-position
  app.put<{ Params: { id: string } }>('/api/systems/:id/diagram-position', async (request, reply) => {
    const parsed = DiagramPositionSchema.safeParse(request.body);
    if (!parsed.success) return validationReply(reply, parsed.error);
    try {
      return await svc.updateDiagramPosition(request.params.id, parsed.data.x, parsed.data.y);
    } catch (e: any) {
      if (e.name === 'NotFoundError') return notFoundReply(reply, e.message);
      throw e;
    }
  });

  // GET /api/systems/:id/budget-rollup
  app.get<{ Params: { id: string } }>('/api/systems/:id/budget-rollup', async (request, reply) => {
    try {
      return await svc.getBudgetRollup(request.params.id);
    } catch (e: any) {
      if (e.name === 'NotFoundError') return notFoundReply(reply, e.message);
      throw e;
    }
  });
}
