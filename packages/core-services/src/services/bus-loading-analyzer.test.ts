import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusLoadingAnalyzer, type BusUtilizationReport } from './bus-loading-analyzer.js';
import type { BusId } from '@connectedflow/shared-types';

// ---------------------------------------------------------------------------
// Knex mock helpers
// ---------------------------------------------------------------------------

function createMockKnex(busRow: Record<string, unknown> | undefined, signalRows: Record<string, unknown>[]) {
  const chainable = {
    where: vi.fn().mockReturnThis(),
    join: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue(signalRows),
    first: vi.fn().mockResolvedValue(busRow),
  };

  const knex = vi.fn().mockReturnValue(chainable);
  return knex as unknown as import('knex').Knex;
}

const BUS_ID = 'bus-001' as BusId;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BusLoadingAnalyzer', () => {
  it('returns empty report with warning when bus is not found', async () => {
    const knex = createMockKnex(undefined, []);
    const analyzer = new BusLoadingAnalyzer(knex);

    const report = await analyzer.analyzeBusLoading(BUS_ID);

    expect(report.busId).toBe(BUS_ID);
    expect(report.totalBandwidthBps).toBe(0);
    expect(report.usedBandwidthBps).toBe(0);
    expect(report.utilizationPercent).toBe(0);
    expect(report.perSignalContributions).toEqual([]);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain('not found');
  });

  it('returns zero utilization when bus has no signals', async () => {
    const knex = createMockKnex({ id: BUS_ID, bandwidth_bps: 1_000_000 }, []);
    const analyzer = new BusLoadingAnalyzer(knex);

    const report = await analyzer.analyzeBusLoading(BUS_ID);

    expect(report.totalBandwidthBps).toBe(1_000_000);
    expect(report.usedBandwidthBps).toBe(0);
    expect(report.utilizationPercent).toBe(0);
    expect(report.perSignalContributions).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it('computes utilization correctly for a single signal', async () => {
    const busRow = { id: BUS_ID, bandwidth_bps: 1_000_000 };
    const signalRows = [
      { signal_id: 's1', signal_name: 'Airspeed', bit_length: 16, refresh_rate_hz: 50 },
    ];
    const knex = createMockKnex(busRow, signalRows);
    const analyzer = new BusLoadingAnalyzer(knex);

    const report = await analyzer.analyzeBusLoading(BUS_ID);

    // 16 bits × 50 Hz = 800 bps
    expect(report.usedBandwidthBps).toBe(800);
    expect(report.utilizationPercent).toBeCloseTo(0.08); // 800 / 1_000_000 * 100
    expect(report.perSignalContributions).toHaveLength(1);
    expect(report.perSignalContributions[0]!.contributionBps).toBe(800);
    expect(report.warnings).toEqual([]);
  });

  it('sums contributions from multiple signals', async () => {
    const busRow = { id: BUS_ID, bandwidth_bps: 10_000 };
    const signalRows = [
      { signal_id: 's1', signal_name: 'Sig1', bit_length: 16, refresh_rate_hz: 100 },
      { signal_id: 's2', signal_name: 'Sig2', bit_length: 32, refresh_rate_hz: 50 },
      { signal_id: 's3', signal_name: 'Sig3', bit_length: 8, refresh_rate_hz: 200 },
    ];
    const knex = createMockKnex(busRow, signalRows);
    const analyzer = new BusLoadingAnalyzer(knex);

    const report = await analyzer.analyzeBusLoading(BUS_ID);

    // s1: 16×100 = 1600, s2: 32×50 = 1600, s3: 8×200 = 1600 → total = 4800
    expect(report.usedBandwidthBps).toBe(4800);
    expect(report.utilizationPercent).toBeCloseTo(48); // 4800 / 10_000 * 100
    expect(report.perSignalContributions).toHaveLength(3);
    expect(report.warnings).toEqual([]);
  });

  it('generates warning when utilization exceeds 100%', async () => {
    const busRow = { id: BUS_ID, bandwidth_bps: 1000 };
    const signalRows = [
      { signal_id: 's1', signal_name: 'Heavy', bit_length: 32, refresh_rate_hz: 100 },
    ];
    const knex = createMockKnex(busRow, signalRows);
    const analyzer = new BusLoadingAnalyzer(knex);

    const report = await analyzer.analyzeBusLoading(BUS_ID);

    // 32 × 100 = 3200 bps on a 1000 bps bus → 320%
    expect(report.usedBandwidthBps).toBe(3200);
    expect(report.utilizationPercent).toBeCloseTo(320);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain('exceeding 100%');
  });

  it('does not warn at exactly 100% utilization', async () => {
    const busRow = { id: BUS_ID, bandwidth_bps: 1600 };
    const signalRows = [
      { signal_id: 's1', signal_name: 'Exact', bit_length: 16, refresh_rate_hz: 100 },
    ];
    const knex = createMockKnex(busRow, signalRows);
    const analyzer = new BusLoadingAnalyzer(knex);

    const report = await analyzer.analyzeBusLoading(BUS_ID);

    // 16 × 100 = 1600 bps on a 1600 bps bus → exactly 100%
    expect(report.utilizationPercent).toBeCloseTo(100);
    expect(report.warnings).toEqual([]);
  });

  it('includes correct per-signal contribution details', async () => {
    const busRow = { id: BUS_ID, bandwidth_bps: 100_000 };
    const signalRows = [
      { signal_id: 's1', signal_name: 'Alpha', bit_length: 8, refresh_rate_hz: 25 },
      { signal_id: 's2', signal_name: 'Beta', bit_length: 32, refresh_rate_hz: 10 },
    ];
    const knex = createMockKnex(busRow, signalRows);
    const analyzer = new BusLoadingAnalyzer(knex);

    const report = await analyzer.analyzeBusLoading(BUS_ID);

    const alpha = report.perSignalContributions.find((c) => c.signalId === 's1')!;
    expect(alpha.signalName).toBe('Alpha');
    expect(alpha.bitLength).toBe(8);
    expect(alpha.refreshRateHz).toBe(25);
    expect(alpha.contributionBps).toBe(200); // 8 × 25

    const beta = report.perSignalContributions.find((c) => c.signalId === 's2')!;
    expect(beta.signalName).toBe('Beta');
    expect(beta.bitLength).toBe(32);
    expect(beta.refreshRateHz).toBe(10);
    expect(beta.contributionBps).toBe(320); // 32 × 10
  });
});
