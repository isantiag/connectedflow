export {
  SignalService,
  type CreateSignalInput,
  type SignalPatch,
  type SignalFilter,
  type DeleteResult,
  type FieldMapping,
  type BulkImportResult,
  type BulkImportRecordError,
} from './signal-service.js';

export { CrossLayerValidator } from './cross-layer-validator.js';

export { ConcurrentEditError, suggestMerge, type MergeSuggestion } from './concurrent-edit-error.js';

export { ProtocolValidationService } from './protocol-validation-service.js';
export type { ProtocolPlugin, JSONSchema, FieldSchemaEntry, MigrationResult } from './protocols/index.js';
export { Arinc429Plugin } from './protocols/arinc429-plugin.js';
export { CanBusPlugin } from './protocols/canbus-plugin.js';
export { MilStd1553Plugin } from './protocols/milstd1553-plugin.js';
export { Arinc664Plugin } from './protocols/arinc664-plugin.js';

export { BusLoadingAnalyzer } from './bus-loading-analyzer.js';
export type { BusUtilizationReport, SignalBandwidthContribution } from './bus-loading-analyzer.js';

export { BaselineService } from './baseline-service.js';
export type {
  CreateBaselineInput,
  Baseline,
  BaselineFilter,
  BaselineSnapshot,
  BaselineStatus,
  SnapshotProgress,
  BaselineDiff,
  SignalDiffEntry,
  DiffSummary,
  RevertResult,
  AuditWriter,
  AuditEntry,
  CertStandard,
  CertExportPackage,
  TraceProvider,
  TraceabilityMatrixEntry,
  TraceLink,
} from './baseline-service.js';

export { RbacService, LocalAuthProvider, PermissionDeniedError, BUILT_IN_ROLES } from './rbac-service.js';
export type {
  Resource,
  Action,
  Permission,
  AuthProvider,
  AuthResult,
  CreateUserInput,
} from './rbac-service.js';

export {
  WorkflowService,
  determineRequiredRole,
  ChangeRequestNotFoundError,
  InvalidStatusTransitionError,
  InsufficientApprovalRoleError,
} from './workflow-service.js';
export type {
  SignalChange,
  ChangeRequest,
  ChangeRequestFilter,
  ChangeRequestStatus,
  RoleResolver,
  UserRole,
} from './workflow-service.js';

export { AuditService } from './audit-service.js';
export type { AuditFilter, AuditEntryDomain } from './audit-service.js';

export { WiringDiagramEngine } from './wiring-diagram-engine.js';
export type {
  WiringDiagram,
  DiagramNode,
  DiagramEdge,
  DiagramMetadata,
  DiagramViewConfig,
  PinSlot,
  PhysicalChange,
  DiagramSignalInput,
} from './wiring-diagram-engine.js';

export { StartupValidator, CircuitBreaker, RetryWithBackoff } from './startup-validator.js';
export type {
  ServiceStatus,
  OverallStatus,
  ServiceCheckResult,
  StartupReport,
  ServiceChecker,
  CircuitState,
  CircuitBreakerOptions,
  RetryOptions,
} from './startup-validator.js';

export { SystemHierarchyService } from './system-hierarchy-service.js';
export type {
  SystemRow,
  CreateSystemInput,
  UpdateSystemInput,
  SystemFilter,
  BudgetRollup,
  PowerModeRollup,
} from './system-hierarchy-service.js';
