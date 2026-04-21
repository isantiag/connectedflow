/**
 * Bus Loading Analyzer — computes bandwidth utilization for a given bus.
 *
 * For each signal assigned to the bus, the bandwidth contribution is:
 *   bitLength × refreshRateHz  (bps)
 *
 * Utilization percentage = (sum of contributions / bus total bandwidth) × 100
 *
 * A warning is generated when utilization exceeds 100%.
 */

import type { Knex } from 'knex';
import type { BusId } from '@connectedflow/shared-types';

/** Per-signal bandwidth contribution detail. */
export interface SignalBandwidthContribution {
  signalId: string;
  signalName: string;
  bitLength: number;
  refreshRateHz: number;
  contributionBps: number;
}

/** Full bus utilization report. */
export interface BusUtilizationReport {
  busId: string;
  totalBandwidthBps: number;
  usedBandwidthBps: number;
  utilizationPercent: number;
  perSignalContributions: SignalBandwidthContribution[];
  warnings: string[];
}

export class BusLoadingAnalyzer {
  constructor(private readonly knex: Knex) {}

  async analyzeBusLoading(busId: BusId): Promise<BusUtilizationReport> {
    // 1. Fetch bus record to get total bandwidth
    const bus = await this.knex('bus').where({ id: busId }).first();
    if (!bus) {
      return {
        busId,
        totalBandwidthBps: 0,
        usedBandwidthBps: 0,
        utilizationPercent: 0,
        perSignalContributions: [],
        warnings: [`Bus '${busId}' not found`],
      };
    }

    const totalBandwidthBps: number = Number(bus.bandwidth_bps);

    // 2. Query all signals assigned to this bus, joining transport and logical layers
    const rows = await this.knex('transport_layer as t')
      .join('logical_layer as l', 't.signal_id', 'l.signal_id')
      .join('signal as s', 't.signal_id', 's.id')
      .where('t.bus_id', busId)
      .select(
        's.id as signal_id',
        's.name as signal_name',
        't.bit_length',
        'l.refresh_rate_hz',
      );

    // 3. Compute per-signal contributions
    const perSignalContributions: SignalBandwidthContribution[] = rows.map((row) => {
      const bitLength = Number(row.bit_length);
      const refreshRateHz = Number(row.refresh_rate_hz);
      return {
        signalId: row.signal_id,
        signalName: row.signal_name,
        bitLength,
        refreshRateHz,
        contributionBps: bitLength * refreshRateHz,
      };
    });

    // 4. Sum contributions
    const usedBandwidthBps = perSignalContributions.reduce(
      (sum, c) => sum + c.contributionBps,
      0,
    );

    // 5. Compute utilization percentage
    const utilizationPercent =
      totalBandwidthBps > 0 ? (usedBandwidthBps / totalBandwidthBps) * 100 : 0;

    // 6. Generate warnings
    const warnings: string[] = [];
    if (utilizationPercent > 100) {
      warnings.push(
        `Bus '${busId}' utilization is ${utilizationPercent.toFixed(1)}%, exceeding 100% capacity`,
      );
    }

    return {
      busId,
      totalBandwidthBps,
      usedBandwidthBps,
      utilizationPercent,
      perSignalContributions,
      warnings,
    };
  }
}
