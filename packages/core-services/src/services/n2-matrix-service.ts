/**
 * N² Interface Matrix — system-to-system signal count matrix.
 * Shows which systems communicate, how many signals, and validation status.
 */
import { type Knex } from 'knex';

export interface N2Cell {
  sourceSystem: string;
  destSystem: string;
  signalCount: number;
  errorCount: number;
  warningCount: number;
  status: 'green' | 'yellow' | 'red' | 'gray';
  signals: { id: string; name: string; protocol: string; status: string }[];
}

export interface N2Matrix {
  systems: string[];
  cells: N2Cell[];
  totalSignals: number;
  totalErrors: number;
}

export class N2MatrixService {
  constructor(private db: Knex) {}

  async generate(projectId?: string): Promise<N2Matrix> {
    // Get all signals with their logical layer
    let query = this.db('signals').leftJoin('logical_layers', 'signals.id', 'logical_layers.signal_id');
    if (projectId) query = query.where('signals.project_id', projectId);
    const signals = await query.select('signals.*', 'logical_layers.source_system', 'logical_layers.dest_system', 'logical_layers.data_type', 'logical_layers.refresh_rate_ms');

    // Extract unique systems
    const systemSet = new Set<string>();
    for (const s of signals) {
      if (s.source_system) systemSet.add(s.source_system);
      if (s.dest_system) systemSet.add(s.dest_system);
    }
    const systems = Array.from(systemSet).sort();

    // Build matrix cells
    const cellMap = new Map<string, N2Cell>();
    for (const s of signals) {
      const key = `${s.source_system}→${s.dest_system}`;
      if (!cellMap.has(key)) {
        cellMap.set(key, { sourceSystem: s.source_system, destSystem: s.dest_system, signalCount: 0, errorCount: 0, warningCount: 0, status: 'gray', signals: [] });
      }
      const cell = cellMap.get(key)!;
      cell.signalCount++;
      cell.signals.push({ id: s.id, name: s.name, protocol: s.protocol ?? 'unknown', status: s.status });
      // Simple validation: deprecated signals are warnings, missing data type is error
      if (s.status === 'deprecated') cell.warningCount++;
      if (!s.data_type) cell.errorCount++;
    }

    // Set cell status colors
    for (const cell of cellMap.values()) {
      if (cell.errorCount > 0) cell.status = 'red';
      else if (cell.warningCount > 0) cell.status = 'yellow';
      else if (cell.signalCount > 0) cell.status = 'green';
    }

    return {
      systems,
      cells: Array.from(cellMap.values()),
      totalSignals: signals.length,
      totalErrors: Array.from(cellMap.values()).reduce((s, c) => s + c.errorCount, 0),
    };
  }
}
