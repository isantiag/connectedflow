/**
 * Multi-Supplier Collaboration REST routes.
 */
import type { FastifyInstance } from 'fastify';
import { ConnectionManager } from '@connectedicd/core-services/src/db/connection.js';
import { SignalOwnershipService, SignalCommentService, EditLockService, OrganizationService } from '@connectedicd/core-services/src/services/collaboration-service.js';
import { NotificationService } from '@connectedicd/core-services/src/services/infrastructure-services.js';

export async function collaborationRoutes(app: FastifyInstance) {
  const db = ConnectionManager.getInstance().getConnection();
  const ownership = new SignalOwnershipService(db);
  const comments = new SignalCommentService(db);
  const locks = new EditLockService(db);
  const orgs = new OrganizationService(db);
  const notify = new NotificationService(db);

  // ── Ownership ──────────────────────────────────────────────────

  app.get<{ Params: { signalId: string } }>('/api/signals/:signalId/ownership', async (req) => {
    return ownership.getOwnership(req.params.signalId);
  });

  app.post<{ Params: { signalId: string }; Body: { sourceOwnerId: string; sourceOrg: string; destOwnerId?: string; destOrg?: string } }>(
    '/api/signals/:signalId/ownership', async (req) => {
      const { sourceOwnerId, sourceOrg, destOwnerId, destOrg } = req.body;
      return ownership.assign(req.params.signalId, sourceOwnerId, sourceOrg, destOwnerId, destOrg);
    });

  app.put<{ Params: { signalId: string } }>('/api/signals/:signalId/ownership/approve-source', async (req) => {
    await ownership.approveSource(req.params.signalId);
    return { status: 'source_approved' };
  });

  app.put<{ Params: { signalId: string } }>('/api/signals/:signalId/ownership/approve-dest', async (req) => {
    await ownership.approveDest(req.params.signalId);
    return { status: 'dest_approved' };
  });

  app.get('/api/handshakes/pending', async (req) => {
    const org = (req.query as any).org;
    return ownership.listPendingHandshakes(org);
  });

  // ── Comments ───────────────────────────────────────────────────

  app.get<{ Params: { signalId: string } }>('/api/signals/:signalId/comments', async (req) => {
    return comments.list(req.params.signalId);
  });

  app.post<{ Params: { signalId: string }; Body: { authorId: string; authorName: string; body: string; authorOrg?: string; parentId?: string } }>(
    '/api/signals/:signalId/comments', async (req) => {
      const { authorId, authorName, body, authorOrg, parentId } = req.body;
      const result = await comments.create(req.params.signalId, authorId, authorName, body, authorOrg, parentId);
      // Notify signal owners
      const own = await ownership.getOwnership(req.params.signalId);
      if (own?.source_owner_id && own.source_owner_id !== authorId) {
        await notify.create(own.source_owner_id, 'signal_comment', `New comment on signal`, body.slice(0, 100), req.params.signalId).catch(() => {});
      }
      if (own?.dest_owner_id && own.dest_owner_id !== authorId) {
        await notify.create(own.dest_owner_id, 'signal_comment', `New comment on signal`, body.slice(0, 100), req.params.signalId).catch(() => {});
      }
      return result;
    });

  app.put<{ Params: { commentId: string } }>('/api/comments/:commentId/resolve', async (req) => {
    await comments.resolve(req.params.commentId);
    return { status: 'resolved' };
  });

  // ── Edit Locks ─────────────────────────────────────────────────

  app.post<{ Params: { signalId: string }; Body: { userId: string; userName: string } }>(
    '/api/signals/:signalId/lock', async (req) => {
      const result = await locks.acquireLock(req.params.signalId, req.body.userId, req.body.userName);
      if (!result.acquired) {
        // Notify the user trying to edit that someone else has the lock
        await notify.create(req.body.userId, 'edit_conflict', `Signal is being edited by ${result.lockedBy}`, `Wait for them to finish or ask them to release the lock.`, req.params.signalId).catch(() => {});
      }
      return result;
    });

  app.delete<{ Params: { signalId: string }; Body: { userId: string } }>(
    '/api/signals/:signalId/lock', async (req) => {
      await locks.releaseLock(req.params.signalId, req.body.userId);
      return { status: 'released' };
    });

  app.get('/api/locks/active', async () => {
    return locks.getActiveLocks();
  });

  // ── Organizations ──────────────────────────────────────────────

  app.get('/api/organizations', async () => orgs.list());

  app.post<{ Body: { name: string; type?: string } }>('/api/organizations', async (req) => {
    return orgs.create(req.body.name, req.body.type);
  });
}
