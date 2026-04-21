/**
 * Multi-Supplier Collaboration Service
 * 
 * Signal ownership: each signal has a source owner (transmitting system's org)
 * and a dest owner (receiving system's org). Both must approve changes (handshake).
 * 
 * Comments: threaded discussions on signals, resolvable.
 * 
 * Conflict detection: edit locks prevent two users from modifying the same signal.
 */
import { type Knex } from 'knex';
import { randomUUID } from 'crypto';

function gid() { return randomUUID().replace(/-/g, '').slice(0, 26); }

// ── Signal Ownership ─────────────────────────────────────────────

export class SignalOwnershipService {
  constructor(private db: Knex) {}

  async assign(signalId: string, sourceOwnerId: string, sourceOrg: string, destOwnerId?: string, destOrg?: string) {
    const existing = await this.db('signal_ownership').where('signal_id', signalId).first();
    if (existing) {
      return this.db('signal_ownership').where('signal_id', signalId).update({
        source_owner_id: sourceOwnerId, source_org: sourceOrg,
        dest_owner_id: destOwnerId, dest_org: destOrg, updated_at: new Date(),
      }).returning('*');
    }
    return this.db('signal_ownership').insert({
      id: gid(), signal_id: signalId, source_owner_id: sourceOwnerId, source_org: sourceOrg,
      dest_owner_id: destOwnerId, dest_org: destOrg, handshake_status: 'pending',
    }).returning('*');
  }

  async getOwnership(signalId: string) {
    return this.db('signal_ownership').where('signal_id', signalId).first();
  }

  async approveSource(signalId: string) {
    return this.db('signal_ownership').where('signal_id', signalId).update({ source_approved_at: new Date(), handshake_status: this.db.raw("CASE WHEN dest_approved_at IS NOT NULL THEN 'approved' ELSE 'partial' END"), updated_at: new Date() });
  }

  async approveDest(signalId: string) {
    return this.db('signal_ownership').where('signal_id', signalId).update({ dest_approved_at: new Date(), handshake_status: this.db.raw("CASE WHEN source_approved_at IS NOT NULL THEN 'approved' ELSE 'partial' END"), updated_at: new Date() });
  }

  async listPendingHandshakes(orgName?: string) {
    let q = this.db('signal_ownership').where('handshake_status', '!=', 'approved');
    if (orgName) q = q.where(function() { this.where('source_org', orgName).orWhere('dest_org', orgName); });
    return q;
  }
}

// ── Signal Comments ──────────────────────────────────────────────

export class SignalCommentService {
  constructor(private db: Knex) {}

  async list(signalId: string) {
    return this.db('signal_comment').where('signal_id', signalId).orderBy('created_at', 'asc');
  }

  async create(signalId: string, authorId: string, authorName: string, body: string, authorOrg?: string, parentId?: string) {
    return this.db('signal_comment').insert({
      id: gid(), signal_id: signalId, parent_id: parentId, author_id: authorId,
      author_name: authorName, author_org: authorOrg, body,
    }).returning('*');
  }

  async resolve(commentId: string) {
    return this.db('signal_comment').where('id', commentId).update({ resolved: true });
  }

  async unresolvedCount(signalId: string): Promise<number> {
    const [{ count }] = await this.db('signal_comment').where({ signal_id: signalId, resolved: false }).count('* as count');
    return Number(count);
  }
}

// ── Edit Lock / Conflict Detection ───────────────────────────────

export class EditLockService {
  constructor(private db: Knex) {}

  async acquireLock(signalId: string, userId: string, userName: string): Promise<{ acquired: boolean; lockedBy?: string }> {
    // Clean expired locks
    await this.db('signal_edit_lock').where('expires_at', '<', new Date()).delete();

    const existing = await this.db('signal_edit_lock').where('signal_id', signalId).first();
    if (existing && existing.locked_by !== userId) {
      return { acquired: false, lockedBy: existing.locked_by_name };
    }

    if (existing) {
      // Extend lock
      await this.db('signal_edit_lock').where('signal_id', signalId).update({ expires_at: this.db.raw("NOW() + INTERVAL '5 minutes'") });
      return { acquired: true };
    }

    await this.db('signal_edit_lock').insert({ signal_id: signalId, locked_by: userId, locked_by_name: userName });
    return { acquired: true };
  }

  async releaseLock(signalId: string, userId: string) {
    return this.db('signal_edit_lock').where({ signal_id: signalId, locked_by: userId }).delete();
  }

  async getActiveLocks(): Promise<any[]> {
    await this.db('signal_edit_lock').where('expires_at', '<', new Date()).delete();
    return this.db('signal_edit_lock');
  }
}

// ── Organization Service ─────────────────────────────────────────

export class OrganizationService {
  constructor(private db: Knex) {}

  async list() { return this.db('organization').orderBy('name'); }

  async create(name: string, type: string = 'supplier') {
    return this.db('organization').insert({ id: gid(), name, type }).returning('*');
  }

  async getUsers(orgId: string) {
    return this.db('users').where('org_id', orgId);
  }
}
