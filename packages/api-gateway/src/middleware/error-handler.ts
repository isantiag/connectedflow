/**
 * Error handler middleware — maps errors to structured ErrorResponse
 * with correlation IDs for log tracing.
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import type { ErrorResponse } from '@connectedflow/shared-types';

/**
 * Map known error names to HTTP status codes and error codes.
 */
const ERROR_MAP: Record<string, { status: number; code: string }> = {
  PermissionDeniedError: { status: 403, code: 'PERMISSION_DENIED' },
  ChangeRequestNotFoundError: { status: 404, code: 'NOT_FOUND' },
  InvalidStatusTransitionError: { status: 409, code: 'INVALID_STATUS_TRANSITION' },
  InsufficientApprovalRoleError: { status: 403, code: 'INSUFFICIENT_ROLE' },
  ConcurrentEditError: { status: 409, code: 'CONCURRENT_EDIT_CONFLICT' },
};

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const correlationId = (request.headers['x-correlation-id'] as string) ?? request.id;

  const mapped = ERROR_MAP[error.name];

  const body: ErrorResponse = {
    code: mapped?.code ?? 'INTERNAL_ERROR',
    message: error.message,
    severity: 'error',
    correlationId,
  };

  const statusCode = mapped?.status ?? ('statusCode' in error ? (error as FastifyError).statusCode ?? 500 : 500);

  // Attach validation details if present
  if ('validation' in error && (error as FastifyError).validation) {
    body.details = (error as FastifyError).validation!.map((v) => ({
      field: v.instancePath ?? undefined,
      constraint: v.keyword ?? undefined,
      suggestion: v.message ?? undefined,
    }));
    body.code = 'VALIDATION_ERROR';
  }

  void reply.status(statusCode).send(body);
}
