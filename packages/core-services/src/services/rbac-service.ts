/**
 * Role-Based Access Control (RBAC) service.
 *
 * Manages users, roles, and permissions. Enforces permission checks on
 * service operations and integrates with an abstract AuthProvider for
 * SSO/MFA authentication.
 */

import type { UserId, RoleId } from '@connectedflow/shared-types';
import type { UserRepository, UserRow } from '../repositories/user-repository.js';
import type { RoleRepository, RoleRow } from '../repositories/role-repository.js';
import type { UserRoleRepository } from '../repositories/user-role-repository.js';
import type { RolePermissionRepository, RolePermissionRow } from '../repositories/role-permission-repository.js';

// ---------------------------------------------------------------------------
// Permission model
// ---------------------------------------------------------------------------

export type Resource = 'signal' | 'baseline' | 'change_request' | 'project';
export type Action = 'read' | 'write' | 'delete' | 'approve';

export interface Permission {
  resource: Resource;
  action: Action;
}

// ---------------------------------------------------------------------------
// Built-in role definitions
// ---------------------------------------------------------------------------

const ALL_RESOURCES: Resource[] = ['signal', 'baseline', 'change_request', 'project'];

export const BUILT_IN_ROLES: Record<string, Permission[]> = {
  viewer: ALL_RESOURCES.map((r) => ({ resource: r, action: 'read' as Action })),
  editor: ALL_RESOURCES.flatMap((r) => [
    { resource: r, action: 'read' as Action },
    { resource: r, action: 'write' as Action },
  ]),
  approver: ALL_RESOURCES.flatMap((r) => [
    { resource: r, action: 'read' as Action },
    { resource: r, action: 'write' as Action },
    { resource: r, action: 'approve' as Action },
  ]),
  admin: ALL_RESOURCES.flatMap((r) =>
    (['read', 'write', 'delete', 'approve'] as Action[]).map((a) => ({
      resource: r,
      action: a,
    })),
  ),
};


// ---------------------------------------------------------------------------
// AuthProvider interface (SSO/MFA abstraction)
// ---------------------------------------------------------------------------

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  email?: string;
  displayName?: string;
  provider: string;
  mfaVerified: boolean;
  error?: string;
}

export interface AuthProvider {
  /** Authenticate a user with the given credentials. */
  authenticate(credentials: Record<string, unknown>): Promise<AuthResult>;
  /** Verify an MFA token for a user. */
  verifyMfa(userId: string, token: string): Promise<boolean>;
  /** Get the provider name (e.g. 'local', 'okta', 'azure-ad'). */
  readonly providerName: string;
}

// ---------------------------------------------------------------------------
// Local auth provider (simple implementation for development)
// ---------------------------------------------------------------------------

export class LocalAuthProvider implements AuthProvider {
  readonly providerName = 'local';

  private readonly credentials = new Map<string, { password: string; userId: string; email: string; displayName: string }>();
  private readonly mfaTokens = new Map<string, string>();

  register(userId: string, email: string, displayName: string, password: string): void {
    this.credentials.set(email, { password, userId, email, displayName });
  }

  setMfaToken(userId: string, token: string): void {
    this.mfaTokens.set(userId, token);
  }

  async authenticate(credentials: Record<string, unknown>): Promise<AuthResult> {
    const email = credentials['email'] as string | undefined;
    const password = credentials['password'] as string | undefined;
    if (!email || !password) {
      return { authenticated: false, provider: this.providerName, mfaVerified: false, error: 'Missing email or password' };
    }
    const entry = this.credentials.get(email);
    if (!entry || entry.password !== password) {
      return { authenticated: false, provider: this.providerName, mfaVerified: false, error: 'Invalid credentials' };
    }
    return {
      authenticated: true,
      userId: entry.userId,
      email: entry.email,
      displayName: entry.displayName,
      provider: this.providerName,
      mfaVerified: false,
    };
  }

  async verifyMfa(userId: string, token: string): Promise<boolean> {
    return this.mfaTokens.get(userId) === token;
  }
}

// ---------------------------------------------------------------------------
// Permission denied error
// ---------------------------------------------------------------------------

export class PermissionDeniedError extends Error {
  constructor(
    public readonly userId: string,
    public readonly resource: Resource,
    public readonly action: Action,
  ) {
    super(`User ${userId} lacks permission ${action} on ${resource}`);
    this.name = 'PermissionDeniedError';
  }
}


// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateUserInput {
  email: string;
  displayName: string;
  authProvider?: string;
  externalId?: string;
  mfaEnabled?: boolean;
}

// ---------------------------------------------------------------------------
// RbacService
// ---------------------------------------------------------------------------

export class RbacService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly roleRepo: RoleRepository,
    private readonly userRoleRepo: UserRoleRepository,
    private readonly rolePermissionRepo: RolePermissionRepository,
    private readonly authProvider: AuthProvider,
  ) {}

  // ---- User management ---------------------------------------------------

  async createUser(input: CreateUserInput): Promise<UserRow> {
    return this.userRepo.insert({
      email: input.email,
      display_name: input.displayName,
      auth_provider: input.authProvider ?? this.authProvider.providerName,
      external_id: input.externalId ?? null,
      mfa_enabled: input.mfaEnabled ?? false,
      last_login: null,
    } as Partial<UserRow>);
  }

  async getUser(id: UserId): Promise<UserRow | undefined> {
    return this.userRepo.findById(id);
  }

  // ---- Role management ---------------------------------------------------

  async createRole(name: string, permissions: Permission[]): Promise<RoleRow> {
    const role = await this.roleRepo.insert({ name, description: '' } as Partial<RoleRow>);
    for (const perm of permissions) {
      await this.rolePermissionRepo.insert({
        role_id: role.id,
        resource: perm.resource,
        action: perm.action,
      } as Partial<RolePermissionRow>);
    }
    return role;
  }

  async assignRole(userId: UserId, roleId: RoleId): Promise<void> {
    await this.userRoleRepo.assign(userId, roleId);
  }

  // ---- Permission queries ------------------------------------------------

  async getEffectivePermissions(userId: UserId): Promise<Permission[]> {
    const userRoles = await this.userRoleRepo.findByUserId(userId);
    if (userRoles.length === 0) return [];

    const roleIds = userRoles.map((ur) => ur.role_id);
    const permRows = await this.rolePermissionRepo.findByRoleIds(roleIds);

    // Deduplicate
    const seen = new Set<string>();
    const permissions: Permission[] = [];
    for (const row of permRows) {
      const key = `${row.resource}:${row.action}`;
      if (!seen.has(key)) {
        seen.add(key);
        permissions.push({ resource: row.resource as Resource, action: row.action as Action });
      }
    }
    return permissions;
  }

  async checkPermission(userId: UserId, resource: Resource, action: Action): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(userId);
    return permissions.some((p) => p.resource === resource && p.action === action);
  }

  async enforcePermission(userId: UserId, resource: Resource, action: Action): Promise<void> {
    const allowed = await this.checkPermission(userId, resource, action);
    if (!allowed) {
      throw new PermissionDeniedError(userId, resource, action);
    }
  }

  // ---- Auth integration --------------------------------------------------

  async authenticate(credentials: Record<string, unknown>): Promise<AuthResult> {
    return this.authProvider.authenticate(credentials);
  }

  async verifyMfa(userId: string, token: string): Promise<boolean> {
    return this.authProvider.verifyMfa(userId, token);
  }

  // ---- Built-in role seeding ---------------------------------------------

  async seedBuiltInRoles(): Promise<Record<string, RoleRow>> {
    const result: Record<string, RoleRow> = {};
    for (const [name, permissions] of Object.entries(BUILT_IN_ROLES)) {
      let role = await this.roleRepo.findByName(name);
      if (!role) {
        role = await this.createRole(name, permissions);
      }
      result[name] = role;
    }
    return result;
  }
}
