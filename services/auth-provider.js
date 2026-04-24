/**
 * AuthProvider Interface — Foundation #2
 * Swappable auth: EmailPasswordProvider now, SAML/OIDC later.
 */

class EmailPasswordProvider {
  constructor(db, config = {}) {
    this.db = db;
    this.jwt = require('jsonwebtoken');
    this.bcrypt = require('bcryptjs');
    this.crypto = require('crypto');
    this.jwtSecret = config.jwtSecret || process.env.JWT_SECRET || '';
    this.jwtExpiresIn = config.jwtExpiresIn || '8h';
    this.localMode = !this.jwtSecret;
    this.loginAttempts = new Map();
  }

  async login(email, password) {
    const attempts = this.loginAttempts.get(email);
    if (attempts?.lockedUntil && Date.now() < attempts.lockedUntil) {
      const mins = Math.ceil((attempts.lockedUntil - Date.now()) / 60000);
      return { error: `Account locked. Try again in ${mins} minutes.`, status: 429 };
    }
    const user = await this.db('user').where('email', email).first();
    if (!user) return { error: 'Invalid credentials', status: 401 };
    if (password) {
      const valid = user.password_hash ? await this.bcrypt.compare(password, user.password_hash) : false;
      if (!valid) {
        const a = this.loginAttempts.get(email) || { count: 0 };
        a.count++;
        if (a.count >= 5) a.lockedUntil = Date.now() + 15 * 60 * 1000;
        this.loginAttempts.set(email, a);
        return { error: 'Invalid credentials', status: 401 };
      }
    }
    this.loginAttempts.delete(email);
    const payload = await this._buildPayload(user);
    const token = this.jwt.sign(payload, this.jwtSecret || 'dev-secret', { expiresIn: this.jwtExpiresIn });
    await this.db('user').where('id', user.id).update({ last_login: this.db.fn.now(), failed_login_attempts: 0 });
    return { token, user: payload };
  }

  async logout(_token) { /* stateless JWT — no-op for now */ }

  async getUser(req) {
    const authHeader = req.headers.authorization || '';
    const apiKey = req.headers['x-api-key'];
    if (this.localMode && !authHeader && !apiKey) {
      const admin = await this.db('user').first();
      if (admin) return this._buildPayload(admin);
    }
    if (authHeader.startsWith('Bearer ')) {
      try { return this.jwt.verify(authHeader.slice(7), this.jwtSecret || 'dev-secret'); } catch { return null; }
    }
    if (apiKey) {
      const hash = this.crypto.createHash('sha256').update(apiKey).digest('hex');
      const key = await this.db('api_key').where({ key_hash: hash, revoked: false }).first();
      if (key) {
        const user = await this.db('user').where('id', key.user_id).first();
        if (user) return this._buildPayload(user);
      }
    }
    return null;
  }

  async validateToken(token) {
    try { return this.jwt.verify(token, this.jwtSecret || 'dev-secret'); } catch { return null; }
  }

  async _buildPayload(user) {
    const ur = await this.db('user_role').where('user_id', user.id).first();
    const r = ur ? await this.db('role').where('id', ur.role_id).first() : null;
    const scopes = await this.db('user_scope').where('user_id', user.id);
    return {
      userId: user.id, email: user.email, displayName: user.display_name,
      role: r?.name || 'viewer', groups: JSON.parse(user.groups || '[]'),
      projectIds: scopes.map(s => s.project_id).filter(Boolean),
    };
  }
}

// Permission check — works with any provider
const PERMISSIONS = {
  admin: ['view', 'create', 'edit', 'delete', 'evaluate', 'approve'],
  lead: ['view', 'create', 'edit', 'evaluate', 'approve'],
  analyst: ['view', 'create', 'edit', 'evaluate'],
  reviewer: ['view', 'evaluate', 'approve'],
  editor: ['view', 'create', 'edit', 'evaluate'],
  viewer: ['view'],
};

function hasPermission(session, resource, action) {
  if (!session) return false;
  const perms = PERMISSIONS[session.role] || PERMISSIONS.viewer;
  const actionMap = { read: 'view', create: 'create', update: 'edit', delete: 'delete' };
  return perms.includes(actionMap[action] || action);
}

module.exports = { EmailPasswordProvider, hasPermission, PERMISSIONS };
