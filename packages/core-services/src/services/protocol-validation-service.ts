/**
 * Protocol Validation Service — plugin-based architecture for protocol-specific validation.
 *
 * Manages a registry of protocol plugins and delegates validation, schema retrieval,
 * and (future) migration/bus-loading analysis to the appropriate plugin.
 */

import type { Knex } from 'knex';
import type { ValidationResult, BusId } from '@connectedflow/shared-types';
import type { ProtocolPlugin, JSONSchema, MigrationResult } from './protocols/protocol-plugin.js';
import { Arinc429Plugin } from './protocols/arinc429-plugin.js';
import { CanBusPlugin } from './protocols/canbus-plugin.js';
import { MilStd1553Plugin } from './protocols/milstd1553-plugin.js';
import { Arinc664Plugin } from './protocols/arinc664-plugin.js';
import { BusLoadingAnalyzer, type BusUtilizationReport } from './bus-loading-analyzer.js';

export class ProtocolValidationService {
  private readonly plugins = new Map<string, ProtocolPlugin>();
  private busLoadingAnalyzer: BusLoadingAnalyzer | null = null;

  constructor(knex?: Knex) {
    if (knex) {
      this.busLoadingAnalyzer = new BusLoadingAnalyzer(knex);
    }
    // Register built-in plugins
    this.registerPlugin(new Arinc429Plugin());
    this.registerPlugin(new CanBusPlugin());
    this.registerPlugin(new MilStd1553Plugin());
    this.registerPlugin(new Arinc664Plugin());
  }

  /** Register a protocol plugin. Overwrites any existing plugin for the same protocolId. */
  registerPlugin(plugin: ProtocolPlugin): void {
    this.plugins.set(plugin.protocolId, plugin);
  }

  /** Validate transport attributes against the specified protocol's rules. */
  validateTransport(protocolId: string, attrs: Record<string, unknown>): ValidationResult {
    const plugin = this.plugins.get(protocolId);
    if (!plugin) {
      return {
        valid: false,
        errors: [
          {
            field: 'protocolId',
            message: `Unknown protocol: ${protocolId}`,
            severity: 'error',
          },
        ],
      };
    }
    return plugin.validate(attrs);
  }

  /** Return the JSON field schema for a given protocol. */
  getFieldSchema(protocolId: string): JSONSchema | undefined {
    return this.plugins.get(protocolId)?.fieldSchema;
  }

  /** List all registered protocol IDs. */
  getRegisteredProtocols(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Migrate transport attributes from a source protocol to a target protocol.
   *
   * Delegates to the target plugin's `migrateFrom` method, which identifies
   * semantically compatible attributes to preserve, clears incompatible ones,
   * and flags fields needing manual review.
   */
  migrateProtocol(
    sourceProtocolId: string,
    sourceAttrs: Record<string, unknown>,
    targetProtocolId: string,
  ): MigrationResult {
    const targetPlugin = this.plugins.get(targetProtocolId);
    if (!targetPlugin) {
      return {
        preserved: [],
        cleared: Object.keys(sourceAttrs),
        needsReview: [],
        targetAttrs: {},
      };
    }

    const sourcePlugin = this.plugins.get(sourceProtocolId);
    if (!sourcePlugin) {
      return {
        preserved: [],
        cleared: Object.keys(sourceAttrs),
        needsReview: Object.keys(targetPlugin.fieldSchema),
        targetAttrs: {},
      };
    }

    // Same protocol — preserve everything
    if (sourceProtocolId === targetProtocolId) {
      return {
        preserved: Object.keys(sourceAttrs),
        cleared: [],
        needsReview: [],
        targetAttrs: { ...sourceAttrs },
      };
    }

    return targetPlugin.migrateFrom(sourceProtocolId, sourceAttrs);
  }

  /**
   * Analyze bus bandwidth utilization.
   *
   * Computes utilization as sum of (bitLength × refreshRateHz) / busBandwidthBps
   * for all signals assigned to the bus. Generates a warning when utilization exceeds 100%.
   *
   * Requires a Knex instance to have been provided at construction time.
   */
  async analyzeBusLoading(busId: BusId): Promise<BusUtilizationReport> {
    if (!this.busLoadingAnalyzer) {
      throw new Error(
        'analyzeBusLoading requires a database connection. Provide a Knex instance when constructing ProtocolValidationService.',
      );
    }
    return this.busLoadingAnalyzer.analyzeBusLoading(busId);
  }
}
