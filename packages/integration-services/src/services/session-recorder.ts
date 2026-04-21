import type { SessionId, SignalId, AdapterId } from '@connectedflow/shared-types';
import type { LiveDataEvent } from './live-data-monitor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface RecordedReading {
  time: Date;
  sessionId: SessionId;
  signalId: SignalId;
  rawValue: Buffer | null;
  decodedValue: number;
  inRange: boolean;
  deviationSeverity: string | null;
  adapterId: AdapterId;
}

export interface SessionSummary {
  sessionId: SessionId;
  totalReadings: number;
  startTime: Date | null;
  endTime: Date | null;
  signalCount: number;
}

// ---------------------------------------------------------------------------
// Database interface (abstracted for testability)
// ---------------------------------------------------------------------------

export interface SessionRecorderDb {
  insertReading(reading: RecordedReading): Promise<void>;
  queryBySession(sessionId: SessionId, timeRange?: TimeRange): Promise<RecordedReading[]>;
  getSummary(sessionId: SessionId): Promise<SessionSummary>;
}

// ---------------------------------------------------------------------------
// SessionRecorder
// ---------------------------------------------------------------------------

/**
 * Records live data events to the `live_parameter_readings` TimescaleDB
 * hypertable and supports querying recorded data by session and time range.
 */
export class SessionRecorder {
  private activeSessions = new Set<SessionId>();
  private db: SessionRecorderDb;

  constructor(db: SessionRecorderDb) {
    this.db = db;
  }

  /** Begin recording events for a session. */
  startRecording(sessionId: SessionId): void {
    this.activeSessions.add(sessionId);
  }

  /** Stop recording events for a session. */
  stopRecording(sessionId: SessionId): void {
    this.activeSessions.delete(sessionId);
  }

  /** Returns true if the given session is currently being recorded. */
  isRecording(sessionId: SessionId): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Record a single LiveDataEvent. Persists one row per decoded parameter.
   * Only records if the session is actively being recorded.
   */
  async recordEvent(sessionId: SessionId, event: LiveDataEvent): Promise<void> {
    if (!this.activeSessions.has(sessionId)) {
      return;
    }

    const time = new Date(event.timestamp);

    for (const param of event.decoded) {
      const deviation = event.deviations.find((d) => d.signalId === param.signalId);
      await this.db.insertReading({
        time,
        sessionId,
        signalId: param.signalId,
        rawValue: event.rawData,
        decodedValue: param.decodedValue,
        inRange: deviation === null || deviation === undefined,
        deviationSeverity: deviation?.severity ?? null,
        adapterId: event.adapterId,
      });
    }
  }

  /** Query recorded data by session ID and optional time range. */
  async queryRecordings(
    sessionId: SessionId,
    timeRange?: TimeRange,
  ): Promise<RecordedReading[]> {
    return this.db.queryBySession(sessionId, timeRange);
  }

  /** Get summary stats for a recorded session. */
  async getSessionSummary(sessionId: SessionId): Promise<SessionSummary> {
    return this.db.getSummary(sessionId);
  }
}
