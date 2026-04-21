/**
 * Approval Workflow Service — routes ICD changes through configurable
 * approval workflows based on signal criticality and user roles.
 *
 * Implements submitChange, approveChange, rejectChange, getChangeRequests
 * per the WorkflowService interface from the design document.
 */

import type {
  UserId,
  ChangeRequestId,
  SignalId,
  Pagination,
  PaginatedResult,
  Criticality,
} from '@connectedflow/shared-types';
import type {
  ChangeRequestRepository,
  ChangeRequestRow,
  ChangeRequestQueryFilter,
} from '../repositories/change-request-repository.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface SignalChange {
  signalId: SignalId;
  changePayload: Record<string, unknown>;
  criticality: Criticality;
}

export interface ChangeRequest {
  id: ChangeRequestId;
  signalId: SignalId;
  submittedBy: UserId;
  approvedBy: UserId | null;
  status: ChangeRequestStatus;
  changePayload: Record<string, unknown>;
  rejectionReason: string | null;
  submittedAt: Date;
  resolvedAt: Date | null;
  requiredRole: 'approver' | 'editor';
}

export interface ChangeRequestFilter {
  status?: ChangeRequestStatus;
  signalId?: SignalId;
  submittedBy?: UserId;
}

// ---------------------------------------------------------------------------
// Role resolver — determines which role is required to approve a change
// ---------------------------------------------------------------------------

export type UserRole = 'viewer' | 'editor' | 'approver' | 'admin';

export interface RoleResolver {
  getUserRoles(userId: UserId): Promise<UserRole[]>;
}

/**
 * Deterministic routing: given the same criticality, always returns the same
 * required role. Critical signals require 'approver'; non-critical require 'editor'.
 */
export function determineRequiredRole(criticality: Criticality): 'approver' | 'editor' {
  return criticality === 'critical' ? 'approver' : 'editor';
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ChangeRequestNotFoundError extends Error {
  constructor(public readonly requestId: string) {
    super(`Change request ${requestId} not found`);
    this.name = 'ChangeRequestNotFoundError';
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(
    public readonly requestId: string,
    public readonly currentStatus: string,
    public readonly targetStatus: string,
  ) {
    super(`Cannot transition change request ${requestId} from '${currentStatus}' to '${targetStatus}'`);
    this.name = 'InvalidStatusTransitionError';
  }
}

export class InsufficientApprovalRoleError extends Error {
  constructor(
    public readonly userId: string,
    public readonly requiredRole: string,
  ) {
    super(`User ${userId} lacks required role '${requiredRole}' to approve this change`);
    this.name = 'InsufficientApprovalRoleError';
  }
}

// ---------------------------------------------------------------------------
// WorkflowService
// ---------------------------------------------------------------------------

export class WorkflowService {
  constructor(
    private readonly changeRequestRepo: ChangeRequestRepository,
    private readonly roleResolver: RoleResolver,
  ) {}

  async submitChange(change: SignalChange, submitter: UserId): Promise<ChangeRequest> {
    const requiredRole = determineRequiredRole(change.criticality);

    const row = await this.changeRequestRepo.insert({
      signal_id: change.signalId,
      submitted_by: submitter,
      status: 'pending',
      change_payload: {
        ...change.changePayload,
        _criticality: change.criticality,
        _requiredRole: requiredRole,
      },
      rejection_reason: null,
      approved_by: null,
      resolved_at: null,
    } as Partial<ChangeRequestRow>);

    return toChangeRequest(row, requiredRole);
  }

  async approveChange(requestId: ChangeRequestId, approver: UserId): Promise<ChangeRequest> {
    const row = await this.changeRequestRepo.findById(requestId);
    if (!row) throw new ChangeRequestNotFoundError(requestId);
    if (row.status !== 'pending') {
      throw new InvalidStatusTransitionError(requestId, row.status, 'approved');
    }

    const requiredRole = extractRequiredRole(row);
    const roles = await this.roleResolver.getUserRoles(approver);

    if (!hasRequiredRole(roles, requiredRole)) {
      throw new InsufficientApprovalRoleError(approver, requiredRole);
    }

    const updated = await this.changeRequestRepo.update(requestId, {
      status: 'approved',
      approved_by: approver,
      resolved_at: new Date(),
    } as Partial<ChangeRequestRow>);

    return toChangeRequest(updated!, requiredRole);
  }

  async rejectChange(
    requestId: ChangeRequestId,
    approver: UserId,
    reason: string,
  ): Promise<ChangeRequest> {
    const row = await this.changeRequestRepo.findById(requestId);
    if (!row) throw new ChangeRequestNotFoundError(requestId);
    if (row.status !== 'pending') {
      throw new InvalidStatusTransitionError(requestId, row.status, 'rejected');
    }

    const requiredRole = extractRequiredRole(row);
    const roles = await this.roleResolver.getUserRoles(approver);

    if (!hasRequiredRole(roles, requiredRole)) {
      throw new InsufficientApprovalRoleError(approver, requiredRole);
    }

    const updated = await this.changeRequestRepo.update(requestId, {
      status: 'rejected',
      approved_by: approver,
      rejection_reason: reason,
      resolved_at: new Date(),
    } as Partial<ChangeRequestRow>);

    return toChangeRequest(updated!, requiredRole);
  }

  async getChangeRequests(
    filter: ChangeRequestFilter,
    pagination: Pagination = { page: 1, pageSize: 20 },
  ): Promise<PaginatedResult<ChangeRequest>> {
    const repoFilter: ChangeRequestQueryFilter = {
      status: filter.status,
      signalId: filter.signalId,
      submittedBy: filter.submittedBy,
    };

    const total = await this.changeRequestRepo.countWithFilter(repoFilter);
    const offset = (pagination.page - 1) * pagination.pageSize;
    const rows = await this.changeRequestRepo.findWithFilter(repoFilter, {
      limit: pagination.pageSize,
      offset,
      orderBy: pagination.sortBy ?? 'submitted_at',
      orderDir: pagination.sortOrder ?? 'desc',
    });

    const data = rows.map((r) => toChangeRequest(r, extractRequiredRole(r)));
    const totalPages = Math.ceil(total / pagination.pageSize);

    return { data, total, page: pagination.page, pageSize: pagination.pageSize, totalPages };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractRequiredRole(row: ChangeRequestRow): 'approver' | 'editor' {
  const payload = row.change_payload as Record<string, unknown>;
  const stored = payload?._requiredRole;
  if (stored === 'approver' || stored === 'editor') return stored;
  // Fallback: derive from criticality stored in payload
  const crit = payload?._criticality as Criticality | undefined;
  return crit ? determineRequiredRole(crit) : 'editor';
}

function hasRequiredRole(userRoles: UserRole[], required: 'approver' | 'editor'): boolean {
  // admin can always approve
  if (userRoles.includes('admin')) return true;
  if (required === 'approver') return userRoles.includes('approver');
  // editor-level approval: editor, approver, or admin
  return userRoles.includes('editor') || userRoles.includes('approver');
}

function toChangeRequest(row: ChangeRequestRow, requiredRole: 'approver' | 'editor'): ChangeRequest {
  return {
    id: row.id as ChangeRequestId,
    signalId: row.signal_id as SignalId,
    submittedBy: row.submitted_by as UserId,
    approvedBy: row.approved_by ? (row.approved_by as UserId) : null,
    status: row.status as ChangeRequestStatus,
    changePayload: row.change_payload,
    rejectionReason: row.rejection_reason,
    submittedAt: row.submitted_at,
    resolvedAt: row.resolved_at,
    requiredRole,
  };
}
