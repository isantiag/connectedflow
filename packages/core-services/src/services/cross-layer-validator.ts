/**
 * Cross-layer validation for ICD signals.
 *
 * Checks consistency between logical, transport, and physical layers:
 * 1. Logical range vs transport encoding capacity
 * 2. Wire gauge vs data rate compatibility
 * 3. Bit offset + bit length vs protocol word size
 * 4. Refresh rate vs transport timing consistency
 */

import type {
  Signal,
  LogicalLayer,
  TransportLayer,
  PhysicalLayer,
  ValidationResult,
  ValidationError,
  Encoding,
} from '@connectedflow/shared-types';
import type {
  KnownProtocol,
  Arinc429Attrs,
  CanBusAttrs,
  MilStd1553Attrs,
  Arinc664Attrs,
} from '@connectedflow/shared-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Protocol word sizes in bits. */
const PROTOCOL_WORD_SIZE: Record<string, number> = {
  arinc429: 32,
  canbus: 64,
  arinc664: 12144, // max AFDX frame payload: 1518 bytes × 8
};

/** MIL-STD-1553 word size is 16 bits per word; total depends on word_count. */
const MIL_STD_1553_BITS_PER_WORD = 16;

/**
 * Maximum data rate (bps) each wire gauge can reliably carry.
 * Conservative estimates for aerospace wiring.
 */
const WIRE_GAUGE_MAX_DATA_RATE: Record<string, number> = {
  '16AWG': 1_000_000_000, // 1 Gbps
  '18AWG': 1_000_000_000,
  '20AWG': 100_000_000,   // 100 Mbps
  '22AWG': 10_000_000,    // 10 Mbps
  '24AWG': 1_000_000,     // 1 Mbps
  '26AWG': 100_000,       // 100 kbps
  '28AWG': 100_000,
};

/** Known bus data rates by protocol for wire gauge validation. */
const PROTOCOL_DATA_RATE: Record<string, number> = {
  arinc429: 100_000,       // 100 kbps (high speed)
  canbus: 1_000_000,       // 1 Mbps
  milstd1553: 1_000_000,   // 1 Mbps
  arinc664: 100_000_000,   // 100 Mbps
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the maximum representable value for a given encoding and bit length.
 * Returns the range [min, max] that the encoding can represent
 * BEFORE scale/offset are applied.
 */
function encodingRawRange(
  encoding: Encoding,
  bitLength: number,
): { rawMin: number; rawMax: number } {
  if (bitLength <= 0 || bitLength > 64) {
    return { rawMin: 0, rawMax: 0 };
  }
  switch (encoding) {
    case 'unsigned':
      return { rawMin: 0, rawMax: Math.pow(2, bitLength) - 1 };
    case 'signed': {
      const half = Math.pow(2, bitLength - 1);
      return { rawMin: -half, rawMax: half - 1 };
    }
    case 'ieee754':
      if (bitLength === 32) return { rawMin: -3.4e38, rawMax: 3.4e38 };
      if (bitLength === 64) return { rawMin: -1.8e308, rawMax: 1.8e308 };
      // Non-standard IEEE754 bit length — can't validate range
      return { rawMin: -Infinity, rawMax: Infinity };
    case 'bcd':
      // BCD: each 4 bits encodes one decimal digit (0-9)
      return { rawMin: 0, rawMax: Math.pow(10, Math.floor(bitLength / 4)) - 1 };
    default:
      return { rawMin: -Infinity, rawMax: Infinity };
  }
}

/**
 * Apply scale factor and offset to raw range to get the engineering-unit range
 * the transport layer can represent.
 */
function transportRepresentableRange(
  encoding: Encoding,
  bitLength: number,
  scaleFactor: number,
  offsetValue: number,
): { min: number; max: number } {
  const { rawMin, rawMax } = encodingRawRange(encoding, bitLength);
  if (!isFinite(rawMin) || !isFinite(rawMax)) {
    return { min: -Infinity, max: Infinity };
  }
  const a = rawMin * scaleFactor + offsetValue;
  const b = rawMax * scaleFactor + offsetValue;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

/**
 * Get the protocol word size for a signal, accounting for MIL-STD-1553 word_count.
 */
function getProtocolWordSize(
  protocolName: string,
  protocolAttrs: Record<string, unknown>,
): number | null {
  const normalized = protocolName.toLowerCase().replace(/[-_\s]/g, '');

  if (normalized === 'milstd1553') {
    const wordCount = (protocolAttrs as Partial<MilStd1553Attrs>).word_count ?? 1;
    return MIL_STD_1553_BITS_PER_WORD * wordCount;
  }

  const size = PROTOCOL_WORD_SIZE[normalized];
  return size ?? null;
}

/**
 * Resolve the protocol name from a protocolId string.
 * Accepts formats like 'arinc429', 'proto-arinc429', or just the raw id.
 */
function resolveProtocolName(protocolId: string): string {
  // Strip common prefixes
  const cleaned = protocolId.replace(/^proto[-_]?/i, '').toLowerCase().replace(/[-_\s]/g, '');
  return cleaned;
}

// ---------------------------------------------------------------------------
// CrossLayerValidator
// ---------------------------------------------------------------------------

export class CrossLayerValidator {
  /**
   * Validate cross-layer consistency for a signal.
   * Returns a ValidationResult with field-level errors for any conflicts found.
   */
  validate(signal: Signal): ValidationResult {
    const errors: ValidationError[] = [];

    const { logical, transport, physical } = signal;

    if (logical && transport) {
      errors.push(...this.validateLogicalVsTransport(logical, transport));
    }

    if (transport) {
      errors.push(...this.validateBitLayout(transport));
    }

    if (physical && transport) {
      errors.push(...this.validateWireGaugeVsDataRate(physical, transport));
    }

    if (logical && transport) {
      errors.push(...this.validateRefreshRateVsTiming(logical, transport));
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // -----------------------------------------------------------------------
  // Rule 1: Logical range vs transport encoding capacity
  // -----------------------------------------------------------------------

  private validateLogicalVsTransport(
    logical: LogicalLayer,
    transport: TransportLayer,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    if (logical.minValue === null || logical.maxValue === null) {
      return errors; // No range defined — nothing to validate
    }

    const representable = transportRepresentableRange(
      transport.encoding,
      transport.bitLength,
      transport.scaleFactor,
      transport.offsetValue,
    );

    if (!isFinite(representable.min) || !isFinite(representable.max)) {
      return errors; // Can't validate (e.g., non-standard IEEE754)
    }

    if (logical.minValue < representable.min) {
      errors.push({
        field: 'logical.minValue',
        message: `Logical minimum (${logical.minValue}) is below the transport encoding capacity minimum (${representable.min}). The ${transport.encoding} encoding with ${transport.bitLength} bits, scale ${transport.scaleFactor}, offset ${transport.offsetValue} cannot represent this value.`,
        constraint: 'logical_range_within_transport_capacity',
        severity: 'error',
      });
    }

    if (logical.maxValue > representable.max) {
      errors.push({
        field: 'logical.maxValue',
        message: `Logical maximum (${logical.maxValue}) exceeds the transport encoding capacity maximum (${representable.max}). The ${transport.encoding} encoding with ${transport.bitLength} bits, scale ${transport.scaleFactor}, offset ${transport.offsetValue} cannot represent this value.`,
        constraint: 'logical_range_within_transport_capacity',
        severity: 'error',
      });
    }

    return errors;
  }

  // -----------------------------------------------------------------------
  // Rule 2: Wire gauge vs data rate compatibility
  // -----------------------------------------------------------------------

  private validateWireGaugeVsDataRate(
    physical: PhysicalLayer,
    transport: TransportLayer,
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    const gaugeKey = physical.wireGauge.toUpperCase().replace(/\s/g, '');
    const maxRate = WIRE_GAUGE_MAX_DATA_RATE[gaugeKey];

    if (maxRate === undefined) {
      return errors; // Unknown gauge — skip validation
    }

    const protocolName = resolveProtocolName(transport.protocolId as string);
    const busDataRate = PROTOCOL_DATA_RATE[protocolName];

    if (busDataRate === undefined) {
      return errors; // Unknown protocol — skip validation
    }

    if (maxRate < busDataRate) {
      errors.push({
        field: 'physical.wireGauge',
        message: `Wire gauge ${physical.wireGauge} (max ${maxRate} bps) is insufficient for protocol ${protocolName} data rate (${busDataRate} bps).`,
        constraint: 'wire_gauge_supports_data_rate',
        severity: 'error',
      });
    }

    return errors;
  }

  // -----------------------------------------------------------------------
  // Rule 3: Bit offset + bit length vs protocol word size
  // -----------------------------------------------------------------------

  private validateBitLayout(transport: TransportLayer): ValidationError[] {
    const errors: ValidationError[] = [];

    const protocolName = resolveProtocolName(transport.protocolId as string);
    const wordSize = getProtocolWordSize(
      protocolName,
      transport.protocolAttrs as Record<string, unknown>,
    );

    if (wordSize === null) {
      return errors; // Unknown protocol — skip validation
    }

    const totalBits = transport.bitOffset + transport.bitLength;

    if (totalBits > wordSize) {
      errors.push({
        field: 'transport.bitOffset',
        message: `Bit offset (${transport.bitOffset}) + bit length (${transport.bitLength}) = ${totalBits} bits exceeds protocol word size of ${wordSize} bits.`,
        constraint: 'bit_layout_within_protocol_word',
        severity: 'error',
      });
    }

    return errors;
  }

  // -----------------------------------------------------------------------
  // Rule 4: Refresh rate vs transport timing consistency
  // -----------------------------------------------------------------------

  private validateRefreshRateVsTiming(
    logical: LogicalLayer,
    transport: TransportLayer,
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const attrs = transport.protocolAttrs as Record<string, unknown>;
    const protocolName = resolveProtocolName(transport.protocolId as string);

    if (protocolName === 'canbus' && typeof attrs.cycle_time_ms === 'number') {
      // CAN: cycle_time_ms defines how often the message is sent
      const transportRateHz = 1000 / attrs.cycle_time_ms;
      if (logical.refreshRateHz > transportRateHz * 1.01) {
        errors.push({
          field: 'logical.refreshRateHz',
          message: `Logical refresh rate (${logical.refreshRateHz} Hz) exceeds CAN bus cycle rate (${transportRateHz.toFixed(1)} Hz from ${attrs.cycle_time_ms} ms cycle time).`,
          constraint: 'refresh_rate_within_transport_timing',
          severity: 'warning',
        });
      }
    }

    if (protocolName === 'milstd1553' && typeof attrs.minor_frame_rate_hz === 'number') {
      // 1553: minor_frame_rate_hz defines the scheduling rate
      if (logical.refreshRateHz > (attrs.minor_frame_rate_hz as number) * 1.01) {
        errors.push({
          field: 'logical.refreshRateHz',
          message: `Logical refresh rate (${logical.refreshRateHz} Hz) exceeds MIL-STD-1553 minor frame rate (${attrs.minor_frame_rate_hz} Hz).`,
          constraint: 'refresh_rate_within_transport_timing',
          severity: 'warning',
        });
      }
    }

    return errors;
  }
}
