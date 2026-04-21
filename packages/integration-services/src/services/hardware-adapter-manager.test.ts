import { describe, it, expect, beforeEach } from 'vitest';
import type { AdapterId } from '@connectedflow/shared-types';
import { HardwareAdapterManager } from './hardware-adapter-manager.js';
import { SimulatedAdapterDriver } from './simulated-adapter-driver.js';
import type { AdapterInfo } from './hardware-adapter-types.js';

describe('HardwareAdapterManager', () => {
  let manager: HardwareAdapterManager;
  let driver: SimulatedAdapterDriver;

  beforeEach(() => {
    manager = new HardwareAdapterManager();
    driver = new SimulatedAdapterDriver();
    manager.registerDriver(driver);
  });

  describe('discoverAdapters', () => {
    it('returns adapters from registered drivers', async () => {
      const adapters = await manager.discoverAdapters();
      expect(adapters).toHaveLength(2);
      expect(adapters[0].protocol).toBe('arinc429');
      expect(adapters[1].protocol).toBe('canbus');
    });

    it('returns empty array when no drivers registered', async () => {
      const emptyManager = new HardwareAdapterManager();
      const adapters = await emptyManager.discoverAdapters();
      expect(adapters).toEqual([]);
    });

    it('aggregates adapters from multiple drivers', async () => {
      const customAdapters: AdapterInfo[] = [
        { id: 'custom-0' as AdapterId, name: 'Custom', protocol: 'milstd1553', status: 'available' },
      ];
      manager.registerDriver(new SimulatedAdapterDriver(customAdapters));
      const adapters = await manager.discoverAdapters();
      expect(adapters).toHaveLength(3);
    });
  });

  describe('connectAdapter', () => {
    it('connects to an available adapter', async () => {
      const conn = await manager.connectAdapter('sim-arinc429-0' as AdapterId);
      expect(conn.status).toBe('connected');
      expect(conn.adapterId).toBe('sim-arinc429-0');
      expect(conn.connectedAt).toBeInstanceOf(Date);
    });

    it('passes config params to the connection metadata', async () => {
      const conn = await manager.connectAdapter('sim-canbus-0' as AdapterId, {
        params: { baudRate: 500000 },
      });
      expect(conn.metadata.baudRate).toBe(500000);
    });

    it('throws when adapter already connected', async () => {
      await manager.connectAdapter('sim-arinc429-0' as AdapterId);
      await expect(
        manager.connectAdapter('sim-arinc429-0' as AdapterId),
      ).rejects.toThrow('already connected');
    });

    it('throws when no driver found for adapter', async () => {
      await expect(
        manager.connectAdapter('nonexistent' as AdapterId),
      ).rejects.toThrow('No driver found');
    });
  });

  describe('disconnectAdapter', () => {
    it('disconnects a connected adapter', async () => {
      await manager.connectAdapter('sim-arinc429-0' as AdapterId);
      await manager.disconnectAdapter('sim-arinc429-0' as AdapterId);
      expect(manager.getConnection('sim-arinc429-0' as AdapterId)).toBeUndefined();
    });

    it('throws when adapter not connected', async () => {
      await expect(
        manager.disconnectAdapter('sim-arinc429-0' as AdapterId),
      ).rejects.toThrow('not connected');
    });

    it('marks session as interrupted on disconnect if session active', async () => {
      await manager.connectAdapter('sim-arinc429-0' as AdapterId);
      manager.markSessionActive('sim-arinc429-0' as AdapterId);

      // Get connection before disconnect to inspect metadata mutation
      const conn = manager.getConnection('sim-arinc429-0' as AdapterId)!;
      await manager.disconnectAdapter('sim-arinc429-0' as AdapterId);

      expect(conn.metadata.interruptedSession).toBe(true);
      expect(conn.status).toBe('disconnected');
    });
  });

  describe('connection registry', () => {
    it('tracks active connections', async () => {
      expect(manager.getActiveConnections()).toHaveLength(0);
      await manager.connectAdapter('sim-arinc429-0' as AdapterId);
      expect(manager.getActiveConnections()).toHaveLength(1);
      await manager.connectAdapter('sim-canbus-0' as AdapterId);
      expect(manager.getActiveConnections()).toHaveLength(2);
    });

    it('removes connection on disconnect', async () => {
      await manager.connectAdapter('sim-arinc429-0' as AdapterId);
      await manager.disconnectAdapter('sim-arinc429-0' as AdapterId);
      expect(manager.getActiveConnections()).toHaveLength(0);
    });
  });
});
