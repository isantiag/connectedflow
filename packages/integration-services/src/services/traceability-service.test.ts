import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SignalId, TraceLinkId } from '@connectedicd/shared-types';
import {
  TraceabilityService,
  type TraceLinkDb,
  type TraceLink,
  type ReqToolConfig,
  type ReqChange,
  type ExternalRequirementFetcher,
} from './traceability-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

function makeDb(overrides: Partial<TraceLinkDb> = {}): TraceLinkDb {
  return {
    insert: vi.fn().mockImplementation(async (data) => ({
      id: `tl-${++idCounter}` as TraceLinkId,
      ...data,
    })),
    delete: vi.fn().mockResolvedValue(true),
    findBySignal: vi.fn().mockResolvedValue([]),
    findAll: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockImplementation(async (id, patch) => ({
      id,
      ...patch,
    })),
    ...overrides,
  };
}

function makeLink(overrides: Partial<TraceLink> = {}): TraceLink {
  return {
    id: 'tl-1' as TraceLinkId,
    signalId: 'sig-1' as SignalId,
    requirementTool: 'doors',
    externalRequirementId: 'REQ-001',
    requirementText: 'The system shall do X',
    linkStatus: 'active',
    lastSyncedAt: new Date(),
    direction: 'bidirectional',
    ...overrides,
  };
}

const SIGNAL_ID = 'sig-1' as SignalId;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TraceabilityService', () => {
  let db: TraceLinkDb;
  let service: TraceabilityService;

  beforeEach(() => {
    idCounter = 0;
    db = makeDb();
    service = new TraceabilityService(db);
  });

  // -----------------------------------------------------------------------
  // linkToRequirement
  // -----------------------------------------------------------------------

  describe('linkToRequirement', () => {
    it('creates a trace link with active status and bidirectional direction', async () => {
      const link = await service.linkToRequirement(SIGNAL_ID, {
        tool: 'doors',
        externalId: 'REQ-100',
        text: 'Shall provide altitude',
      });

      expect(link.signalId).toBe(SIGNAL_ID);
      expect(link.requirementTool).toBe('doors');
      expect(link.externalRequirementId).toBe('REQ-100');
      expect(link.requirementText).toBe('Shall provide altitude');
      expect(link.linkStatus).toBe('active');
      expect(link.direction).toBe('bidirectional');
      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it('supports jama as a requirement tool', async () => {
      const link = await service.linkToRequirement(SIGNAL_ID, {
        tool: 'jama',
        externalId: 'JAMA-42',
        text: 'Jama requirement',
      });

      expect(link.requirementTool).toBe('jama');
    });
  });

  // -----------------------------------------------------------------------
  // unlinkRequirement
  // -----------------------------------------------------------------------

  describe('unlinkRequirement', () => {
    it('deletes the trace link by id', async () => {
      const linkId = 'tl-99' as TraceLinkId;
      await service.unlinkRequirement(linkId);
      expect(db.delete).toHaveBeenCalledWith(linkId);
    });
  });

  // -----------------------------------------------------------------------
  // getTraceLinks
  // -----------------------------------------------------------------------

  describe('getTraceLinks', () => {
    it('returns all links for a signal', async () => {
      const links = [makeLink(), makeLink({ id: 'tl-2' as TraceLinkId })];
      db = makeDb({ findBySignal: vi.fn().mockResolvedValue(links) });
      service = new TraceabilityService(db);

      const result = await service.getTraceLinks(SIGNAL_ID);
      expect(result).toHaveLength(2);
      expect(db.findBySignal).toHaveBeenCalledWith(SIGNAL_ID);
    });

    it('returns empty array when no links exist', async () => {
      const result = await service.getTraceLinks(SIGNAL_ID);
      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // syncRequirements — stale detection
  // -----------------------------------------------------------------------

  describe('syncRequirements', () => {
    const config: ReqToolConfig = {
      tool: 'doors',
      baseUrl: 'https://doors.example.com',
      apiKey: 'key-123',
      projectId: 'proj-1',
    };

    it('marks link as stale when requirement text changes', async () => {
      const link = makeLink({ requirementText: 'Old text' });
      db = makeDb({ findAll: vi.fn().mockResolvedValue([link]) });
      const fetcher: ExternalRequirementFetcher = vi.fn().mockResolvedValue('New text');
      service = new TraceabilityService(db, fetcher);

      const result = await service.syncRequirements(config);

      expect(result.staleDetected).toBe(1);
      expect(db.update).toHaveBeenCalledWith(
        link.id,
        expect.objectContaining({ linkStatus: 'stale' }),
      );
    });

    it('fires notification callback when link becomes stale', async () => {
      const link = makeLink({ requirementText: 'Old text' });
      db = makeDb({ findAll: vi.fn().mockResolvedValue([link]) });
      const fetcher: ExternalRequirementFetcher = vi.fn().mockResolvedValue('New text');
      service = new TraceabilityService(db, fetcher);

      const callback = vi.fn();
      service.onRequirementChanged(callback);

      await service.syncRequirements(config);

      expect(callback).toHaveBeenCalledTimes(1);
      const change: ReqChange = callback.mock.calls[0][0];
      expect(change.previousText).toBe('Old text');
      expect(change.newText).toBe('New text');
      expect(change.signalId).toBe(link.signalId);
    });

    it('does not mark link as stale when text is unchanged', async () => {
      const link = makeLink({ requirementText: 'Same text' });
      db = makeDb({ findAll: vi.fn().mockResolvedValue([link]) });
      const fetcher: ExternalRequirementFetcher = vi.fn().mockResolvedValue('Same text');
      service = new TraceabilityService(db, fetcher);

      const result = await service.syncRequirements(config);

      expect(result.staleDetected).toBe(0);
      expect(result.synced).toBe(1);
    });

    it('marks link as broken when requirement no longer exists', async () => {
      const link = makeLink();
      db = makeDb({ findAll: vi.fn().mockResolvedValue([link]) });
      const fetcher: ExternalRequirementFetcher = vi.fn().mockResolvedValue(null);
      service = new TraceabilityService(db, fetcher);

      await service.syncRequirements(config);

      expect(db.update).toHaveBeenCalledWith(
        link.id,
        expect.objectContaining({ linkStatus: 'broken' }),
      );
    });

    it('only syncs links matching the config tool', async () => {
      const doorsLink = makeLink({ requirementTool: 'doors' });
      const jamaLink = makeLink({ id: 'tl-2' as TraceLinkId, requirementTool: 'jama' });
      db = makeDb({ findAll: vi.fn().mockResolvedValue([doorsLink, jamaLink]) });
      const fetcher: ExternalRequirementFetcher = vi.fn().mockResolvedValue('Same text');
      service = new TraceabilityService(db, fetcher);

      // Sync only doors
      await service.syncRequirements(config);

      // Fetcher should only be called for the doors link
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('reports errors without throwing', async () => {
      const link = makeLink();
      db = makeDb({ findAll: vi.fn().mockResolvedValue([link]) });
      const fetcher: ExternalRequirementFetcher = vi.fn().mockRejectedValue(new Error('Network'));
      service = new TraceabilityService(db, fetcher);

      const result = await service.syncRequirements(config);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Network');
    });
  });

  // -----------------------------------------------------------------------
  // onRequirementChanged
  // -----------------------------------------------------------------------

  describe('onRequirementChanged', () => {
    it('supports multiple callbacks', async () => {
      const link = makeLink({ requirementText: 'Old' });
      db = makeDb({ findAll: vi.fn().mockResolvedValue([link]) });
      const fetcher: ExternalRequirementFetcher = vi.fn().mockResolvedValue('New');
      service = new TraceabilityService(db, fetcher);

      const cb1 = vi.fn();
      const cb2 = vi.fn();
      service.onRequirementChanged(cb1);
      service.onRequirementChanged(cb2);

      await service.syncRequirements({
        tool: 'doors',
        baseUrl: '',
        apiKey: '',
        projectId: '',
      });

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });
});
