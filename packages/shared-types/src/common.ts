// Common utility types used across the platform.

/** Structured error response returned by all API endpoints. */
export interface ErrorResponse {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  details?: ErrorDetail[];
  correlationId: string;
}

export interface ErrorDetail {
  field?: string;
  constraint?: string;
  suggestion?: string;
}

/** Result of a validation operation with field-level errors. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  constraint?: string;
  severity: 'error' | 'warning' | 'info';
}

/** Pagination parameters for list queries. */
export interface Pagination {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Paginated result wrapper. */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
