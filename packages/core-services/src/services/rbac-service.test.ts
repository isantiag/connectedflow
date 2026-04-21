/**
 * Unit tests for RbacService.
 *
 * Uses in-memory stores to validate RBAC logic without a live database.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RbacService,
  LocalAuthProvider,
  PermissionDeniedError,
  BUILT_IN_ROLES,
  type Permission,
  type Resource,
  type Action,
} from './rbac-service.js';
import type { UserRepository, UserRow } from '../repositories/user-repository.js';
import type { RoleRepository, RoleRow } from '../repositories/role-repository.js';
import type { UserRoleRepository, UserRoleRow } from '../repositories/user-role-repository.js';
import type { RolePermissionRepository, RolePermissionRow } from '../repositories/role-permission-repository.js';
import type { UserId, RoleId } from '@connectedicd/shared-types';

// ---------------------------------------------------------------------------
// In-memory repository fakes
// ---------------------------------------------------------------------------

function createFakeUserRepo(): UserRepository {
  const rows: UserRow[] = [];
  let counter = 0;
  return {
    insert: async (data: Partial<UserRow>) => {
      const row: UserRow = {
        id: `user-${++counter}`,
        email: data.email ?? '',
        display_name: data.display_name ?? '',
        auth_provider: data.auth_provider ?? 'local',
        external_id: data.external_id ?? null,
        mfa_enabled: data.mfa_enabled ?? false,
        last_login: null,
        created_at: new Date(),
      };
      rows.push(row);
      return row;
    },
    findById: async (id: string) => rows.find((r) => r.id === id),
    findByEmail: async (email: string) => rows.find((r) => r.email === email),
  } as unknown as UserRepository;
}

function createFakeRoleRepo(): RoleRepository {
  const rows: RoleRow[] = [];
  let counter = 0;
  return {
    insert: async (data: Partial<RoleRow>) => {
      const row: RoleRow = {
        id: `role-${++counter}`,
        name: data.name ?? '',
        description: data.description ?? '',
      };
      rows.push(row);
      return row;
    },
    findById: async (id: string) => rows.find((r) => r.id === id),
    findByName: async (name: string) => rows.find((r) => r.name === name),
  } as unknown as RoleRepository;
}

function createFakeUserRoleRepo(): UserRoleRepository {
  const rows: UserRoleRow[] = [];
  return {
    assign: async (userId: string, roleId: string) => {
      if (!rows.some((r) => r.user_id === userId && r.role_id === roleId)) {
        rows.push({ user_id: userId, role_id: roleId });
      }
    },
    unassign: async (userId: string, roleId: string) => {
      const idx = rows.findIndex((r) => r.user_id === userId && r.role_id === roleId);
      if (idx >= 0) { rows.splice(idx, 1); return true; }
      return false;
    },
    findByUserId: async (userId: string) => rows.filter((r) => r.user_id === userId),
  } as unknown as UserRoleRepository;
}

function createFakeRolePermissionRepo(): RolePermissionRepository {
  const rows: RolePermissionRow[] = [];
  let counter = 0;
  return {
    insert: async (data: Partial<RolePermissionRow>) => {
      const row: RolePermissionRow = {
        id: `perm-${++counter}`,
        role_id: data.role_id ?? '',
        resource: data.resource ?? '',
        action: data.action ?? '',
      };
      rows.push(row);
      return row;
    },
    findByRoleId: async (roleId: string) => rows.filter((r) => r.role_id === roleId),
    findByRoleIds: async (roleIds: string[]) => rows.filter((r) => roleIds.includes(r.role_id)),
  } as unknown as RolePermissionRepository;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RbacService', () => {
  let service: RbacService;
  let authProvider: LocalAuthProvider;

  beforeEach(() => {
    authProvider = new LocalAuthProvider();
    service = new RbacService(
      createFakeUserRepo(),
      createFakeRoleRepo(),
      createFakeUserRoleRepo(),
      createFakeRolePermissionRepo(),
      authProvider,
    );
  });

  describe('user management', () => {
    it('creates and retrieves a user', async () => {
      const user = await service.createUser({ email: 'a@b.com', displayName: 'Alice' });
      expect(user.email).toBe('a@b.com');
      expect(user.display_name).toBe('Alice');
      expect(user.auth_provider).toBe('local');

      const fetched = await service.getUser(user.id as UserId);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(user.id);
    });
  });

  describe('role management', () => {
    it('creates a role with permissions', async () => {
      const perms: Permission[] = [
        { resource: 'signal', action: 'read' },
        { resource: 'signal', action: 'write' },
      ];
      const role = await service.createRole('custom', perms);
      expect(role.name).toBe('custom');
    });

    it('assigns a role to a user and resolves effective permissions', async () => {
      const user = await service.createUser({ email: 'b@c.com', displayName: 'Bob' });
      const role = await service.createRole('reader', [
        { resource: 'signal', action: 'read' },
        { resource: 'baseline', action: 'read' },
      ]);
      await service.assignRole(user.id as UserId, role.id as RoleId);

      const perms = await service.getEffectivePermissions(user.id as UserId);
      expect(perms).toHaveLength(2);
      expect(perms).toEqual(
        expect.arrayContaining([
          { resource: 'signal', action: 'read' },
          { resource: 'baseline', action: 'read' },
        ]),
      );
    });
  });

  describe('permission enforcement', () => {
    it('checkPermission returns true when user has the permission', async () => {
      const user = await service.createUser({ email: 'c@d.com', displayName: 'Carol' });
      const role = await service.createRole('writer', [
        { resource: 'signal', action: 'read' },
        { resource: 'signal', action: 'write' },
      ]);
      await service.assignRole(user.id as UserId, role.id as RoleId);

      expect(await service.checkPermission(user.id as UserId, 'signal', 'write')).toBe(true);
    });

    it('checkPermission returns false when user lacks the permission', async () => {
      const user = await service.createUser({ email: 'd@e.com', displayName: 'Dave' });
      const role = await service.createRole('readonly', [
        { resource: 'signal', action: 'read' },
      ]);
      await service.assignRole(user.id as UserId, role.id as RoleId);

      expect(await service.checkPermission(user.id as UserId, 'signal', 'write')).toBe(false);
    });

    it('enforcePermission throws PermissionDeniedError when denied', async () => {
      const user = await service.createUser({ email: 'e@f.com', displayName: 'Eve' });
      // No roles assigned
      await expect(
        service.enforcePermission(user.id as UserId, 'signal', 'read'),
      ).rejects.toThrow(PermissionDeniedError);
    });

    it('enforcePermission does not throw when allowed', async () => {
      const user = await service.createUser({ email: 'f@g.com', displayName: 'Frank' });
      const role = await service.createRole('full', [
        { resource: 'signal', action: 'read' },
      ]);
      await service.assignRole(user.id as UserId, role.id as RoleId);

      await expect(
        service.enforcePermission(user.id as UserId, 'signal', 'read'),
      ).resolves.toBeUndefined();
    });

    it('viewer is denied write operations', async () => {
      const user = await service.createUser({ email: 'viewer@test.com', displayName: 'Viewer' });
      const roles = await service.seedBuiltInRoles();
      await service.assignRole(user.id as UserId, roles['viewer'].id as RoleId);

      expect(await service.checkPermission(user.id as UserId, 'signal', 'read')).toBe(true);
      expect(await service.checkPermission(user.id as UserId, 'signal', 'write')).toBe(false);
      expect(await service.checkPermission(user.id as UserId, 'signal', 'delete')).toBe(false);
      expect(await service.checkPermission(user.id as UserId, 'signal', 'approve')).toBe(false);
    });

    it('editor is denied approval operations', async () => {
      const user = await service.createUser({ email: 'editor@test.com', displayName: 'Editor' });
      const roles = await service.seedBuiltInRoles();
      await service.assignRole(user.id as UserId, roles['editor'].id as RoleId);

      expect(await service.checkPermission(user.id as UserId, 'signal', 'read')).toBe(true);
      expect(await service.checkPermission(user.id as UserId, 'signal', 'write')).toBe(true);
      expect(await service.checkPermission(user.id as UserId, 'signal', 'approve')).toBe(false);
      expect(await service.checkPermission(user.id as UserId, 'signal', 'delete')).toBe(false);
    });

    it('approver has read, write, and approve but not delete', async () => {
      const user = await service.createUser({ email: 'approver@test.com', displayName: 'Approver' });
      const roles = await service.seedBuiltInRoles();
      await service.assignRole(user.id as UserId, roles['approver'].id as RoleId);

      expect(await service.checkPermission(user.id as UserId, 'signal', 'read')).toBe(true);
      expect(await service.checkPermission(user.id as UserId, 'signal', 'write')).toBe(true);
      expect(await service.checkPermission(user.id as UserId, 'signal', 'approve')).toBe(true);
      expect(await service.checkPermission(user.id as UserId, 'signal', 'delete')).toBe(false);
    });

    it('admin has all permissions on all resources', async () => {
      const user = await service.createUser({ email: 'admin@test.com', displayName: 'Admin' });
      const roles = await service.seedBuiltInRoles();
      await service.assignRole(user.id as UserId, roles['admin'].id as RoleId);

      const resources: Resource[] = ['signal', 'baseline', 'change_request', 'project'];
      const actions: Action[] = ['read', 'write', 'delete', 'approve'];
      for (const resource of resources) {
        for (const action of actions) {
          expect(await service.checkPermission(user.id as UserId, resource, action)).toBe(true);
        }
      }
    });
  });

  describe('built-in roles', () => {
    it('seedBuiltInRoles creates all four roles', async () => {
      const roles = await service.seedBuiltInRoles();
      expect(Object.keys(roles)).toEqual(expect.arrayContaining(['viewer', 'editor', 'approver', 'admin']));
    });

    it('seedBuiltInRoles is idempotent', async () => {
      const first = await service.seedBuiltInRoles();
      const second = await service.seedBuiltInRoles();
      expect(first['viewer'].id).toBe(second['viewer'].id);
    });

    it('BUILT_IN_ROLES viewer has only read permissions', () => {
      const viewerPerms = BUILT_IN_ROLES['viewer'];
      expect(viewerPerms.every((p) => p.action === 'read')).toBe(true);
      expect(viewerPerms).toHaveLength(4); // one per resource
    });

    it('BUILT_IN_ROLES editor has read+write but no approve/delete', () => {
      const editorPerms = BUILT_IN_ROLES['editor'];
      expect(editorPerms.every((p) => p.action === 'read' || p.action === 'write')).toBe(true);
      expect(editorPerms.some((p) => p.action === 'approve')).toBe(false);
      expect(editorPerms.some((p) => p.action === 'delete')).toBe(false);
    });
  });

  describe('effective permissions deduplication', () => {
    it('deduplicates permissions from multiple roles', async () => {
      const user = await service.createUser({ email: 'multi@test.com', displayName: 'Multi' });
      const role1 = await service.createRole('r1', [
        { resource: 'signal', action: 'read' },
        { resource: 'signal', action: 'write' },
      ]);
      const role2 = await service.createRole('r2', [
        { resource: 'signal', action: 'read' },
        { resource: 'baseline', action: 'read' },
      ]);
      await service.assignRole(user.id as UserId, role1.id as RoleId);
      await service.assignRole(user.id as UserId, role2.id as RoleId);

      const perms = await service.getEffectivePermissions(user.id as UserId);
      // signal:read should appear only once
      const signalReads = perms.filter((p) => p.resource === 'signal' && p.action === 'read');
      expect(signalReads).toHaveLength(1);
      expect(perms).toHaveLength(3); // signal:read, signal:write, baseline:read
    });
  });

  describe('LocalAuthProvider', () => {
    it('authenticates with valid credentials', async () => {
      authProvider.register('u1', 'test@test.com', 'Test', 'pass123');
      const result = await service.authenticate({ email: 'test@test.com', password: 'pass123' });
      expect(result.authenticated).toBe(true);
      expect(result.userId).toBe('u1');
      expect(result.provider).toBe('local');
    });

    it('rejects invalid credentials', async () => {
      authProvider.register('u1', 'test@test.com', 'Test', 'pass123');
      const result = await service.authenticate({ email: 'test@test.com', password: 'wrong' });
      expect(result.authenticated).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rejects missing credentials', async () => {
      const result = await service.authenticate({});
      expect(result.authenticated).toBe(false);
    });

    it('verifies MFA token', async () => {
      authProvider.setMfaToken('u1', '123456');
      expect(await service.verifyMfa('u1', '123456')).toBe(true);
      expect(await service.verifyMfa('u1', '000000')).toBe(false);
    });
  });
});
