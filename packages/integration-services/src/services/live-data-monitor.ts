import { EventEmitter } from 'events';
import type {
  AdapterId,
  ChannelId,
  SessionId,
  SignalId,
  Encoding,
  ByteOrder,
} from '@connectedicd/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DecodedParameter {
  signalId: SignalId;
  name: string;
  decodedValue: number;
  units: string;
}

export interface ParameterDeviation {
  signalId: SignalId;
  name: string;
  decodedValue: number;
  min: number | null;
  max: number | null;
  severity: 'warning' | 'error';
}

export interface LiveDataEvent {
  timestamp: number;
  adapterId: AdapterId;
  channel: ChannelId;
  rawData: Buffer;
  decoded: DecodedParameter[];
  deviations: ParameterDeviation[];
}

/** Minimal ICD signal definition needed for decoding. */
export interface IcdSignalDefinition {
  signalId: SignalId;
  name: string;
  units: string;
  /** Transport layer */
  bitOffset: number;
  bitLength: number;
  encoding: Encoding;
  scaleFactor: number;
  offsetValue: number;
  byteOrder: ByteOrder;
  /** Logical layer range */
  minValue: number | null;
  maxValue: number | null;
}

/** Interface for persisting decoded readings (e.g. TimescaleDB). */
export interface LiveDataWriter {
  writeReading(reading: {
    time: Date;
    sessionId: SessionId;
    signalId: SignalId;
    rawValue: Buffer;
    decodedValue: number;
    inRange: boolean;
    deviationSeverity: string | null;
    adapterId: AdapterId;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// BusDataDecoder
// ---------------------------------------------------------------------------

/**
 * Decodes raw bus data using ICD signal definitions.
 *
 * Pipeline: extract bits → apply encoding → apply formula
 *   decoded = raw_extracted_bits * scaleFactor + offsetValue
 */
export class BusDataDecoder {
  /**
   * Extract raw bits from a buffer at the given bit offset / length,
   * respecting byte order, then apply encoding, scale, and offset.
   */
  decode(raw: Buffer, def: IcdSignalDefinition): number {
    const extracted = this.extractBits(raw, def.bitOffset, def.bitLength, def.byteOrder);
    const encoded = this.applyEncoding(extracted, def.bitLength, def.encoding);
    return encoded * def.scaleFactor + def.offsetValue;
  }

  /**
   * Extract an unsigned integer from `raw` starting at `bitOffset` for
   * `bitLength` bits. When byteOrder is little_endian the *bytes* that
   * contain the field are reversed before extraction.
   */
  extractBits(raw: Buffer, bitOffset: number, bitLength: number, byteOrder: ByteOrder): number {
    if (bitLength <= 0 || bitLength > 52) {
      throw new Error(`bitLength must be 1..52, got ${bitLength}`);
    }

    const buf = byteOrder === 'little_endian'
      ? this.reverseFieldBytes(raw, bitOffset, bitLength)
      : raw;

    // When we reversed bytes the bit offset is recalculated to the start of
    // the reversed region, which is the same numeric bitOffset within the
    // (now-reversed) buffer.
    const startBit = bitOffset;

    let value = 0;
    for (let i = 0; i < bitLength; i++) {
      const bitIndex = startBit + i;
      const byteIndex = Math.floor(bitIndex / 8);
      const bitInByte = 7 - (bitIndex % 8); // MSB-first within each byte
      if (byteIndex >= buf.length) {
        throw new Error(`Bit index ${bitIndex} out of buffer range (${buf.length} bytes)`);
      }
      const bit = (buf[byteIndex] >> bitInByte) & 1;
      value = value * 2 + bit;
    }
    return value;
  }

  /**
   * Interpret the raw unsigned integer according to the encoding type.
   */
  applyEncoding(rawValue: number, bitLength: number, encoding: Encoding): number {
    switch (encoding) {
      case 'unsigned':
        return rawValue;

      case 'signed': {
        // Two's complement
        const signBit = 1 << (bitLength - 1);
        if (rawValue >= signBit) {
          return rawValue - (1 << bitLength);
        }
        return rawValue;
      }

      case 'ieee754': {
        if (bitLength === 32) {
          const buf = Buffer.alloc(4);
          buf.writeUInt32BE(rawValue >>> 0);
          return buf.readFloatBE(0);
        }
        if (bitLength === 64) {
          // For 64-bit we need to handle as BigInt since JS numbers lose precision
          const buf = Buffer.alloc(8);
          const hi = Math.floor(rawValue / 0x100000000);
          const lo = rawValue - hi * 0x100000000;
          buf.writeUInt32BE(hi >>> 0, 0);
          buf.writeUInt32BE(lo >>> 0, 4);
          return buf.readDoubleBE(0);
        }
        throw new Error(`ieee754 encoding requires 32 or 64 bit length, got ${bitLength}`);
      }

      case 'bcd': {
        // Binary-Coded Decimal: each 4-bit nibble is a decimal digit
        let result = 0;
        let multiplier = 1;
        let remaining = rawValue;
        const nibbles = Math.ceil(bitLength / 4);
        for (let i = 0; i < nibbles; i++) {
          const digit = remaining & 0xf;
          if (digit > 9) {
            throw new Error(`Invalid BCD digit: ${digit}`);
          }
          result += digit * multiplier;
          multiplier *= 10;
          remaining = Math.floor(remaining / 16);
        }
        return result;
      }

      default:
        throw new Error(`Unsupported encoding: ${encoding}`);
    }
  }

  /**
   * Create a copy of the buffer with the bytes spanning the field reversed
   * (little-endian byte swap). The bit layout within each byte stays MSB-first.
   */
  private reverseFieldBytes(raw: Buffer, bitOffset: number, bitLength: number): Buffer {
    const startByte = Math.floor(bitOffset / 8);
    const endByte = Math.floor((bitOffset + bitLength - 1) / 8);
    const copy = Buffer.from(raw);
    let lo = startByte;
    let hi = endByte;
    while (lo < hi) {
      const tmp = copy[lo];
      copy[lo] = copy[hi];
      copy[hi] = tmp;
      lo++;
      hi--;
    }
    return copy;
  }
}

// ---------------------------------------------------------------------------
// DeviationDetector
// ---------------------------------------------------------------------------

/**
 * Checks decoded values against logical-layer min/max range.
 *
 * - Outside range → severity 'error'
 * - Within 10% of boundary → severity 'warning'
 */
export class DeviationDetector {
  detect(
    decodedValue: number,
    def: IcdSignalDefinition,
  ): ParameterDeviation | null {
    const { minValue, maxValue } = def;

    // If both bounds are null, no range check possible
    if (minValue === null && maxValue === null) {
      return null;
    }

    // Check hard out-of-range first
    if (minValue !== null && decodedValue < minValue) {
      return this.makeDeviation(def, decodedValue, 'error');
    }
    if (maxValue !== null && decodedValue > maxValue) {
      return this.makeDeviation(def, decodedValue, 'error');
    }

    // Check 10% boundary proximity (warning zone)
    if (minValue !== null && maxValue !== null) {
      const range = maxValue - minValue;
      if (range > 0) {
        const margin = range * 0.1;
        if (decodedValue < minValue + margin || decodedValue > maxValue - margin) {
          return this.makeDeviation(def, decodedValue, 'warning');
        }
      }
    }

    return null;
  }

  private makeDeviation(
    def: IcdSignalDefinition,
    decodedValue: number,
    severity: 'warning' | 'error',
  ): ParameterDeviation {
    return {
      signalId: def.signalId,
      name: def.name,
      decodedValue,
      min: def.minValue,
      max: def.maxValue,
      severity,
    };
  }
}

// ---------------------------------------------------------------------------
// MonitorSession
// ---------------------------------------------------------------------------

export interface MonitorSession {
  sessionId: SessionId;
  adapterId: AdapterId;
  channels: ChannelId[];
  /** Subscribe to live data events */
  on(event: 'data', listener: (evt: LiveDataEvent) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
  /** Stop monitoring */
  stop(): void;
}

// ---------------------------------------------------------------------------
// LiveDataMonitor
// ---------------------------------------------------------------------------

/**
 * Orchestrates live data monitoring: streams raw bus data, decodes it using
 * ICD signal definitions, detects deviations, and persists readings.
 */
export class LiveDataMonitor {
  private decoder = new BusDataDecoder();
  private deviationDetector = new DeviationDetector();
  private writer: LiveDataWriter | null;
  private signalProvider: (channelId: ChannelId) => IcdSignalDefinition[];

  constructor(opts: {
    /** Resolves channel → ICD signal definitions for decoding */
    signalProvider: (channelId: ChannelId) => IcdSignalDefinition[];
    /** Optional writer for persisting to TimescaleDB */
    writer?: LiveDataWriter;
  }) {
    this.signalProvider = opts.signalProvider;
    this.writer = opts.writer ?? null;
  }

  /**
   * Start monitoring the given channels on an adapter.
   * Returns a MonitorSession that emits LiveDataEvents via EventEmitter.
   */
  startMonitoring(adapterId: AdapterId, channels: ChannelId[]): MonitorSession {
    const sessionId = crypto.randomUUID() as SessionId;
    const emitter = new EventEmitter();

    const session: MonitorSession = {
      sessionId,
      adapterId,
      channels,
      on: ((event: string, listener: (...args: any[]) => void) => {
        emitter.on(event, listener);
      }) as MonitorSession['on'],
      stop: () => {
        emitter.removeAllListeners();
      },
    };

    return session;
  }

  /**
   * Process a raw data frame from the bus. Decodes all signals on the channel,
   * detects deviations, emits a LiveDataEvent, and persists readings.
   */
  async processFrame(
    sessionId: SessionId,
    adapterId: AdapterId,
    channel: ChannelId,
    rawData: Buffer,
    emitter?: EventEmitter,
  ): Promise<LiveDataEvent> {
    const definitions = this.signalProvider(channel);
    const decoded: DecodedParameter[] = [];
    const deviations: ParameterDeviation[] = [];

    for (const def of definitions) {
      const decodedValue = this.decoder.decode(rawData, def);

      decoded.push({
        signalId: def.signalId,
        name: def.name,
        decodedValue,
        units: def.units,
      });

      const deviation = this.deviationDetector.detect(decodedValue, def);
      if (deviation) {
        deviations.push(deviation);
      }

      // Persist to TimescaleDB
      if (this.writer) {
        const inRange = deviation === null || deviation.severity === 'warning';
        await this.writer.writeReading({
          time: new Date(),
          sessionId,
          signalId: def.signalId,
          rawValue: rawData,
          decodedValue,
          inRange: deviation === null,
          deviationSeverity: deviation?.severity ?? null,
          adapterId,
        });
      }
    }

    const event: LiveDataEvent = {
      timestamp: Date.now(),
      adapterId,
      channel,
      rawData,
      decoded,
      deviations,
    };

    if (emitter) {
      emitter.emit('data', event);
    }

    return event;
  }
}
