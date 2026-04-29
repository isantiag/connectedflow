import { describe, it, expect } from 'vitest';
import { CONNECTEDICD_DEPENDENCY_GRAPH, CONNECTEDICD_ACTIONS, checkDependencyGate, type ArtifactState } from './connectedicd-rl.js';

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
