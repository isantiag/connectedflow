/**
 * Error thrown when an optimistic locking conflict is detected.
 *
 * Two users attempted to update the same signal from the same base version.
 * The API layer can map this to HTTP 409 Conflict.
 */
export class ConcurrentEditError extends Error {
  readonly signalId: string;
  readonly expectedVersion: number;

  constructor(signalId: string, expectedVersion: number) {
    super(
      `Concurrent edit conflict on signal ${signalId}: expected version ${expectedVersion} is stale`,
    );
    this.name = 'ConcurrentEditError';
    this.signalId = signalId;
    this.expectedVersion = expectedVersion;
  }
}

/**
 * Given two patches that target the same signal, identify which top-level
 * field groups conflict (i.e. both patches touch the same group).
 *
 * Returns an object with `conflicting` fields (both patches modify) and
 * `mergeable` fields (only one patch modifies).
 */
export interface MergeSuggestion {
  conflicting: string[];
  mergeable: string[];
}

export function suggestMerge(
  patchA: Record<string, unknown>,
  patchB: Record<string, unknown>,
): MergeSuggestion {
  const MERGE_FIELDS = ['name', 'status', 'criticality', 'logical', 'transport', 'physical'];

  const conflicting: string[] = [];
  const mergeable: string[] = [];

  for (const field of MERGE_FIELDS) {
    const aHas = patchA[field] !== undefined;
    const bHas = patchB[field] !== undefined;

    if (aHas && bHas) {
      conflicting.push(field);
    } else if (aHas || bHas) {
      mergeable.push(field);
    }
  }

  return { conflicting, mergeable };
}
