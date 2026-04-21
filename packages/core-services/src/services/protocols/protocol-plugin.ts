/**
 * Protocol plugin interface for the protocol validation service.
 *
 * Each plugin defines a JSON schema for its protocol-specific fields
 * and validates transport attributes against the protocol specification.
 */

import type { ValidationResult } from '@connectedicd/shared-types';

/** JSON Schema-like descriptor for protocol-specific fields. */
export interface FieldSchemaEntry {
  type: 'number' | 'string' | 'integer';
  description: string;
  required: boolean;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
}

export type JSONSchema = Record<string, FieldSchemaEntry>;

/** Result of migrating transport attributes from one protocol to another. */
export interface MigrationResult {
  /** Fields that were preserved (semantically compatible between protocols). */
  preserved: string[];
  /** Fields that were cleared (no equivalent in target protocol). */
  cleared: string[];
  /** Fields that need manual review (partial compatibility or ambiguous mapping). */
  needsReview: string[];
  /** The new target protocol attributes after migration. */
  targetAttrs: Record<string, unknown>;
}

/** Interface that every protocol plugin must implement. */
export interface ProtocolPlugin {
  /** Unique protocol identifier, e.g. 'arinc429', 'canbus'. */
  readonly protocolId: string;

  /** Schema describing all protocol-specific fields and their constraints. */
  readonly fieldSchema: JSONSchema;

  /** Validate transport attributes against this protocol's specification. */
  validate(attrs: Record<string, unknown>): ValidationResult;

  /** Migrate attributes from a source protocol into this plugin's protocol. */
  migrateFrom(sourceProtocol: string, attrs: Record<string, unknown>): MigrationResult;
}
