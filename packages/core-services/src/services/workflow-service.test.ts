/**
 * Unit tests for WorkflowService.
 *
 * Uses in-memory fakes to validate approval workflow logic without a live database.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WorkflowService,
  determineRequiredRole,
  ChangeRequestNotFoundError,
  InvalidStatusTransitionError,
  InsufficientApprovalRoleError,
  type SignalChange,
  type RoleResolver,
  type UserRole,
} from './workflow-service.js';
import type {
  ChangeRequestRepository,
  ChangeRequestRow,
  ChangeRequestQueryFilter,
} from '../repositories/change-request-repository.js';
import type { SignalId, UserId, ChangeRequestId } from '@connectedicd/shared-types';

// ---------------------------------------------------------------------------
// In-memory fakes
// ---------------------------------------------------------------------------

function createFakeChangeRequestRepo(): ChangeRequestRepository {
  const rows: ChangeRequestRow[] = [];
  let counter = 0;

  return {
    insert: async (data: Partial<ChangeRequestRow>) => {
      const row: ChangeRequestRow = {
        id: `cr-${++counter}`,
        signal_id: data.signal_id ?? '',
        submitted_by: data.submitted_by ?? '',
        approved_by: data.approved_by ?? null,
        status: data.status ?? 'pending',
        change_payload: data.change_payload ?? {},
        rejection_reason: data.rejection_reason ?? null,
        submitted_at: new Date(),
        resolved_at: data.resolved_at ?? null,
      };
      rows.push(row);
      return row;
    },
    findById: async (id: string) => rows.find((r) => r.id === id),
    update: async (id: string, data: Partial<ChangeRequestRow>) => {
      const row = rows.find((r) => r.id === id);
      if (!row) return undefined;
      Object.assign(row, data);
      return row;
    },
    countWithFilter: async (filter: ChangeRequestQueryFilter) => {
      return filterRows(rows, filter).length;
    },
    findWithFilter: async (
      filter: ChangeRequestQueryFilter,
      opts: { limit: number; offset: number },
    ) => {
      const filtered = filterRows(rows, filter);
      return filtered.slice(opts.offset, opts.offset + opts.limit);
    },
  } as unknown as ChangeRequestRepository;
}

function filterRows(rows: ChangeRequestRow[], filter: ChangeRequestQueryFilter): ChangeRequestRow[] {
  return rows.filter((r) => {
    if (filter.status && r.status !== filter.status) return false;
    if (filter.signalId && r.signal_id !== filter.signalId) return false;
    if (filter.submittedBy && r.submitted_by !== filter.submittedBy) return false;
    return true;
  });
}

function createFakeRoleResolver(roleMap: Record<string, UserRole[]>): RoleResolver {
  return {
    getUserRoles: async (userId: UserId) => roleMap[userId] ?? [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const signalId = 'sig-1' as SignalId;
const submitter = 'user-submitter' as UserId;
const approverUser = 'user-approver' as UserId;
const editorUser = 'user-editor' as UserId;
const viewerUser = 'user-viewer' as UserId;
const adminUser = 'user-admin' as UserId;

function makeCriticalChange(): SignalChange {
  return { signalId, changePayload: { field: 'value' }, criticality: 'critical' };
}

function makeMinorChange(): SignalChange {
  return { signalId, changePayload: { field: 'value' }, criticality: 'minor' };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowService', () => {
  let service: WorkflowService;
  let repo: ChangeRequestRepository;

  const roleMap: Record<string, UserRole[]> = {
    [approverUser]: ['approver'],
    [editorUser]: ['editor'],
    [viewerUser]: ['viewer'],
    [adminUser]: ['admin'],
  };

  beforeEach(() => {
    repo = createFakeChangeRequestRepo();
    service = new WorkflowService(repo, createFakeRoleResolver(roleMap));
  });

  describe('determineRequiredRole', () => {
    it('returns approver for critical criticality', () => {
      expect(determineRequiredRole('critical')).toBe('approver');
    });

    it('returns editor for major criticality', () => {
      expect(determineRequiredRole('major')).toBe('editor');
    });

    it('returns editor for minor criticality', () => {
      expect(determineRequiredRole('minor')).toBe('editor');
    });

    it('returns editor for info criticality', () => {
      expect(determineRequiredRole('info')).toBe('editor');
    });

    it('is deterministic — same input always gives same output', () => {
      const results = Array.from({ length: 10 }, () => determineRequiredRole('critical'));
      expect(new Set(results).size).toBe(1);
    });
  });

  describe('submitChange', () => {
    it('creates a pending change request', async () => {
      const cr = await service.submitChange(makeCriticalChange(), submitter);
      expect(cr.status).toBe('pending');
      expect(cr.submittedBy).toBe(submitter);
      expect(cr.signalId).toBe(signalId);
      expect(cr.approvedBy).toBeNull();
      expect(cr.resolvedAt).toBeNull();
    });

    it('routes critical signals to approver role', async () => {
      const cr = await service.submitChange(makeCriticalChange(), submitter);
      expect(cr.requiredRole).toBe('approver');
    });

    it('routes non-critical signals to editor role', async () => {
      const cr = await service.submitChange(makeMinorChange(), submitter);
      expect(cr.requiredRole).toBe('editor');
    });
  });

  describe('approveChange', () => {
    it('approves a pending request when user has required role', async () => {
      const cr = await service.submitChange(makeCriticalChange(), submitter);
      const approved = await service.approveChange(cr.id, approverUser);
      expect(approved.status).toBe('approved');
      expect(approved.approvedBy).toBe(approverUser);
      expect(approved.resolvedAt).not.toBeNull();
    });

    it('allows admin to approve any change', async () => {
      const cr = await service.submitChange(makeCriticalChange(), submitter);
      const approved = await service.approveChange(cr.id, adminUser);
      expect(approved.status).toBe('approved');
    });

    it('allows editor to approve non-critical changes', async () => {
      const cr = await service.submitChange(makeMinorChange(), submitter);
      const approved = await service.approveChange(cr.id, editorUser);
      expect(approved.status).toBe('approved');
    });

    it('rejects editor approving critical changes', async () => {
      const cr = await service.submitChange(makeCriticalChange(), submitter);
      await expect(
        service.approveChange(cr.id, editorUser),
      ).rejects.toThrow(InsufficientApprovalRoleError);
    });

    it('rejects viewer approving any change', async () => {
      const cr = await service.submitChange(makeMinorChange(), submitter);
      await expect(
        service.approveChange(cr.id, viewerUser),
      ).rejects.toThrow(InsufficientApprovalRoleError);
    });

    it('throws ChangeRequestNotFoundError for unknown ID', async () => {
      await expect(
        service.approveChange('nonexistent' as ChangeRequestId, approverUser),
      ).rejects.toThrow(ChangeRequestNotFoundError);
    });

    it('throws InvalidStatusTransitionError for already approved request', async () => {
      const cr = await service.submitChange(makeCriticalChange(), submitter);
      await service.approveChange(cr.id, approverUser);
      await expect(
        service.approveChange(cr.id, approverUser),
      ).rejects.toThrow(InvalidStatusTransitionError);
    });
  });

  describe('rejectChange', () => {
    it('rejects a pending request with a reason', async () => {
      const cr = await service.submitChange(makeCriticalChange(), submitter);
      const rejected = await service.rejectChange(cr.id, approverUser, 'Not needed');
      expect(rejected.status).toBe('rejected');
      expect(rejected.rejectionReason).toBe('Not needed');
      expect(rejected.approvedBy).toBe(approverUser);
      expect(rejected.resolvedAt).not.toBeNull();
    });

    it('rejects viewer from rejecting changes', async () => {
      const cr = await service.submitChange(makeMinorChange(), submitter);
      await expect(
        service.rejectChange(cr.id, viewerUser, 'No'),
      ).rejects.toThrow(InsufficientApprovalRoleError);
    });

    it('throws for already rejected request', async () => {
      const cr = await service.submitChange(makeCriticalChange(), submitter);
      await service.rejectChange(cr.id, approverUser, 'Reason');
      await expect(
        service.rejectChange(cr.id, approverUser, 'Again'),
      ).rejects.toThrow(InvalidStatusTransitionError);
    });
  });

  describe('getChangeRequests', () => {
    it('returns paginated results', async () => {
      await service.submitChange(makeCriticalChange(), submitter);
      await service.submitChange(makeMinorChange(), submitter);
      await service.submitChange(makeCriticalChange(), submitter);

      const result = await service.getChangeRequests({}, { page: 1, pageSize: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.totalPages).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(2);
    });

    it('filters by status', async () => {
      const cr = await service.submitChange(makeCriticalChange(), submitter);
      await service.submitChange(makeMinorChange(), submitter);
      await service.approveChange(cr.id, approverUser);

      const result = await service.getChangeRequests({ status: 'approved' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('approved');
    });

    it('filters by signalId', async () => {
      await service.submitChange(makeCriticalChange(), submitter);
      await service.submitChange(
        { signalId: 'sig-other' as SignalId, changePayload: {}, criticality: 'minor' },
        submitter,
      );

      const result = await service.getChangeRequests({ signalId });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].signalId).toBe(signalId);
    });

    it('filters by submitter', async () => {
      await service.submitChange(makeCriticalChange(), submitter);
      await service.submitChange(makeCriticalChange(), 'other-user' as UserId);

      const result = await service.getChangeRequests({ submittedBy: submitter });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].submittedBy).toBe(submitter);
    });

    it('returns empty result when no matches', async () => {
      const result = await service.getChangeRequests({ status: 'approved' });
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
