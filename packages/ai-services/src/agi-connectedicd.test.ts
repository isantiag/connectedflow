import { describe, it, expect } from 'vitest';
import { toolGenerateICD, toolScoreICD, getSkills, getSkillCount, type ICDGenerateContext } from './agi-connectedicd.js';

function makeMockLLM(scoreBase: number) {
  return async (sys: string, _user: string): Promise<string> => {
    if (sys.includes('expert generating')) {
      return JSON.stringify({ signals: [{ name: 'AIRSPEED', type: 'float32', source: 'ADC', dest: 'FCC' }] });
    }
    if (sys.includes('independent reviewer')) {
      return ['signal_coverage', 'type_consistency', 'owner_assignment', 'change_impact', 'bidirectional_trace']
        .map(d => `${d}=${scoreBase}`).join('\n');
    }
    return JSON.stringify({ signals: [{ name: 'AIRSPEED_V2' }] });
  };
}

describe('agi-connectedicd', () => {
  it('toolGenerateICD runs the loop and converges', async () => {
    const ctx: ICDGenerateContext = { system1: 'ADC', system2: 'FCC', signals: ['AIRSPEED', 'ALTITUDE'] };
    const result = await toolGenerateICD(ctx, makeMockLLM(85));
    expect(result.total).toBe(425);
    expect(result.iteration).toBe(1);
    expect(result.artifact).toBeTruthy();
  });

  it('toolGenerateICD iterates when below threshold', async () => {
    const ctx: ICDGenerateContext = { system1: 'ADC', system2: 'FCC' };
    const result = await toolGenerateICD(ctx, makeMockLLM(70));
    expect(result.total).toBe(350);
    expect(result.iteration).toBe(1); // best result from first iteration (all same score)
  });

  it('toolScoreICD returns prompt and dimensions', () => {
    const ctx: ICDGenerateContext = { system1: 'ADC', system2: 'FCC' };
    const result = toolScoreICD({ signals: [] }, ctx);
    expect(result.dimensions).toHaveLength(5);
    expect(result.prompt).toContain('Score this ICD');
  });

  it('getSkillCount returns number', () => {
    expect(typeof getSkillCount()).toBe('number');
  });
});
