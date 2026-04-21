import type { AdapterId } from '@connectedicd/shared-types';
import type {
  AdapterConfig,
  AdapterConnection,
  AdapterDriver,
  AdapterInfo,
} from './hardware-adapter-types.js';

/**
 * Manages hardware adapter discovery, connection, and lifecycle.
 * Delegates to AdapterDriver implementations for actual hardware interaction.
 * Maintains a registry of active connections with graceful degradation on disconnect.
 */
export class HardwareAdapterManager {
  private drivers: AdapterDriver[] = [];
  private connections: Map<string, AdapterConnection> = new Map();
  private activeSessionAdapters: Set<string> = new Set();

  /** Register a driver that can discover and manage adapters. */
  registerDriver(driver: AdapterDriver): void {
    this.drivers.push(driver);
  }

  /** Mark an adapter as having an active monitoring/simulation session. */
  markSessionActive(adapterId: AdapterId): void {
    this.activeSessionAdapters.add(adapterId);
  }

  /** Clear the active session flag for an adapter. */
  clearSession(adapterId: AdapterId): void {
    this.activeSessionAdapters.delete(adapterId);
  }

  /** Discover all available adapters across registered drivers. */
  async discoverAdapters(): Promise<AdapterInfo[]> {
    const results: AdapterInfo[] = [];
    for (const driver of this.drivers) {
      const adapters = await driver.discover();
      results.push(...adapters);
    }
    return results;
  }

  /** Connect to an adapter by ID. Finds the appropriate driver and delegates. */
  async connectAdapter(adapterId: AdapterId, config: AdapterConfig = {}): Promise<AdapterConnection> {
    if (this.connections.has(adapterId)) {
      throw new Error(`Adapter already connected: ${adapterId}`);
    }

    const driver = await this.findDriverForAdapter(adapterId);
    if (!driver) {
      throw new Error(`No driver found for adapter: ${adapterId}`);
    }

    const connection = await driver.connect(adapterId, config);
    this.connections.set(adapterId, connection);
    return connection;
  }

  /**
   * Gracefully disconnect an adapter.
   * If an active session exists, marks it as interrupted before disconnecting.
   */
  async disconnectAdapter(adapterId: AdapterId): Promise<void> {
    const connection = this.connections.get(adapterId);
    if (!connection) {
      throw new Error(`Adapter not connected: ${adapterId}`);
    }

    // Graceful degradation: mark session as interrupted if active
    const hadActiveSession = this.activeSessionAdapters.has(adapterId);
    if (hadActiveSession) {
      this.activeSessionAdapters.delete(adapterId);
      connection.status = 'disconnected';
      connection.metadata.interruptedSession = true;
    }

    const driver = await this.findDriverForAdapter(adapterId);
    if (driver) {
      await driver.disconnect(adapterId);
    }

    this.connections.delete(adapterId);
  }

  /** Get the current connection for an adapter, if any. */
  getConnection(adapterId: AdapterId): AdapterConnection | undefined {
    return this.connections.get(adapterId);
  }

  /** Get all active connections. */
  getActiveConnections(): AdapterConnection[] {
    return [...this.connections.values()];
  }

  private async findDriverForAdapter(adapterId: AdapterId): Promise<AdapterDriver | undefined> {
    for (const driver of this.drivers) {
      const adapters = await driver.discover();
      if (adapters.some((a) => a.id === adapterId)) {
        return driver;
      }
    }
    return undefined;
  }
}
