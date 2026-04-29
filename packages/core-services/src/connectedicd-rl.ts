/**
 * ConnectedICD RL Actions + Dependency Graph
 *
 * Actions: generate ICD, validate interface, detect conflicts,
 * trace impact, diff versions, export for other products.
 *
 * Dependencies:
 * - ICD generation requires: system architecture + interface list
 * - Validation requires: ICD (verified)
 * - Impact analysis requires: ICD + connected requirements (from AssureFlow)
 */

export const CONNECTEDICD_ACTIONS = [
  'generate_icd',
  'validate_interface',
  'detect_conflicts',
  'trace_impact',
  'diff_versions',
  'export_icd',
] as const;

export type ConnectedICDAction = typeof CONNECTEDICD_ACTIONS[number];

export interface QualityGate {
  min_score: number;
  max_critical_violations: number;
}

export interface DependencyNode {
  requires: string[];
  quality_gate: QualityGate;
  hard: boolean;
}

export type DependencyGraph = Record<string, DependencyNode>;

export const CONNECTEDICD_DEPENDENCY_GRAPH: DependencyGraph = {
  generate_icd: {
    requires: ['system_architecture', 'interface_list'],
    quality_gate: { min_score: 0, max_critical_violations: 999 },
    hard: true,
  },
  validate_interface: {
    requires: ['icd'],
    quality_gate: { min_score: 280, max_critical_violations: 0 },
    hard: true,
  },
  detect_conflicts: {
    requires: ['icd'],
    quality_gate: { min_score: 280, max_critical_violations: 0 },
    hard: true,
  },
  trace_impact: {
    requires: ['icd', 'connected_requirements'],
    quality_gate: { min_score: 280, max_critical_violations: 0 },
    hard: true,
  },
  diff_versions: {
    requires: ['icd'],
    quality_gate: { min_score: 0, max_critical_violations: 999 },
    hard: false,
  },
  export_icd: {
    requires: ['icd'],
    quality_gate: { min_score: 280, max_critical_violations: 0 },
    hard: true,
  },
};

// Re-export RL logger types for ConnectedICD consumers
export interface ArtifactState {
  id: string;
  type: string;
  score: number;
  critical_violations: number;
  version: number;
}

export function checkDependencyGate(
  action: string,
  graph: DependencyGraph,
  completedArtifacts: ArtifactState[],
): { required: string[]; gate_passed: boolean; details: Record<string, { score: number; critical_violations: number; meets_gate: boolean }> } {
  const node = graph[action];
  if (!node) return { required: [], gate_passed: true, details: {} };
  const details: Record<string, { score: number; critical_violations: number; meets_gate: boolean }> = {};
  let allPassed = true;
  for (const req of node.requires) {
    const artifact = completedArtifacts.find(a => a.type === req);
    if (!artifact) {
      details[req] = { score: 0, critical_violations: 0, meets_gate: false };
      if (node.hard) allPassed = false;
    } else {
      const meets = artifact.score >= node.quality_gate.min_score &&
        artifact.critical_violations <= node.quality_gate.max_critical_violations;
      details[req] = { score: artifact.score, critical_violations: artifact.critical_violations, meets_gate: meets };
      if (!meets && node.hard) allPassed = false;
    }
  }
  return { required: node.requires, gate_passed: allPassed, details };
}
