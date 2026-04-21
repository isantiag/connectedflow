/**
 * Traceability Service — manages bidirectional links between signals and
 * upstream requirements in DOORS or Jama.
 *
 * Uses an abstracted DB interface (TraceLinkDb) for testability.
 */

import type { SignalId, TraceLinkId } from '@connectedicd/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RequirementTool = 'doors' | 'jama';
export type LinkStatus = 'active' | 'stale' | 'broken';

export interface TraceLink {
  id: TraceLinkId;
  signalId: SignalId;
  requirementTool: RequirementTool;
  externalRequirementId: string;
  requirementText: string;
  linkStatus: LinkStatus;
  lastSyncedAt: Date;
  direction: 'bidirectional';
}

export interface RequirementRef {
  tool: RequirementTool;
  externalId: string;
  text: string;
}

export interface ReqToolConfig {
  tool: RequirementTool;
  baseUrl: string;
  apiKey: string;
  projectId: string;
}

export interface ReqChange {
  linkId: TraceLinkId;
  signalId: SignalId;
  externalRequirementId: string;
  previousText: string;
  newText: string;
}

export interface SyncResult {
  synced: number;
  staleDetected: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Abstracted DB interface
// ---------------------------------------------------------------------------

export interface TraceLinkDb {
  insert(link: Omit<TraceLink, 'id'>): Promise<TraceLink>;
  delete(id: TraceLinkId): Promise<boolean>;
  findBySignal(signalId: SignalId): Promise<TraceLink[]>;
  findAll(): Promise<TraceLink[]>;
  update(id: TraceLinkId, patch: Partial<TraceLink>): Promise<TraceLink | undefined>;
}

/** Callback invoked when a requirement change makes a link stale. */
export type StaleNotificationCallback = (change: ReqChange) => void;

/**
 * Simulates fetching current requirement text from an external tool.
 * In production this would call the DOORS/Jama REST API.
 */
export type ExternalRequirementFetcher = (
  config: ReqToolConfig,
  externalId: string,
) => Promise<string | null>;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TraceabilityService {
  private changeCallbacks: Array<(change: ReqChange) => void> = [];

  constructor(
    private readonly db: TraceLinkDb,
    private readonly fetchRequirement?: ExternalRequirementFetcher,
  ) {}

  // -----------------------------------------------------------------------
  // Link management
  // -----------------------------------------------------------------------

  async linkToRequirement(signalId: SignalId, ref: RequirementRef): Promise<TraceLink> {
    return this.db.insert({
      signalId,
      requirementTool: ref.tool,
      externalRequirementId: ref.externalId,
      requirementText: ref.text,
      linkStatus: 'active',
      lastSyncedAt: new Date(),
      direction: 'bidirectional',
    });
  }

  async unlinkRequirement(linkId: TraceLinkId): Promise<void> {
    await this.db.delete(linkId);
  }

  async getTraceLinks(signalId: SignalId): Promise<TraceLink[]> {
    return this.db.findBySignal(signalId);
  }

  // -----------------------------------------------------------------------
  // Sync & stale detection
  // -----------------------------------------------------------------------

  /**
   * Syncs all trace links for the given tool config.
   * For each link, fetches the current requirement text from the external tool.
   * If the text has changed, transitions the link to 'stale' and fires a notification.
   */
  async syncRequirements(config: ReqToolConfig): Promise<SyncResult> {
    const fetcher = this.fetchRequirement ?? defaultFetcher;
    const allLinks = await this.db.findAll();
    const relevant = allLinks.filter((l) => l.requirementTool === config.tool);

    let synced = 0;
    let staleDetected = 0;
    const errors: string[] = [];

    for (const link of relevant) {
      try {
        const currentText = await fetcher(config, link.externalRequirementId);

        if (currentText === null) {
          // Requirement no longer exists — mark broken
          await this.db.update(link.id, { linkStatus: 'broken', lastSyncedAt: new Date() });
          synced++;
          continue;
        }

        if (currentText !== link.requirementText) {
          // Requirement changed — mark stale and notify
          await this.db.update(link.id, {
            linkStatus: 'stale',
            lastSyncedAt: new Date(),
          });
          staleDetected++;

          const change: ReqChange = {
            linkId: link.id,
            signalId: link.signalId,
            externalRequirementId: link.externalRequirementId,
            previousText: link.requirementText,
            newText: currentText,
          };
          this.notifyChange(change);
        } else {
          // No change — refresh sync timestamp
          await this.db.update(link.id, { lastSyncedAt: new Date() });
        }
        synced++;
      } catch (err) {
        errors.push(`Failed to sync ${link.externalRequirementId}: ${String(err)}`);
      }
    }

    return { synced, staleDetected, errors };
  }

  // -----------------------------------------------------------------------
  // Notification
  // -----------------------------------------------------------------------

  onRequirementChanged(callback: (change: ReqChange) => void): void {
    this.changeCallbacks.push(callback);
  }

  private notifyChange(change: ReqChange): void {
    for (const cb of this.changeCallbacks) {
      cb(change);
    }
  }
}

// ---------------------------------------------------------------------------
// Default (mock) fetcher — always returns the same text (no change)
// ---------------------------------------------------------------------------

const defaultFetcher: ExternalRequirementFetcher = async (_config, _externalId) => {
  return null; // simulate requirement not found
};
