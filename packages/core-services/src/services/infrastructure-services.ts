/**
 * Infrastructure services — audit logging, notifications, scope filtering.
 * Same pattern as AssureFlow for cross-platform consistency.
 */
import { type Knex } from 'knex';
import { randomUUID } from 'crypto';

function gid() { return randomUUID().replace(/-/g, '').slice(0, 26); }

// ── Audit Service ────────────────────────────────────────────────

export class AuditService {
  constructor(private db: Knex) {}

  async log(entry: { actorId: string; actorType?: string; actionType: string; targetId?: string; targetEntityType: string; changeDelta?: any; ipAddress?: string }) {
    await this.db('audit_entry').insert({ id: gid(), actor_id: entry.actorId, actor_type: entry.actorType ?? 'user', action_type: entry.actionType, target_id: entry.targetId, target_entity_type: entry.targetEntityType, change_delta: entry.changeDelta ? JSON.stringify(entry.changeDelta) : null, ip_address: entry.ipAddress });
  }

  async getRecent(limit = 50) {
    return this.db('audit_entry').orderBy('timestamp', 'desc').limit(limit);
  }
}

// ── Notification Service ─────────────────────────────────────────

export class NotificationService {
  constructor(private db: Knex) {}

  async create(recipientId: string, type: string, title: string, body?: string, targetId?: string) {
    return this.db('notification').insert({ id: gid(), recipient_id: recipientId, type, title, body, target_id: targetId, status: 'unread' }).returning('*');
  }

  async listForUser(userId: string, limit = 20) {
    return this.db('notification').where('recipient_id', userId).orderBy('created_at', 'desc').limit(limit);
  }

  async markRead(id: string) {
    return this.db('notification').where('id', id).update({ status: 'read' });
  }

  async unreadCount(userId: string): Promise<number> {
    const [{ count }] = await this.db('notification').where({ recipient_id: userId, status: 'unread' }).count('* as count');
    return Number(count);
  }
}

// ── Scope Service ────────────────────────────────────────────────

export interface UserScope {
  allowedSystems: string[];
  allowedProtocols: string[];
  allowedTypes: string[];
  projectId?: string;
}

export class ScopeService {
  private cache = new Map<string, { scopes: UserScope[]; ts: number }>();

  constructor(private db: Knex) {}

  async getScopesForUser(userId: string): Promise<UserScope[]> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.ts < 60000) return cached.scopes;
    const rows = await this.db('user_scope').where('user_id', userId).where(function() { this.whereNull('expires_at').orWhere('expires_at', '>', new Date()); });
    const scopes = rows.map((r: any) => ({ allowedSystems: r.allowed_systems ?? [], allowedProtocols: r.allowed_protocols ?? [], allowedTypes: r.allowed_types ?? [], projectId: r.project_id }));
    this.cache.set(userId, { scopes, ts: Date.now() });
    return scopes;
  }

  filterSignals(signals: any[], scopes: UserScope[]): any[] {
    if (scopes.length === 0) return signals;
    return signals.filter(s => scopes.some(scope => {
      const sysOk = scope.allowedSystems.length === 0 || scope.allowedSystems.includes(s.sourceSystem) || scope.allowedSystems.includes(s.destSystem);
      const protoOk = scope.allowedProtocols.length === 0 || scope.allowedProtocols.includes(s.protocol);
      return sysOk && protoOk;
    }));
  }

  async assignScope(data: { userId: string; projectId?: string; allowedSystems: string[]; allowedProtocols: string[]; grantedBy: string }) {
    return this.db('user_scope').insert({ id: gid(), user_id: data.userId, project_id: data.projectId, allowed_systems: data.allowedSystems, allowed_protocols: data.allowedProtocols, allowed_types: [], granted_by: data.grantedBy });
  }

  async revokeScope(id: string) {
    return this.db('user_scope').where('id', id).delete();
  }
}
