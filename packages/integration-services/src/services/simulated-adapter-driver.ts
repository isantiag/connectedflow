import type { AdapterId } from '@connectedicd/shared-types';
import type {
  AdapterConfig,
  AdapterConnection,
  AdapterDriver,
  AdapterInfo,
  AdapterStatus,
} from './hardware-adapter-types.js';

/**
 * Simulated adapter driver for testing and development.
 * Mimics hardware adapter behavior without real bus interfaces.
 */
export class SimulatedAdapterDriver implements AdapterDriver {
  private adapters: Map<string, AdapterInfo>;
  private connected: Set<string> = new Set();

  constructor(adapters?: AdapterInfo[]) {
    this.adapters = new Map(
      (adapters ?? SimulatedAdapterDriver.defaultAdapters()).map((a) => [a.id, a]),
    );
  }

  static defaultAdapters(): AdapterInfo[] {
    return [
      {
        id: 'sim-arinc429-0' as AdapterId,
        name: 'Simulated ARINC 429 Channel 0',
        protocol: 'arinc429',
        status: 'available',
      },
      {
        id: 'sim-canbus-0' as AdapterId,
        name: 'Simulated CAN Bus Channel 0',
        protocol: 'canbus',
        status: 'available',
      },
    ];
  }

  async discover(): Promise<AdapterInfo[]> {
    return [...this.adapters.values()].map((a) => ({
      ...a,
      status: this.connected.has(a.id) ? ('connected' as AdapterStatus) : a.status,
    }));
  }

  async connect(adapterId: AdapterId, config: AdapterConfig): Promise<AdapterConnection> {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw new Error(`Adapter not found: ${adapterId}`);
    }
    if (this.connected.has(adapterId)) {
      throw new Error(`Adapter already connected: ${adapterId}`);
    }

    this.connected.add(adapterId);
    adapter.status = 'connected';

    return {
      adapterId,
      status: 'connected',
      connectedAt: new Date(),
      metadata: {
        driver: 'simulated',
        protocol: adapter.protocol,
        ...(config.params ?? {}),
      },
    };
  }

  async disconnect(adapterId: AdapterId): Promise<void> {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw new Error(`Adapter not found: ${adapterId}`);
    }
    if (!this.connected.has(adapterId)) {
      throw new Error(`Adapter not connected: ${adapterId}`);
    }

    this.connected.delete(adapterId);
    adapter.status = 'available';
  }
}
