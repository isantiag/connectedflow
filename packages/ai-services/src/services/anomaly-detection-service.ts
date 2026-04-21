/**
 * Anomaly Detection Service — detects, classifies, and suggests remediations
 * for ICD signal anomalies.
 *
 * Leverages the CrossLayerValidator from core-services for consistency checks
 * and adds higher-level conflict pattern detection:
 *   - Bus overload: bus utilization exceeds 100%
 *   - Range overlap: logical range exceeds transport encoding capacity
 *   - Encoding mismatch: transport encoding incompatible with logical data type
 *   - Wire gauge incompatibility: physical wire gauge can't support protocol data rate
 *   - Timing mismatch: logical refresh rate exceeds transport timing capability
 */

import { CrossLayerValidator } from '@connectedflow/core-services';
import type {
  Signal,
  SignalId,
  AnomalyId,
  ValidationError,
} from '@connectedflow/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Describes a change to a signal that should be analyzed for anomalies. */
export interface SignalChange {
  signalId: SignalId;
  before?: Signal;
  after: Signal;
}

/** Raw anomaly before classification. */
export interface RawAnomaly {
  affectedSignals: SignalId[];
  description: string;
  source: AnomalySource;
  rawDetail?: Record<string, unknown>;
}

export type AnomalySource =
  | 'cross_layer_validation'
  | 'bus_loading'
  | 'pattern_detection';

export type AnomalyCategory =
  | 'bus_overload'
  | 'range_overlap'
  | 'encoding_mismatch'
  | 'wire_gauge_incompatibility'
  | 'timing_mismatch'
  | 'bit_layout_overflow'
  | 'unknown';

export type AnomalySeverity = 'error' | 'warning' | 'info';

/** Classified anomaly with severity and category. */
export interface ClassifiedAnomaly {
  id: AnomalyId;
  severity: AnomalySeverity;
  category: AnomalyCategory;
  affectedSignals: SignalId[];
  description: string;
  suggestions: RemediationSuggestion[];
}

/** Actionable remediation suggestion. */
export interface RemediationSuggestion {
  action: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

/** Report returned by analyzeChange and runBulkScan. */
export interface AnomalyReport {
  anomalies: ClassifiedAnomaly[];
  scannedSignals: number;
  timestamp: Date;
}

/**
 * Abstraction for fetching signals by ID.
 * In production this calls SignalService; for testing it can be a simple lookup.
 */
export interface SignalProvider {
  getSignal(id: SignalId): Promise<Signal | undefined>;
}

/**
 * Abstraction for fetching bus utilization.
 * In production this calls BusLoadingAnalyzer; for testing it can be stubbed.
 */
export interface BusUtilizationProvider {
  getUtilization(busId: string): Promise<{ utilizationPercent: number; usedBandwidthBps: number; totalBandwidthBps: number }>;
}

// ---------------------------------------------------------------------------
// Constants — constraint-to-category mapping
// ---------------------------------------------------------------------------

const CONSTRAINT_CATEGORY_MAP: Record<string, AnomalyCategory> = {
  logical_range_within_transport_capacity: 'range_overlap',
  wire_gauge_supports_data_rate: 'wire_gauge_incompatibility',
  bit_layout_within_protocol_word: 'bit_layout_overflow',
  refresh_rate_within_transport_timing: 'timing_mismatch',
};

const FIELD_CATEGORY_MAP: Record<string, AnomalyCategory> = {
  'logical.minValue': 'range_overlap',
  'logical.maxValue': 'range_overlap',
  'physical.wireGauge': 'wire_gauge_incompatibility',
  'transport.bitOffset': 'bit_layout_overflow',
  'logical.refreshRateHz': 'timing_mismatch',
};

/**
 * Encoding types that are incompatible with certain logical data types.
 * BCD cannot represent floating-point or signed values.
 */
const ENCODING_DATA_TYPE_INCOMPATIBLE: Record<string, string[]> = {
  bcd: ['float', 'float32', 'float64', 'double', 'signed_int', 'int'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let anomalyCounter = 0;

function generateAnomalyId(): AnomalyId {
  anomalyCounter++;
  return `anomaly-${Date.now()}-${anomalyCounter}` as AnomalyId;
}

/** Reset counter (useful for tests). */
export function _resetAnomalyCounter(): void {
  anomalyCounter = 0;
}

function categorizeFromValidationError(err: ValidationError): AnomalyCategory {
  if (err.constraint && CONSTRAINT_CATEGORY_MAP[err.constraint]) {
    return CONSTRAINT_CATEGORY_MAP[err.constraint];
  }
  if (err.field && FIELD_CATEGORY_MAP[err.field]) {
    return FIELD_CATEGORY_MAP[err.field];
  }
  return 'unknown';
}

function severityFromValidationError(err: ValidationError): AnomalySeverity {
  return err.severity ?? 'error';
}

// ---------------------------------------------------------------------------
// AnomalyDetectionService
// ---------------------------------------------------------------------------

export class AnomalyDetectionService {
  private readonly crossLayerValidator: CrossLayerValidator;
  private readonly signalProvider?: SignalProvider;
  private readonly busUtilizationProvider?: BusUtilizationProvider;

  constructor(deps?: {
    signalProvider?: SignalProvider;
    busUtilizationProvider?: BusUtilizationProvider;
  }) {
    this.crossLayerValidator = new CrossLayerValidator();
    this.signalProvider = deps?.signalProvider;
    this.busUtilizationProvider = deps?.busUtilizationProvider;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Analyze a single signal change for anomalies.
   */
  async analyzeChange(change: SignalChange): Promise<AnomalyReport> {
    const anomalies: ClassifiedAnomaly[] = [];
    const signal = change.after;

    // 1. Cross-layer validation
    const validationResult = this.crossLayerValidator.validate(signal);
    for (const err of validationResult.errors) {
      const raw: RawAnomaly = {
        affectedSignals: [signal.id],
        description: err.message,
        source: 'cross_layer_validation',
        rawDetail: { field: err.field, constraint: err.constraint },
      };
      const classified = this.classifyAnomaly(raw);
      anomalies.push(classified);
    }

    // 2. Encoding mismatch detection
    const encodingAnomalies = this.detectEncodingMismatch(signal);
    anomalies.push(...encodingAnomalies);

    // 3. Bus overload detection (if provider available)
    if (this.busUtilizationProvider && signal.transport?.busId) {
      const busAnomalies = await this.detectBusOverload(
        signal.transport.busId,
        [signal.id],
      );
      anomalies.push(...busAnomalies);
    }

    return {
      anomalies,
      scannedSignals: 1,
      timestamp: new Date(),
    };
  }

  /**
   * Scan multiple signals for anomalies.
   */
  async runBulkScan(signalIds: SignalId[]): Promise<AnomalyReport> {
    const anomalies: ClassifiedAnomaly[] = [];
    const seenBusIds = new Set<string>();
    let scannedCount = 0;

    for (const signalId of signalIds) {
      const signal = await this.signalProvider?.getSignal(signalId);
      if (!signal) continue;

      scannedCount++;

      // Cross-layer validation
      const validationResult = this.crossLayerValidator.validate(signal);
      for (const err of validationResult.errors) {
        const raw: RawAnomaly = {
          affectedSignals: [signal.id],
          description: err.message,
          source: 'cross_layer_validation',
          rawDetail: { field: err.field, constraint: err.constraint },
        };
        anomalies.push(this.classifyAnomaly(raw));
      }

      // Encoding mismatch
      anomalies.push(...this.detectEncodingMismatch(signal));

      // Track bus IDs for overload check
      if (signal.transport?.busId) {
        seenBusIds.add(signal.transport.busId);
      }
    }

    // Bus overload checks (once per bus)
    if (this.busUtilizationProvider) {
      for (const busId of seenBusIds) {
        const busAnomalies = await this.detectBusOverload(
          busId,
          signalIds,
        );
        anomalies.push(...busAnomalies);
      }
    }

    return {
      anomalies,
      scannedSignals: scannedCount,
      timestamp: new Date(),
    };
  }

  /**
   * Classify a raw anomaly with severity, category, and suggestions.
   */
  classifyAnomaly(raw: RawAnomaly): ClassifiedAnomaly {
    const category = this.inferCategory(raw);
    const severity = this.inferSeverity(category, raw);
    const id = generateAnomalyId();

    const classified: ClassifiedAnomaly = {
      id,
      severity,
      category,
      affectedSignals: raw.affectedSignals,
      description: raw.description,
      suggestions: [],
    };

    classified.suggestions = this.getSuggestions(classified);
    return classified;
  }

  /**
   * Return remediation suggestions for a classified anomaly.
   */
  getSuggestions(anomaly: ClassifiedAnomaly): RemediationSuggestion[] {
    const suggestions: RemediationSuggestion[] = [];

    switch (anomaly.category) {
      case 'bus_overload':
        suggestions.push({
          action: 'reduce_bus_signals',
          description: 'Move some signals to a different bus to reduce utilization below 100%.',
          priority: 'high',
        });
        suggestions.push({
          action: 'increase_bus_bandwidth',
          description: 'Upgrade the bus to a higher bandwidth variant if the protocol supports it.',
          priority: 'medium',
        });
        break;

      case 'range_overlap':
        suggestions.push({
          action: 'increase_bit_length',
          description: 'Increase the transport bit length to accommodate the full logical range.',
          priority: 'high',
        });
        suggestions.push({
          action: 'adjust_scale_factor',
          description: 'Adjust the scale factor and offset to fit the logical range within the current encoding capacity.',
          priority: 'medium',
        });
        break;

      case 'encoding_mismatch':
        suggestions.push({
          action: 'change_encoding',
          description: 'Switch to an encoding type compatible with the logical data type (e.g., use IEEE 754 for floats instead of BCD).',
          priority: 'high',
        });
        break;

      case 'wire_gauge_incompatibility':
        suggestions.push({
          action: 'upgrade_wire_gauge',
          description: 'Use a thicker wire gauge that supports the required data rate for this protocol.',
          priority: 'high',
        });
        break;

      case 'timing_mismatch':
        suggestions.push({
          action: 'reduce_refresh_rate',
          description: 'Lower the logical refresh rate to match the transport timing capability.',
          priority: 'medium',
        });
        suggestions.push({
          action: 'increase_transport_rate',
          description: 'Increase the transport cycle rate or minor frame rate to support the desired refresh rate.',
          priority: 'medium',
        });
        break;

      case 'bit_layout_overflow':
        suggestions.push({
          action: 'adjust_bit_offset',
          description: 'Reduce the bit offset or bit length so the signal fits within the protocol word size.',
          priority: 'high',
        });
        break;

      default:
        suggestions.push({
          action: 'manual_review',
          description: 'Review the signal configuration manually to identify and resolve the issue.',
          priority: 'low',
        });
        break;
    }

    return suggestions;
  }

  // -----------------------------------------------------------------------
  // Private detection methods
  // -----------------------------------------------------------------------

  /**
   * Detect encoding mismatch: BCD encoding used with float/signed data types.
   */
  private detectEncodingMismatch(signal: Signal): ClassifiedAnomaly[] {
    const anomalies: ClassifiedAnomaly[] = [];

    if (!signal.logical || !signal.transport) return anomalies;

    const encoding = signal.transport.encoding;
    const dataType = signal.logical.dataType.toLowerCase();

    const incompatibleTypes = ENCODING_DATA_TYPE_INCOMPATIBLE[encoding];
    if (incompatibleTypes && incompatibleTypes.some((t) => dataType.includes(t))) {
      const raw: RawAnomaly = {
        affectedSignals: [signal.id],
        description: `Encoding '${encoding}' is incompatible with logical data type '${signal.logical.dataType}'. BCD encoding cannot represent floating-point or signed values.`,
        source: 'pattern_detection',
        rawDetail: { encoding, dataType: signal.logical.dataType },
      };
      anomalies.push(this.classifyAnomaly(raw));
    }

    return anomalies;
  }

  /**
   * Detect bus overload: utilization > 100%.
   */
  private async detectBusOverload(
    busId: string,
    affectedSignals: SignalId[],
  ): Promise<ClassifiedAnomaly[]> {
    if (!this.busUtilizationProvider) return [];

    try {
      const util = await this.busUtilizationProvider.getUtilization(busId);
      if (util.utilizationPercent > 100) {
        const raw: RawAnomaly = {
          affectedSignals,
          description: `Bus '${busId}' utilization is ${util.utilizationPercent.toFixed(1)}%, exceeding 100% capacity (${util.usedBandwidthBps} bps used of ${util.totalBandwidthBps} bps total).`,
          source: 'bus_loading',
          rawDetail: {
            busId,
            utilizationPercent: util.utilizationPercent,
            usedBandwidthBps: util.usedBandwidthBps,
            totalBandwidthBps: util.totalBandwidthBps,
          },
        };
        return [this.classifyAnomaly(raw)];
      }
    } catch {
      // Bus utilization check failed — skip silently
    }

    return [];
  }

  // -----------------------------------------------------------------------
  // Classification helpers
  // -----------------------------------------------------------------------

  private inferCategory(raw: RawAnomaly): AnomalyCategory {
    // Check raw detail for constraint-based classification
    if (raw.rawDetail?.constraint) {
      const cat = CONSTRAINT_CATEGORY_MAP[raw.rawDetail.constraint as string];
      if (cat) return cat;
    }

    if (raw.rawDetail?.field) {
      const cat = FIELD_CATEGORY_MAP[raw.rawDetail.field as string];
      if (cat) return cat;
    }

    // Pattern-based classification from description
    const desc = raw.description.toLowerCase();
    if (desc.includes('utilization') && desc.includes('exceeding')) return 'bus_overload';
    if (desc.includes('encoding') && desc.includes('incompatible')) return 'encoding_mismatch';
    if (desc.includes('logical') && (desc.includes('exceeds') || desc.includes('below'))) return 'range_overlap';
    if (desc.includes('wire gauge') && desc.includes('insufficient')) return 'wire_gauge_incompatibility';
    if (desc.includes('refresh rate') && desc.includes('exceeds')) return 'timing_mismatch';
    if (desc.includes('bit offset') || desc.includes('bit length')) return 'bit_layout_overflow';

    return 'unknown';
  }

  private inferSeverity(category: AnomalyCategory, _raw: RawAnomaly): AnomalySeverity {
    switch (category) {
      case 'bus_overload':
      case 'range_overlap':
      case 'wire_gauge_incompatibility':
      case 'bit_layout_overflow':
        return 'error';
      case 'encoding_mismatch':
        return 'error';
      case 'timing_mismatch':
        return 'warning';
      default:
        return 'info';
    }
  }
}
