import type { AdapterId } from '@connectedicd/shared-types';

export type AdapterStatus = 'available' | 'connected' | 'disconnected' | 'error';

export interface AdapterInfo {
  id: AdapterId;
  name: string;
  protocol: string;
  status: AdapterStatus;
}

export interface AdapterConfig {
  /** Protocol-specific configuration (baud rate, bus speed, etc.) */
  params?: Record<string, unknown>;
  /** Connection timeout in milliseconds */
  timeoutMs?: number;
}

export interface AdapterConnection {
  adapterId: AdapterId;
  status: AdapterStatus;
  connectedAt: Date;
  metadata: Record<string, unknown>;
}

/**
 * Interface that real hardware drivers implement.
 * Each driver handles a specific bus interface type.
 */
export interface AdapterDriver {
  /** Discover adapters available through this driver */
  discover(): Promise<AdapterInfo[]>;
  /** Connect to a specific adapter */
  connect(adapterId: AdapterId, config: AdapterConfig): Promise<AdapterConnection>;
  /** Disconnect from a specific adapter */
  disconnect(adapterId: AdapterId): Promise<void>;
}
