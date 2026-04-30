/**
 * ConnectedICD RL Actions + Dependency Graph + Logger
 *
 * Actions: generate ICD, validate interface, detect conflicts,
 * trace impact, diff versions, export for other products.
 *
 * Same JSON format as AssureFlow RL logger (TASK-060/063).
 * policy_intent added per TASK-063: logs what the agent intended
 * when a dependency gate blocks an action.
 */
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

// ─── Actions ───

export const CONNECTEDICD_ACTIONS = [
  'generate_icd',
  'validate_interface',
  'detect_conflicts',
  'trace_impact',
  'diff_versions',
  'export_icd',
] as const;

export type ConnectedICDAction = typeof CONNECTEDICD_ACTIONS[number];

// ─── Dependency Graph ───

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

export interface ArtifactState {
  id: string;
  type: string;
  score: number;
  critical_violations: number;
  version: number;
}

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

// ─── RL Logger (same format as AssureFlow shared/rl-logger) ───

export interface PolicyIntent {
  intended_action: string;
  intended_params: Record<string, unknown>;
  expected_reward: number | null;
}

export interface BlockedAttempt {
  action: string;
  reason: string;
  /** TASK-063: what the agent intended without the constraint */
  policy_intent?: PolicyIntent;
}

export class RLLogger {
  private logPath: string;
  private step = 0;
  private blockedAttempts: BlockedAttempt[] = [];

  constructor(logPath: string) {
    this.logPath = logPath;
    const dir = dirname(logPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  /** Record a blocked attempt. policyIntent captures what the agent
   *  would have done without the constraint — used to evaluate gate tightness. */
  recordBlocked(action: string, reason: string, policyIntent?: PolicyIntent) {
    this.blockedAttempts.push({ action, reason, policy_intent: policyIntent });
  }

  log(entry: Record<string, unknown>): Record<string, unknown> {
    this.step++;
    const full = {
      ...entry,
      step: this.step,
      blocked_attempts: [...this.blockedAttempts],
      timestamp: new Date().toISOString(),
    };
    this.blockedAttempts = [];
    appendFileSync(this.logPath, JSON.stringify(full) + '\n');
    return full;
  }

  getStep() { return this.step; }
}
