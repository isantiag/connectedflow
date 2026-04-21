import { describe, it, expect } from 'vitest';
import type { SignalId } from '@connectedicd/shared-types';
import { StimulusGenerator } from './stimulus-generator.js';
import { BusDataDecoder } from './live-data-monitor.js';
import type { IcdSignalDefinition } from './live-data-monitor.js';

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
// StimulusGenerator — applyInverseFormula
// ---------------------------------------------------------------------------

describe('StimulusGenerator', () => {
  const gen = new StimulusGenerator();

  describe('applyInverseFormula', () => {
    it('inverts identity formula (scale=1, offset=0)', () => {
      expect(gen.applyInverseFormula(42, 1, 0)).toBe(42);
    });

    it('inverts scale and offset', () => {
      // decoded = raw * 0.5 + 10 → raw = (decoded - 10) / 0.5
      // decoded = 60 → raw = (60 - 10) / 0.5 = 100
      expect(gen.applyInverseFormula(60, 0.5, 10)).toBeCloseTo(100, 5);
    });

    it('throws on zero scaleFactor', () => {
      expect(() => gen.applyInverseFormula(10, 0, 0)).toThrow('scaleFactor must not be zero');
    });
  });

  // ---------------------------------------------------------------------------
  // applyEncoding
  // ---------------------------------------------------------------------------

  describe('applyEncoding', () => {
    it('unsigned: clamps and rounds', () => {
      expect(gen.applyEncoding(200, 8, 'unsigned')).toBe(200);
      expect(gen.applyEncoding(300, 8, 'unsigned')).toBe(255); // clamped
      expect(gen.applyEncoding(-5, 8, 'unsigned')).toBe(0); // clamped
      expect(gen.applyEncoding(3.7, 8, 'unsigned')).toBe(4); // rounded
    });

    it('signed: encodes positive values', () => {
      expect(gen.applyEncoding(127, 8, 'signed')).toBe(127);
      expect(gen.applyEncoding(0, 8, 'signed')).toBe(0);
    });

    it('signed: encodes negative values as twos complement', () => {
      // -1 in 8-bit signed → 255
      expect(gen.applyEncoding(-1, 8, 'signed')).toBe(255);
      // -128 in 8-bit signed → 128
      expect(gen.applyEncoding(-128, 8, 'signed')).toBe(128);
    });

    it('signed: clamps to range', () => {
      // 8-bit signed range: -128..127
      expect(gen.applyEncoding(200, 8, 'signed')).toBe(127);
      expect(gen.applyEncoding(-200, 8, 'signed')).toBe(128); // -128 → 128
    });

    it('bcd: encodes decimal digits', () => {
      // 1234 → 0x1234
      expect(gen.applyEncoding(1234, 16, 'bcd')).toBe(0x1234);
      // 9 → 0x9
      expect(gen.applyEncoding(9, 4, 'bcd')).toBe(0x9);
      // 0 → 0x0
      expect(gen.applyEncoding(0, 8, 'bcd')).toBe(0x00);
    });

    it('bcd: clamps to max representable', () => {
      // 4 nibbles (16 bits) → max 9999
      expect(gen.applyEncoding(12345, 16, 'bcd')).toBe(0x9999);
    });

    it('throws on unsupported encoding', () => {
      expect(() => gen.applyEncoding(0, 8, 'ieee754')).toThrow('Unsupported encoding');
    });
  });

  // ---------------------------------------------------------------------------
  // packBits
  // ---------------------------------------------------------------------------

  describe('packBits', () => {
    it('packs a full byte at offset 0 (big endian)', () => {
      const buf = Buffer.alloc(1);
      gen.packBits(buf, 0xab, 0, 8, 'big_endian');
      expect(buf[0]).toBe(0xab);
    });

    it('packs bits in the middle of a byte', () => {
      const buf = Buffer.alloc(1);
      // Pack 0b1101 = 13 at bits 2..5
      gen.packBits(buf, 0b1101, 2, 4, 'big_endian');
      // Expected: 0b00110100 = 0x34
      expect(buf[0]).toBe(0b00110100);
    });

    it('packs 16-bit value spanning two bytes (big endian)', () => {
      const buf = Buffer.alloc(2);
      gen.packBits(buf, 0xff00, 0, 16, 'big_endian');
      expect(buf[0]).toBe(0xff);
      expect(buf[1]).toBe(0x00);
    });

    it('packs 16-bit value in little endian', () => {
      const buf = Buffer.alloc(2);
      // Pack 0x0001 in LE → bytes should be [0x01, 0x00]
      gen.packBits(buf, 0x0001, 0, 16, 'little_endian');
      expect(buf[0]).toBe(0x01);
      expect(buf[1]).toBe(0x00);
    });

    it('packs a single bit', () => {
      const buf = Buffer.alloc(1);
      gen.packBits(buf, 1, 0, 1, 'big_endian');
      expect(buf[0]).toBe(0x80);
    });
  });

  // ---------------------------------------------------------------------------
  // generateFrame
  // ---------------------------------------------------------------------------

  describe('generateFrame', () => {
    it('generates a buffer of correct size', () => {
      const def = makeDef({ bitOffset: 0, bitLength: 16 });
      const frame = gen.generateFrame([def]);
      expect(frame.length).toBe(2);
    });

    it('generates buffer for multiple non-overlapping signals', () => {
      const def1 = makeDef({ signalId: 'sig-1' as SignalId, bitOffset: 0, bitLength: 8 });
      const def2 = makeDef({ signalId: 'sig-2' as SignalId, bitOffset: 8, bitLength: 8 });
      const frame = gen.generateFrame([def1, def2]);
      expect(frame.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // generateFrameWithValues
  // ---------------------------------------------------------------------------

  describe('generateFrameWithValues', () => {
    it('encodes a specific value into the frame', () => {
      const def = makeDef({
        bitOffset: 0,
        bitLength: 8,
        encoding: 'unsigned',
        scaleFactor: 1,
        offsetValue: 0,
      });
      const values = new Map([['sig-1', 42]]);
      const frame = gen.generateFrameWithValues([def], values);
      expect(frame[0]).toBe(42);
    });
  });

  // ---------------------------------------------------------------------------
  // startSimulation
  // ---------------------------------------------------------------------------

  describe('startSimulation', () => {
    it('creates a running session that can be stopped', () => {
      const def = makeDef();
      const session = gen.startSimulation(
        'adapter-1' as any,
        { definitions: [def], refreshRateHz: 100 },
      );
      expect(session.isRunning()).toBe(true);
      expect(session.sessionId).toBeTruthy();
      expect(session.adapterId).toBe('adapter-1');
      session.stop();
      expect(session.isRunning()).toBe(false);
    });

    it('invokes onFrame callback', async () => {
      const def = makeDef();
      const frames: Buffer[] = [];
      const session = gen.startSimulation(
        'adapter-1' as any,
        { definitions: [def], refreshRateHz: 1000 },
        (frame) => frames.push(frame),
      );

      // Wait a bit for at least one frame
      await new Promise((r) => setTimeout(r, 50));
      session.stop();
      expect(frames.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Round-trip: generate → decode should produce value within logical range
  // ---------------------------------------------------------------------------

  describe('round-trip: stimulus → decode', () => {
    const decoder = new BusDataDecoder();

    it('unsigned 8-bit: decoded value is within [minValue, maxValue]', () => {
      const def = makeDef({
        bitOffset: 0,
        bitLength: 8,
        encoding: 'unsigned',
        scaleFactor: 1,
        offsetValue: 0,
        minValue: 0,
        maxValue: 100,
        byteOrder: 'big_endian',
      });

      for (let i = 0; i < 50; i++) {
        const frame = gen.generateFrame([def]);
        const decoded = decoder.decode(frame, def);
        expect(decoded).toBeGreaterThanOrEqual(def.minValue!);
        expect(decoded).toBeLessThanOrEqual(def.maxValue!);
      }
    });

    it('unsigned 16-bit with scale and offset: round-trip within range', () => {
      const def = makeDef({
        bitOffset: 0,
        bitLength: 16,
        encoding: 'unsigned',
        scaleFactor: 0.1,
        offsetValue: -20,
        minValue: -20,
        maxValue: 6533.5,
        byteOrder: 'big_endian',
      });

      for (let i = 0; i < 50; i++) {
        const frame = gen.generateFrame([def]);
        const decoded = decoder.decode(frame, def);
        expect(decoded).toBeGreaterThanOrEqual(def.minValue! - 0.1);
        expect(decoded).toBeLessThanOrEqual(def.maxValue! + 0.1);
      }
    });

    it('signed 8-bit: round-trip within range', () => {
      const def = makeDef({
        bitOffset: 0,
        bitLength: 8,
        encoding: 'signed',
        scaleFactor: 1,
        offsetValue: 0,
        minValue: -50,
        maxValue: 50,
        byteOrder: 'big_endian',
      });

      for (let i = 0; i < 50; i++) {
        const frame = gen.generateFrame([def]);
        const decoded = decoder.decode(frame, def);
        expect(decoded).toBeGreaterThanOrEqual(def.minValue!);
        expect(decoded).toBeLessThanOrEqual(def.maxValue!);
      }
    });

    it('bcd 16-bit: round-trip within range', () => {
      const def = makeDef({
        bitOffset: 0,
        bitLength: 16,
        encoding: 'bcd',
        scaleFactor: 1,
        offsetValue: 0,
        minValue: 0,
        maxValue: 9999,
        byteOrder: 'big_endian',
      });

      for (let i = 0; i < 50; i++) {
        const frame = gen.generateFrame([def]);
        const decoded = decoder.decode(frame, def);
        expect(decoded).toBeGreaterThanOrEqual(def.minValue!);
        expect(decoded).toBeLessThanOrEqual(def.maxValue!);
      }
    });

    it('little endian 16-bit unsigned: round-trip within range', () => {
      const def = makeDef({
        bitOffset: 0,
        bitLength: 16,
        encoding: 'unsigned',
        scaleFactor: 0.5,
        offsetValue: 10,
        minValue: 10,
        maxValue: 32777.5,
        byteOrder: 'little_endian',
      });

      for (let i = 0; i < 50; i++) {
        const frame = gen.generateFrame([def]);
        const decoded = decoder.decode(frame, def);
        expect(decoded).toBeGreaterThanOrEqual(def.minValue! - 0.5);
        expect(decoded).toBeLessThanOrEqual(def.maxValue! + 0.5);
      }
    });

    it('specific value round-trip: encode then decode returns close value', () => {
      const def = makeDef({
        bitOffset: 0,
        bitLength: 8,
        encoding: 'unsigned',
        scaleFactor: 1,
        offsetValue: 0,
        minValue: 0,
        maxValue: 255,
        byteOrder: 'big_endian',
      });

      const values = new Map([['sig-1', 42]]);
      const frame = gen.generateFrameWithValues([def], values);
      const decoded = decoder.decode(frame, def);
      expect(decoded).toBe(42);
    });

    it('specific signed value round-trip', () => {
      const def = makeDef({
        bitOffset: 0,
        bitLength: 8,
        encoding: 'signed',
        scaleFactor: 2,
        offsetValue: 50,
        minValue: -206,
        maxValue: 304,
        byteOrder: 'big_endian',
      });

      // value = -10 → raw = (-10 - 50) / 2 = -30 → signed encode → decode should give -10
      const values = new Map([['sig-1', -10]]);
      const frame = gen.generateFrameWithValues([def], values);
      const decoded = decoder.decode(frame, def);
      expect(decoded).toBe(-10);
    });

    it('multiple signals in one frame: each decodes within range', () => {
      const def1 = makeDef({
        signalId: 'sig-1' as SignalId,
        bitOffset: 0,
        bitLength: 8,
        encoding: 'unsigned',
        scaleFactor: 1,
        offsetValue: 0,
        minValue: 0,
        maxValue: 100,
      });
      const def2 = makeDef({
        signalId: 'sig-2' as SignalId,
        bitOffset: 8,
        bitLength: 8,
        encoding: 'unsigned',
        scaleFactor: 1,
        offsetValue: 0,
        minValue: 50,
        maxValue: 200,
      });

      for (let i = 0; i < 30; i++) {
        const frame = gen.generateFrame([def1, def2]);
        const d1 = decoder.decode(frame, def1);
        const d2 = decoder.decode(frame, def2);
        expect(d1).toBeGreaterThanOrEqual(def1.minValue!);
        expect(d1).toBeLessThanOrEqual(def1.maxValue!);
        expect(d2).toBeGreaterThanOrEqual(def2.minValue!);
        expect(d2).toBeLessThanOrEqual(def2.maxValue!);
      }
    });
  });
});
