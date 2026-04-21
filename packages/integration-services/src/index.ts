// @connectedflow/integration-services
// Hardware Adapter Manager, Traceability & Export services.

export { HardwareAdapterManager } from './services/hardware-adapter-manager.js';
export { SimulatedAdapterDriver } from './services/simulated-adapter-driver.js';
export type {
  AdapterInfo,
  AdapterConfig,
  AdapterConnection,
  AdapterStatus,
  AdapterDriver,
} from './services/hardware-adapter-types.js';

export {
  LiveDataMonitor,
  BusDataDecoder,
  DeviationDetector,
} from './services/live-data-monitor.js';
export type {
  LiveDataEvent,
  DecodedParameter,
  ParameterDeviation,
  IcdSignalDefinition,
  LiveDataWriter,
  MonitorSession,
} from './services/live-data-monitor.js';

export { StimulusGenerator } from './services/stimulus-generator.js';
export type {
  StimulusConfig,
  SimSession,
} from './services/stimulus-generator.js';

export { SessionRecorder } from './services/session-recorder.js';
export type {
  SessionRecorderDb,
  RecordedReading,
  SessionSummary,
  TimeRange,
} from './services/session-recorder.js';

export { TraceabilityService } from './services/traceability-service.js';
export type {
  TraceLinkDb,
  TraceLink,
  RequirementRef,
  ReqToolConfig,
  ReqChange,
  SyncResult,
  RequirementTool,
  LinkStatus,
  StaleNotificationCallback,
  ExternalRequirementFetcher,
} from './services/traceability-service.js';

export { ExportEngine } from './services/export-engine.js';
export type {
  TestBenchFormat,
  HarnessFormat,
  CertStandard,
  ExportFile,
  ExportSignalData,
  CertPackageInput,
} from './services/export-engine.js';
