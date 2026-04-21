import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdapterId, SessionId, SignalId } from '@connectedflow/shared-types';
import {
  SessionRecorder,
  type SessionRecorderDb,
  type RecordedReading,
  type SessionSummary,
} from './session-recorder.js';
import type { LiveDataEvent } from './live-data-monitor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(overrides: Partial<SessionRecorderDb> = {}): SessionRecorderDb {
  return {
    insertReading: vi.fn().mockResolvedValue(undefined),
    queryBySession: vi.fn().mockResolvedValue([]),
    getSummary: vi.fn().mockResolvedValue({
      sessionId: 'sess-1' as SessionId,
      totalReadings: 0,
      startTime: null,
      endTime: null,
      signalCount: 0,
    } satisfies SessionSummary),
    ...overrides,
  };
}

function makeEvent(overrides: Partial<LiveDataEvent> = {}): LiveDataEvent {
  return {
    timestamp: Date.now(),
    adapterId: 'adapter-1' as AdapterId,
    channel: 'ch-1' as any,
    rawData: Buffer.from([0x01, 0x02]),
    decoded: [
      { signalId: 'sig-1' as SignalId, name: 'Temp', decodedValue: 25.5, units: '°C' },
    ],
    deviations: [],
    ...overrides,
  };
}

const SESSION = 'sess-1' as SessionId;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionRecorder', () => {
  let db: SessionRecorderDb;
  let recorder: SessionRecorder;

  beforeEach(() => {
    db = makeDb();
    recorder = new SessionRecorder(db);
  });

  // -------------------------------------------------------------------------
  // startRecording / stopRecording / isRecording
  // -------------------------------------------------------------------------

  describe('recording lifecycle', () => {
    it('starts and stops recording for a session', () => {
      expect(recorder.isRecording(SESSION)).toBe(false);
      recorder.startRecording(SESSION);
      expect(recorder.isRecording(SESSION)).toBe(true);
      recorder.stopRecording(SESSION);
      expect(recorder.isRecording(SESSION)).toBe(false);
    });

    it('stopping an unrecorded session is a no-op', () => {
      expect(() => recorder.stopRecording(SESSION)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // recordEvent
  // -------------------------------------------------------------------------

  describe('recordEvent', () => {
    it('does not persist when session is not recording', async () => {
      await recorder.recordEvent(SESSION, makeEvent());
      expect(db.insertReading).not.toHaveBeenCalled();
    });

    it('persists one reading per decoded parameter', async () => {
      recorder.startRecording(SESSION);
      const event = makeEvent({
        decoded: [
          { signalId: 'sig-1' as SignalId, name: 'A', decodedValue: 10, units: 'V' },
          { signalId: 'sig-2' as SignalId, name: 'B', decodedValue: 20, units: 'A' },
        ],
      });
      await recorder.recordEvent(SESSION, event);
      expect(db.insertReading).toHaveBeenCalledTimes(2);
    });

    it('marks in-range readings correctly', async () => {
      recorder.startRecording(SESSION);
      await recorder.recordEvent(SESSION, makeEvent());
      const call = (db.insertReading as ReturnType<typeof vi.fn>).mock.calls[0][0] as RecordedReading;
      expect(call.inRange).toBe(true);
      expect(call.deviationSeverity).toBeNull();
    });

    it('marks out-of-range readings with deviation severity', async () => {
      recorder.startRecording(SESSION);
      const event = makeEvent({
        decoded: [
          { signalId: 'sig-1' as SignalId, name: 'Temp', decodedValue: 999, units: '°C' },
        ],
        deviations: [
          { signalId: 'sig-1' as SignalId, name: 'Temp', decodedValue: 999, min: 0, max: 100, severity: 'error' },
        ],
      });
      await recorder.recordEvent(SESSION, event);
      const call = (db.insertReading as ReturnType<typeof vi.fn>).mock.calls[0][0] as RecordedReading;
      expect(call.inRange).toBe(false);
      expect(call.deviationSeverity).toBe('error');
    });

    it('includes correct sessionId and adapterId in persisted reading', async () => {
      recorder.startRecording(SESSION);
      const event = makeEvent({ adapterId: 'adapter-99' as AdapterId });
      await recorder.recordEvent(SESSION, event);
      const call = (db.insertReading as ReturnType<typeof vi.fn>).mock.calls[0][0] as RecordedReading;
      expect(call.sessionId).toBe(SESSION);
      expect(call.adapterId).toBe('adapter-99');
    });
  });

  // -------------------------------------------------------------------------
  // queryRecordings
  // -------------------------------------------------------------------------

  describe('queryRecordings', () => {
    it('delegates to db.queryBySession', async () => {
      const expected: RecordedReading[] = [
        {
          time: new Date(),
          sessionId: SESSION,
          signalId: 'sig-1' as SignalId,
          rawValue: null,
          decodedValue: 42,
          inRange: true,
          deviationSeverity: null,
          adapterId: 'adapter-1' as AdapterId,
        },
      ];
      db = makeDb({ queryBySession: vi.fn().mockResolvedValue(expected) });
      recorder = new SessionRecorder(db);

      const result = await recorder.queryRecordings(SESSION);
      expect(result).toEqual(expected);
      expect(db.queryBySession).toHaveBeenCalledWith(SESSION, undefined);
    });

    it('passes time range to db', async () => {
      const range = { start: new Date('2024-01-01'), end: new Date('2024-01-02') };
      await recorder.queryRecordings(SESSION, range);
      expect(db.queryBySession).toHaveBeenCalledWith(SESSION, range);
    });
  });

  // -------------------------------------------------------------------------
  // getSessionSummary
  // -------------------------------------------------------------------------

  describe('getSessionSummary', () => {
    it('returns summary from db', async () => {
      const summary: SessionSummary = {
        sessionId: SESSION,
        totalReadings: 150,
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        signalCount: 5,
      };
      db = makeDb({ getSummary: vi.fn().mockResolvedValue(summary) });
      recorder = new SessionRecorder(db);

      const result = await recorder.getSessionSummary(SESSION);
      expect(result).toEqual(summary);
      expect(db.getSummary).toHaveBeenCalledWith(SESSION);
    });
  });
});
