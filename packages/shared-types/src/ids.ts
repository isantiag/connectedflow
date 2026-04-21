// Branded ID types for type-safe identifiers across the platform.
// Each ID is a string at runtime but distinct at the type level.

declare const __brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type SignalId = Brand<string, 'SignalId'>;
export type ProjectId = Brand<string, 'ProjectId'>;
export type BusId = Brand<string, 'BusId'>;
export type ProtocolId = Brand<string, 'ProtocolId'>;
export type ConnectorId = Brand<string, 'ConnectorId'>;
export type CableBundleId = Brand<string, 'CableBundleId'>;
export type BaselineId = Brand<string, 'BaselineId'>;
export type UserId = Brand<string, 'UserId'>;
export type RoleId = Brand<string, 'RoleId'>;
export type ChangeRequestId = Brand<string, 'ChangeRequestId'>;
export type AuditEntryId = Brand<string, 'AuditEntryId'>;
export type TraceLinkId = Brand<string, 'TraceLinkId'>;
export type AnomalyId = Brand<string, 'AnomalyId'>;
export type ParseJobId = Brand<string, 'ParseJobId'>;
export type AdapterId = Brand<string, 'AdapterId'>;
export type ChannelId = Brand<string, 'ChannelId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type EquipmentId = Brand<string, 'EquipmentId'>;
export type SnapshotId = Brand<string, 'SnapshotId'>;
