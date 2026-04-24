const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || '';
const LOCAL_MODE = !JWT_SECRET;
const loginAttempts = new Map();

const PERMISSIONS = {
  admin: ['view', 'create', 'edit', 'delete', 'evaluate', 'approve'],
  editor: ['view', 'create', 'edit', 'evaluate'],
  viewer: ['view'],
};

async function authenticate(db, req) {
  const authHeader = req.headers.authorization || '';
  const apiKey = req.headers['x-api-key'];

  if (LOCAL_MODE && !authHeader && !apiKey) {
    const admin = await db('user').first();
    if (admin) {
      const ur = await db('user_role').where('user_id', admin.id).first();
      const r = ur ? await db('role').where('id', ur.role_id).first() : null;
      return { userId: admin.id, email: admin.email, displayName: admin.display_name, role: r?.name || 'admin', groups: JSON.parse(admin.groups || '[]') };
    }
  }

  if (authHeader.startsWith('Bearer ')) {
    try { return jwt.verify(authHeader.slice(7), JWT_SECRET || 'dev-secret'); } catch { return null; }
  }

  if (apiKey) {
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const key = await db('api_key').where({ key_hash: hash, revoked: false }).first();
    if (key) {
      const user = await db('user').where('id', key.user_id).first();
      if (user) {
        const ur = await db('user_role').where('user_id', user.id).first();
        const r = ur ? await db('role').where('id', ur.role_id).first() : null;
        return { userId: user.id, email: user.email, displayName: user.display_name, role: r?.name || 'viewer', groups: JSON.parse(user.groups || '[]') };
      }
    }
  }
  return null;
}

function hasPermission(session, resource, action) {
  if (!session) return LOCAL_MODE;
  const perms = PERMISSIONS[session.role] || PERMISSIONS.viewer;
  const actionMap = { read: 'view', create: 'create', update: 'edit', delete: 'delete' };
  return perms.includes(actionMap[action] || action);
}

async function login(db, email, password) {
  const attempts = loginAttempts.get(email);
  if (attempts?.lockedUntil && Date.now() < attempts.lockedUntil) {
    const mins = Math.ceil((attempts.lockedUntil - Date.now()) / 60000);
    return { error: `Account locked. Try again in ${mins} minutes.`, status: 429 };
  }

  const user = await db('user').where('email', email).first();
  if (!user) return { error: 'Invalid credentials', status: 401 };

  if (password) {
    const valid = user.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid) {
      const a = loginAttempts.get(email) || { count: 0 };
      a.count++;
      if (a.count >= 5) a.lockedUntil = Date.now() + 15 * 60 * 1000;
      loginAttempts.set(email, a);
      return { error: 'Invalid credentials', status: 401 };
    }
  }

  loginAttempts.delete(email);
  const userRole = await db('user_role').where('user_id', user.id).first();
  const role = userRole ? await db('role').where('id', userRole.role_id).first() : null;
  const scopes = await db('user_scope').where('user_id', user.id);
  const payload = { userId: user.id, email: user.email, displayName: user.display_name, role: role?.name || 'viewer', groups: JSON.parse(user.groups || '[]'), projectIds: scopes.map(s => s.project_id).filter(Boolean) };
  const token = jwt.sign(payload, JWT_SECRET || 'dev-secret', { expiresIn: '8h' });
  await db('user').where('id', user.id).update({ last_login: db.fn.now(), failed_login_attempts: 0 });
  return { token, user: payload };
}

async function changePassword(db, userId, currentPassword, newPassword) {
  if (!newPassword || newPassword.length < 6) return { error: 'Password must be at least 6 characters' };
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
    return { error: 'Password must contain uppercase, lowercase, digit, and special character' };
  }
  const user = await db('user').where('id', userId).first();
  if (user.password_hash && currentPassword) {
    if (!(await bcrypt.compare(currentPassword, user.password_hash))) return { error: 'Current password is incorrect', status: 401 };
  }
  await db('user').where('id', userId).update({ password_hash: await bcrypt.hash(newPassword, 10) });
  return { ok: true };
}

async function createApiKey(db, userId, label) {
  const rawKey = 'cicd_' + crypto.randomBytes(32).toString('hex');
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, 12) + '...';
  await db('api_key').insert({ user_id: userId, key_hash: keyHash, key_prefix: keyPrefix, label });
  return { key: rawKey, prefix: keyPrefix, label, message: 'Save this key — it will not be shown again.' };
}

module.exports = { authenticate, hasPermission, login, changePassword, createApiKey, LOCAL_MODE };
