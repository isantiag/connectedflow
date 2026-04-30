import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { CONNECTEDICD_DEPENDENCY_GRAPH, CONNECTEDICD_ACTIONS, checkDependencyGate, RLLogger, type ArtifactState } from './connectedicd-rl.js';

const TEST_LOG = '/tmp/test_connectedicd_rl_log.jsonl';
beforeEach(() => { if (existsSync(TEST_LOG)) unlinkSync(TEST_LOG); });
afterEach(() => { if (existsSync(TEST_LOG)) unlinkSync(TEST_LOG); });

describe('ConnectedICD actions', () => {
  it('defines all 6 actions', () => {
    expect(CONNECTEDICD_ACTIONS).toHaveLength(6);
    expect(CONNECTEDICD_ACTIONS).toContain('generate_icd');
    expect(CONNECTEDICD_ACTIONS).toContain('validate_interface');
    expect(CONNECTEDICD_ACTIONS).toContain('trace_impact');
  });
});

describe('ConnectedICD dependency graph', () => {
  it('ICD generation requires architecture + interface list', () => {
    const node = CONNECTEDICD_DEPENDENCY_GRAPH.generate_icd;
    expect(node.requires).toContain('system_architecture');
    expect(node.requires).toContain('interface_list');
    expect(node.hard).toBe(true);
  });

  it('validation requires verified ICD', () => {
    const node = CONNECTEDICD_DEPENDENCY_GRAPH.validate_interface;
    expect(node.requires).toContain('icd');
    expect(node.quality_gate.min_score).toBe(280);
  });

  it('impact analysis requires ICD + connected requirements', () => {
    const node = CONNECTEDICD_DEPENDENCY_GRAPH.trace_impact;
    expect(node.requires).toContain('icd');
    expect(node.requires).toContain('connected_requirements');
  });

  it('diff is soft dependency', () => {
    expect(CONNECTEDICD_DEPENDENCY_GRAPH.diff_versions.hard).toBe(false);
  });

  it('gate passes with good ICD', () => {
    const artifacts: ArtifactState[] = [
      { id: 'icd-1', type: 'icd', score: 300, critical_violations: 0, version: 1 },
    ];
    const result = checkDependencyGate('validate_interface', CONNECTEDICD_DEPENDENCY_GRAPH, artifacts);
    expect(result.gate_passed).toBe(true);
  });

  it('gate blocks with low-score ICD', () => {
    const artifacts: ArtifactState[] = [
      { id: 'icd-1', type: 'icd', score: 200, critical_violations: 0, version: 1 },
    ];
    const result = checkDependencyGate('validate_interface', CONNECTEDICD_DEPENDENCY_GRAPH, artifacts);
    expect(result.gate_passed).toBe(false);
  });

  it('gate blocks when ICD missing for export', () => {
    const result = checkDependencyGate('export_icd', CONNECTEDICD_DEPENDENCY_GRAPH, []);
    expect(result.gate_passed).toBe(false);
  });
});

describe('ConnectedICD RLLogger', () => {
  it('logs entries to file', () => {
    const logger = new RLLogger(TEST_LOG);
    logger.log({ run_id: 'r1', domain: 'connectedicd', action: 'generate_icd' });
    expect(existsSync(TEST_LOG)).toBe(true);
    const entry = JSON.parse(readFileSync(TEST_LOG, 'utf-8').trim());
    expect(entry.step).toBe(1);
    expect(entry.action).toBe('generate_icd');
    expect(entry.timestamp).toBeDefined();
  });

  it('records blocked attempt without policy_intent', () => {
    const logger = new RLLogger(TEST_LOG);
    logger.recordBlocked('validate_interface', 'icd score 200 < gate 280');
    const entry = logger.log({ run_id: 'r1', domain: 'connectedicd', action: 'generate_icd' });
    expect((entry.blocked_attempts as any[])[0].action).toBe('validate_interface');
    expect((entry.blocked_attempts as any[])[0].policy_intent).toBeUndefined();
  });

  it('records policy_intent on blocked attempt (TASK-063)', () => {
    const logger = new RLLogger(TEST_LOG);
    logger.recordBlocked(
      'validate_interface',
      'icd score 200 < gate 280',
      { intended_action: 'validate_interface', intended_params: { icdId: 'icd-1' }, expected_reward: 60 },
    );
    const entry = logger.log({ run_id: 'r1', domain: 'connectedicd', action: 'generate_icd' });
    const blocked = (entry.blocked_attempts as any[])[0];
    expect(blocked.policy_intent).toBeDefined();
    expect(blocked.policy_intent.intended_action).toBe('validate_interface');
    expect(blocked.policy_intent.expected_reward).toBe(60);
    // Verify persisted to file
    const logged = JSON.parse(readFileSync(TEST_LOG, 'utf-8').trim());
    expect(logged.blocked_attempts[0].policy_intent.expected_reward).toBe(60);
  });

  it('clears blocked attempts after log()', () => {
    const logger = new RLLogger(TEST_LOG);
    logger.recordBlocked('validate_interface', 'reason');
    logger.log({ run_id: 'r1', action: 'a1' });
    const entry2 = logger.log({ run_id: 'r1', action: 'a2' });
    expect((entry2.blocked_attempts as any[])).toHaveLength(0);
  });
});
