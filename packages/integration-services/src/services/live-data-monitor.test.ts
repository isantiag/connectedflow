import { describe, it, expect } from 'vitest';
import type { AdapterId, ChannelId, SessionId, SignalId } from '@connectedicd/shared-types';
import {
  BusDataDecoder,
  DeviationDetector,
  LiveDataMonitor,
} from './live-data-monitor.js';
import type { IcdSignalDefinition, LiveDataWriter } from './live-data-monitor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDef(overrides: Partial<IcdSignalDefinition> = {}): IcdSignalDefinition {
  return {
    signalId: 'sig-1' as SignalId,
    name: 'TestSignal',
    units: 'V',
    bitOffset: 0,
    bitLength: 8,
    encoding: 'unsigned',
    scaleFactor: 1,
    offsetValue: 0,
    byteOrder: 'big_endian',
    minValue: 0,
    maxValue: 100,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// BusDataDecoder — extractBits
// ---------------------------------------------------------------------------

describe('BusDataDecoder', () => {
  const decoder = new BusDataDecoder();

  describe('extractBits', () => {
    it('extracts a full byte at offset 0 (big endian)', () => {
      const buf = Buffer.from([0xab]);
      expect(decoder.extractBits(buf, 0, 8, 'big_endian')).toBe(0xab);
    });

    it('extracts bits from the middle of a byte', () => {
      // 0b10110100 = 0xB4 → bits 2..5 (4 bits) = 1101 = 13
      const buf = Buffer.from([0xb4]);
      expect(decoder.extractBits(buf, 2, 4, 'big_endian')).toBe(0b1101);
    });

    it('extracts bits spanning two bytes (big endian)', () => {
      // bytes: 0xFF 0x00 → all 16 bits = 0xFF00
      const buf = Buffer.from([0xff, 0x00]);
      expect(decoder.extractBits(buf, 0, 16, 'big_endian')).toBe(0xff00);
    });

    it('extracts bits spanning two bytes at non-zero offset', () => {
      // 0b00001111 0b11110000 → bits 4..11 (8 bits) = 0b11111111 = 255
      const buf = Buffer.from([0x0f, 0xf0]);
      expect(decoder.extractBits(buf, 4, 8, 'big_endian')).toBe(0xff);
    });

    it('extracts a single bit', () => {
      const buf = Buffer.from([0x80]); // 0b10000000
      expect(decoder.extractBits(buf, 0, 1, 'big_endian')).toBe(1);
      expect(decoder.extractBits(buf, 1, 1, 'big_endian')).toBe(0);
    });

    it('handles little endian byte order (2 bytes)', () => {
      // LE bytes [0x01, 0x00] → reversed to [0x00, 0x01] → 16-bit value = 0x0001 = 1
      const buf = Buffer.from([0x01, 0x00]);
      expect(decoder.extractBits(buf, 0, 16, 'little_endian')).toBe(0x0001);
    });

    it('handles little endian with 4 bytes', () => {
      // LE bytes [0x78, 0x56, 0x34, 0x12] → reversed [0x12, 0x34, 0x56, 0x78]
      // 32-bit value = 0x12345678
      const buf = Buffer.from([0x78, 0x56, 0x34, 0x12]);
      expect(decoder.extractBits(buf, 0, 32, 'little_endian')).toBe(0x12345678);
    });

    it('throws on zero bitLength', () => {
      expect(() => decoder.extractBits(Buffer.from([0]), 0, 0, 'big_endian')).toThrow();
    });

    it('throws on out-of-range bit index', () => {
      expect(() => decoder.extractBits(Buffer.from([0]), 0, 16, 'big_endian')).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // applyEncoding
  // ---------------------------------------------------------------------------

  describe('applyEncoding', () => {
    it('unsigned: returns raw value unchanged', () => {
      expect(decoder.applyEncoding(200, 8, 'unsigned')).toBe(200);
    });

    it('signed: positive value (MSB=0)', () => {
      // 7-bit max positive in 8-bit signed = 127
      expect(decoder.applyEncoding(127, 8, 'signed')).toBe(127);
    });

    it('signed: negative value (MSB=1)', () => {
      // 0xFF = 255 unsigned → -1 in 8-bit signed
      expect(decoder.applyEncoding(255, 8, 'signed')).toBe(-1);
      // 0x80 = 128 unsigned → -128 in 8-bit signed
      expect(decoder.applyEncoding(128, 8, 'signed')).toBe(-128);
    });

    it('signed: 16-bit negative', () => {
      // 0xFFFE = 65534 → -2 in 16-bit signed
      expect(decoder.applyEncoding(65534, 16, 'signed')).toBe(-2);
    });

    it('ieee754: 32-bit float', () => {
      // IEEE 754 for 1.0 = 0x3F800000
      const result = decoder.applyEncoding(0x3f800000, 32, 'ieee754');
      expect(result).toBeCloseTo(1.0, 5);
    });

    it('ieee754: 32-bit negative float', () => {
      // IEEE 754 for -2.5 = 0xC0200000
      const result = decoder.applyEncoding(0xc0200000, 32, 'ieee754');
      expect(result).toBeCloseTo(-2.5, 5);
    });

    it('ieee754: throws on unsupported bit length', () => {
      expect(() => decoder.applyEncoding(0, 16, 'ieee754')).toThrow();
    });

    it('bcd: decodes BCD nibbles', () => {
      // 0x1234 in BCD = 1234 decimal
      // But BCD decoding goes LSB-first: nibbles from right: 4, 3, 2, 1
      expect(decoder.applyEncoding(0x1234, 16, 'bcd')).toBe(1234);
    });

    it('bcd: single digit', () => {
      expect(decoder.applyEncoding(0x9, 4, 'bcd')).toBe(9);
    });

    it('bcd: throws on invalid digit', () => {
      // 0xA is not a valid BCD digit
      expect(() => decoder.applyEncoding(0xa, 4, 'bcd')).toThrow('Invalid BCD digit');
    });

    it('throws on unsupported encoding', () => {
      expect(() => decoder.applyEncoding(0, 8, 'unknown' as any)).toThrow('Unsupported encoding');
    });
  });

  // ---------------------------------------------------------------------------
  // decode (full pipeline)
  // ---------------------------------------------------------------------------

  describe('decode', () => {
    it('applies formula: raw * scaleFactor + offsetValue', () => {
      // raw byte = 100, scale = 0.5, offset = 10 → 100 * 0.5 + 10 = 60
      const buf = Buffer.from([100]);
      const def = makeDef({ scaleFactor: 0.5, offsetValue: 10 });
      expect(decoder.decode(buf, def)).toBeCloseTo(60, 5);
    });

    it('decodes signed value with scale and offset', () => {
      // raw = 0xFF = 255 → signed 8-bit = -1 → -1 * 2 + 50 = 48
      const buf = Buffer.from([0xff]);
      const def = makeDef({ encoding: 'signed', scaleFactor: 2, offsetValue: 50 });
      expect(decoder.decode(buf, def)).toBeCloseTo(48, 5);
    });

    it('decodes 16-bit unsigned big endian with scale', () => {
      // raw = 0x0100 = 256 → 256 * 0.1 + 0 = 25.6
      const buf = Buffer.from([0x01, 0x00]);
      const def = makeDef({ bitLength: 16, scaleFactor: 0.1, offsetValue: 0 });
      expect(decoder.decode(buf, def)).toBeCloseTo(25.6, 5);
    });

    it('decodes 16-bit little endian', () => {
      // LE bytes [0x00, 0x01] → reversed [0x01, 0x00] → 256 → 256 * 1 + 0 = 256
      const buf = Buffer.from([0x00, 0x01]);
      const def = makeDef({
        bitLength: 16,
        byteOrder: 'little_endian',
        scaleFactor: 1,
        offsetValue: 0,
      });
      expect(decoder.decode(buf, def)).toBe(256);
    });

    it('decodes bits at non-zero offset', () => {
      // byte = 0b00110000 = 0x30, bits 2..5 (4 bits) = 0b1100 = 12
      // 12 * 1 + 0 = 12
      const buf = Buffer.from([0x30]);
      const def = makeDef({ bitOffset: 2, bitLength: 4 });
      expect(decoder.decode(buf, def)).toBe(12);
    });
  });
});

// ---------------------------------------------------------------------------
// DeviationDetector
// ---------------------------------------------------------------------------

describe('DeviationDetector', () => {
  const detector = new DeviationDetector();

  it('returns null when value is well within range', () => {
    const def = makeDef({ minValue: 0, maxValue: 100 });
    expect(detector.detect(50, def)).toBeNull();
  });

  it('returns null when both bounds are null', () => {
    const def = makeDef({ minValue: null, maxValue: null });
    expect(detector.detect(999, def)).toBeNull();
  });

  it('returns error when value is below min', () => {
    const def = makeDef({ minValue: 10, maxValue: 100 });
    const result = detector.detect(5, def);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('error');
    expect(result!.decodedValue).toBe(5);
  });

  it('returns error when value is above max', () => {
    const def = makeDef({ minValue: 0, maxValue: 100 });
    const result = detector.detect(150, def);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('error');
    expect(result!.decodedValue).toBe(150);
  });

  it('returns warning when value is within 10% of min boundary', () => {
    // range 0..100, 10% margin = 10, value 5 is within [0, 10) → warning
    const def = makeDef({ minValue: 0, maxValue: 100 });
    const result = detector.detect(5, def);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('warning');
  });

  it('returns warning when value is within 10% of max boundary', () => {
    // range 0..100, 10% margin = 10, value 95 is within (90, 100] → warning
    const def = makeDef({ minValue: 0, maxValue: 100 });
    const result = detector.detect(95, def);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('warning');
  });

  it('returns null at exactly the 10% boundary (not in warning zone)', () => {
    // range 0..100, margin = 10, value 10 is at minValue + margin → not in warning zone
    const def = makeDef({ minValue: 0, maxValue: 100 });
    expect(detector.detect(10, def)).toBeNull();
  });

  it('returns null at exactly 90 (not in warning zone)', () => {
    // range 0..100, margin = 10, value 90 is at maxValue - margin → not in warning zone
    const def = makeDef({ minValue: 0, maxValue: 100 });
    expect(detector.detect(90, def)).toBeNull();
  });

  it('returns error when only min is set and value is below', () => {
    const def = makeDef({ minValue: 10, maxValue: null });
    const result = detector.detect(5, def);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('error');
  });

  it('returns null when only min is set and value is above (no warning without range)', () => {
    const def = makeDef({ minValue: 10, maxValue: null });
    expect(detector.detect(50, def)).toBeNull();
  });

  it('returns error when only max is set and value is above', () => {
    const def = makeDef({ minValue: null, maxValue: 100 });
    const result = detector.detect(150, def);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('error');
  });

  it('includes signal metadata in deviation', () => {
    const def = makeDef({ signalId: 'sig-x' as SignalId, name: 'Altitude', minValue: 0, maxValue: 50000 });
    const result = detector.detect(-100, def);
    expect(result).not.toBeNull();
    expect(result!.signalId).toBe('sig-x');
    expect(result!.name).toBe('Altitude');
    expect(result!.min).toBe(0);
    expect(result!.max).toBe(50000);
  });
});

// ---------------------------------------------------------------------------
// LiveDataMonitor
// ---------------------------------------------------------------------------

describe('LiveDataMonitor', () => {
  it('startMonitoring returns a session with correct fields', () => {
    const monitor = new LiveDataMonitor({
      signalProvider: () => [],
    });
    const session = monitor.startMonitoring('adapter-1' as AdapterId, ['ch-1' as ChannelId]);
    expect(session.adapterId).toBe('adapter-1');
    expect(session.channels).toEqual(['ch-1']);
    expect(session.sessionId).toBeTruthy();
  });

  it('processFrame decodes signals and detects deviations', async () => {
    const def = makeDef({
      bitOffset: 0,
      bitLength: 8,
      encoding: 'unsigned',
      scaleFactor: 1,
      offsetValue: 0,
      minValue: 0,
      maxValue: 50,
    });

    const monitor = new LiveDataMonitor({
      signalProvider: () => [def],
    });

    // raw byte = 60, which is > max 50 → error deviation
    const rawData = Buffer.from([60]);
    const event = await monitor.processFrame(
      'session-1' as SessionId,
      'adapter-1' as AdapterId,
      'ch-1' as ChannelId,
      rawData,
    );

    expect(event.decoded).toHaveLength(1);
    expect(event.decoded[0].decodedValue).toBe(60);
    expect(event.deviations).toHaveLength(1);
    expect(event.deviations[0].severity).toBe('error');
  });

  it('processFrame calls writer when provided', async () => {
    const def = makeDef();
    const writings: any[] = [];
    const writer: LiveDataWriter = {
      writeReading: async (r) => { writings.push(r); },
    };

    const monitor = new LiveDataMonitor({
      signalProvider: () => [def],
      writer,
    });

    await monitor.processFrame(
      'session-1' as SessionId,
      'adapter-1' as AdapterId,
      'ch-1' as ChannelId,
      Buffer.from([50]),
    );

    expect(writings).toHaveLength(1);
    expect(writings[0].decodedValue).toBe(50);
    expect(writings[0].sessionId).toBe('session-1');
    expect(writings[0].adapterId).toBe('adapter-1');
  });

  it('processFrame handles multiple signals on one channel', async () => {
    const def1 = makeDef({ signalId: 'sig-1' as SignalId, bitOffset: 0, bitLength: 8 });
    const def2 = makeDef({
      signalId: 'sig-2' as SignalId,
      name: 'Signal2',
      bitOffset: 8,
      bitLength: 8,
      minValue: 0,
      maxValue: 200,
    });

    const monitor = new LiveDataMonitor({
      signalProvider: () => [def1, def2],
    });

    const rawData = Buffer.from([50, 180]);
    const event = await monitor.processFrame(
      'session-1' as SessionId,
      'adapter-1' as AdapterId,
      'ch-1' as ChannelId,
      rawData,
    );

    expect(event.decoded).toHaveLength(2);
    expect(event.decoded[0].decodedValue).toBe(50);
    expect(event.decoded[1].decodedValue).toBe(180);
  });
});
