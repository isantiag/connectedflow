import type { AdapterId, SessionId } from '@connectedicd/shared-types';
import type { IcdSignalDefinition } from './live-data-monitor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StimulusConfig {
  /** ICD signal definitions to generate stimulus for */
  definitions: IcdSignalDefinition[];
  /** Override refresh rate for all signals (Hz). If omitted, uses per-signal refreshRateHz or defaults to 1 Hz. */
  refreshRateHz?: number;
}

export interface SimSession {
  sessionId: SessionId;
  adapterId: AdapterId;
  /** Stop the simulation */
  stop(): void;
  /** Whether the simulation is currently running */
  isRunning(): boolean;
}

// ---------------------------------------------------------------------------
// StimulusGenerator
// ---------------------------------------------------------------------------

/**
 * Generates raw bus data frames from ICD signal definitions.
 *
 * The encoding pipeline is the reverse of BusDataDecoder:
 *   value → inverse formula → encoding → pack bits into buffer
 *
 * Inverse formula: raw = (value - offsetValue) / scaleFactor
 */
export class StimulusGenerator {
  /**
   * Generate a raw data frame by producing a random value within the logical
   * range for each signal definition, encoding it, and packing into a buffer.
   *
   * Returns a Buffer large enough to hold all defined signals.
   */
  generateFrame(definitions: IcdSignalDefinition[]): Buffer {
    // Determine buffer size: enough bytes to cover all signals
    const bufferBits = definitions.reduce((max, def) => {
      return Math.max(max, def.bitOffset + def.bitLength);
    }, 0);
    const bufferBytes = Math.max(1, Math.ceil(bufferBits / 8));
    const buf = Buffer.alloc(bufferBytes);

    for (const def of definitions) {
      const value = this.generateValue(def);
      const rawInt = this.applyInverseFormula(value, def.scaleFactor, def.offsetValue);
      const encoded = this.applyEncoding(rawInt, def.bitLength, def.encoding);
      this.packBits(buf, encoded, def.bitOffset, def.bitLength, def.byteOrder);
    }

    return buf;
  }

  /**
   * Generate a random value within the signal's [minValue, maxValue] range.
   * If bounds are null, defaults to [0, 255].
   */
  generateValue(def: IcdSignalDefinition): number {
    const min = def.minValue ?? 0;
    const max = def.maxValue ?? 255;
    return min + Math.random() * (max - min);
  }

  /**
   * Generate a specific value's raw frame (useful for testing).
   */
  generateFrameWithValues(
    definitions: IcdSignalDefinition[],
    values: Map<string, number>,
  ): Buffer {
    const bufferBits = definitions.reduce((max, def) => {
      return Math.max(max, def.bitOffset + def.bitLength);
    }, 0);
    const bufferBytes = Math.max(1, Math.ceil(bufferBits / 8));
    const buf = Buffer.alloc(bufferBytes);

    for (const def of definitions) {
      const value = values.get(def.signalId) ?? this.generateValue(def);
      const rawInt = this.applyInverseFormula(value, def.scaleFactor, def.offsetValue);
      const encoded = this.applyEncoding(rawInt, def.bitLength, def.encoding);
      this.packBits(buf, encoded, def.bitOffset, def.bitLength, def.byteOrder);
    }

    return buf;
  }

  /**
   * Inverse of the decode formula: raw = (value - offsetValue) / scaleFactor
   */
  applyInverseFormula(value: number, scaleFactor: number, offsetValue: number): number {
    if (scaleFactor === 0) {
      throw new Error('scaleFactor must not be zero');
    }
    return (value - offsetValue) / scaleFactor;
  }

  /**
   * Encode a raw numeric value into an unsigned integer suitable for bit-packing.
   * This is the reverse of BusDataDecoder.applyEncoding.
   *
   * Supported encodings: unsigned, signed, bcd (ieee754 skipped for simplicity).
   */
  applyEncoding(rawValue: number, bitLength: number, encoding: string): number {
    switch (encoding) {
      case 'unsigned': {
        const maxVal = (1 << bitLength) - 1;
        const clamped = Math.round(Math.max(0, Math.min(rawValue, maxVal)));
        return clamped;
      }

      case 'signed': {
        // Two's complement encoding
        const signBit = 1 << (bitLength - 1);
        const minSigned = -signBit;
        const maxSigned = signBit - 1;
        const clamped = Math.round(Math.max(minSigned, Math.min(rawValue, maxSigned)));
        if (clamped < 0) {
          return clamped + (1 << bitLength);
        }
        return clamped;
      }

      case 'bcd': {
        // Binary-Coded Decimal: each decimal digit → 4-bit nibble
        const maxDigits = Math.floor(bitLength / 4);
        const maxBcd = Math.pow(10, maxDigits) - 1;
        const clamped = Math.round(Math.max(0, Math.min(rawValue, maxBcd)));
        let result = 0;
        let remaining = clamped;
        for (let i = 0; i < maxDigits; i++) {
          const digit = remaining % 10;
          result |= digit << (i * 4);
          remaining = Math.floor(remaining / 10);
        }
        return result;
      }

      default:
        throw new Error(`Unsupported encoding for stimulus: ${encoding}`);
    }
  }

  /**
   * Pack an unsigned integer value into the buffer at the specified bit
   * offset and length, respecting byte order.
   */
  packBits(
    buf: Buffer,
    value: number,
    bitOffset: number,
    bitLength: number,
    byteOrder: string,
  ): void {
    if (bitLength <= 0 || bitLength > 52) {
      throw new Error(`bitLength must be 1..52, got ${bitLength}`);
    }

    if (byteOrder === 'little_endian') {
      // Pack into a temporary big-endian buffer, then reverse the field bytes
      const startByte = Math.floor(bitOffset / 8);
      const endByte = Math.floor((bitOffset + bitLength - 1) / 8);

      // Pack bits MSB-first (big-endian style)
      this.packBitsBigEndian(buf, value, bitOffset, bitLength);

      // Reverse the bytes spanning the field
      let lo = startByte;
      let hi = endByte;
      while (lo < hi) {
        const tmp = buf[lo];
        buf[lo] = buf[hi];
        buf[hi] = tmp;
        lo++;
        hi--;
      }
    } else {
      this.packBitsBigEndian(buf, value, bitOffset, bitLength);
    }
  }

  /**
   * Pack bits in big-endian (MSB-first) order into the buffer.
   */
  private packBitsBigEndian(
    buf: Buffer,
    value: number,
    bitOffset: number,
    bitLength: number,
  ): void {
    for (let i = 0; i < bitLength; i++) {
      const bitIndex = bitOffset + i;
      const byteIndex = Math.floor(bitIndex / 8);
      const bitInByte = 7 - (bitIndex % 8); // MSB-first within each byte

      if (byteIndex >= buf.length) {
        throw new Error(`Bit index ${bitIndex} out of buffer range (${buf.length} bytes)`);
      }

      // Extract bit from value (MSB first)
      const bitValue = (value >> (bitLength - 1 - i)) & 1;
      if (bitValue) {
        buf[byteIndex] |= 1 << bitInByte;
      } else {
        buf[byteIndex] &= ~(1 << bitInByte);
      }
    }
  }

  /**
   * Start a simulation session that periodically generates frames at the
   * configured refresh rate and invokes the callback with each frame.
   */
  startSimulation(
    adapterId: AdapterId,
    config: StimulusConfig,
    onFrame?: (frame: Buffer, definitions: IcdSignalDefinition[]) => void,
  ): SimSession {
    const sessionId = crypto.randomUUID() as SessionId;
    let running = true;
    const timers: ReturnType<typeof setInterval>[] = [];

    // Group definitions by refresh rate
    const rateGroups = new Map<number, IcdSignalDefinition[]>();
    for (const def of config.definitions) {
      const rate = config.refreshRateHz ?? (def as any).refreshRateHz ?? 1;
      const group = rateGroups.get(rate) ?? [];
      group.push(def);
      rateGroups.set(rate, group);
    }

    // Start a timer for each rate group
    for (const [rateHz, defs] of rateGroups) {
      const intervalMs = Math.max(1, Math.round(1000 / rateHz));
      const timer = setInterval(() => {
        if (!running) return;
        const frame = this.generateFrame(defs);
        onFrame?.(frame, defs);
      }, intervalMs);
      timers.push(timer);
    }

    const session: SimSession = {
      sessionId,
      adapterId,
      stop: () => {
        running = false;
        for (const t of timers) {
          clearInterval(t);
        }
        timers.length = 0;
      },
      isRunning: () => running,
    };

    return session;
  }
}
