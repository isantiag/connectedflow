/**
 * AGI Wiring for ConnectedICD — plugs CONNECTED_ICD_CONFIG into the generic engine.
 * MCP tools per §9.2: agi.generateICD, agi.scoreICD
 *
 * Engine types inlined from agi-engine.ts (AssureFlow shared) since repos are separate.
 * Production: publish @ee-aero/agi-engine as shared npm package.
 */

// ─── Engine types (from agi-engine.ts) ───

export interface DomainConfig {
  name: string;
  dimensions: string[];
  threshold: number;
  maxIterations: number;
  generatePrompt: (context: any, exemplars: any[]) => string;
  evaluatePrompt: (artifact: any, context: any) => string;
  improvePrompt: (artifact: any, scores: any, findings: string[]) => string;
}

export interface ScoredArtifact {
  artifact: any;
  scores: Record<string, number>;
  total: number;
  findings: string[];
  iteration: number;
  timestamp: string;
}

export interface Skill {
  id: string;
  domain: string;
  description: string;
  artifact: any;
  scores: Record<string, number>;
  total: number;
  usageCount: number;
  createdAt: string;
}

// ─── Core loop (from agi-engine.ts) ───

async function generateEvaluateSelectLoop(
  config: DomainConfig,
  context: any,
  llmCall: (systemPrompt: string, userPrompt: string) => Promise<string>,
  library: { retrieve: (domain: string, query: string) => Skill[]; store: (skill: Omit<Skill, 'id' | 'createdAt' | 'usageCount'>) => void },
): Promise<ScoredArtifact> {
  const exemplars = library.retrieve(config.name, JSON.stringify(context));
  let currentArtifact = await llmCall(
    `You are a ${config.name} expert generating high-quality artifacts.`,
    config.generatePrompt(context, exemplars),
  );
  let bestResult: ScoredArtifact | null = null;

  for (let i = 0; i < config.maxIterations; i++) {
    const evalResponse = await llmCall(
      'You are an independent reviewer. Score harshly. A score above 80 must be earned.',
      config.evaluatePrompt(currentArtifact, context),
    );
    const scores: Record<string, number> = {};
    for (const dim of config.dimensions) {
      const match = evalResponse.match(new RegExp(`${dim}[:\\s=]+(\\d+)`, 'i'));
      if (match) scores[dim] = Math.min(100, parseInt(match[1]));
    }
    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    const findings = evalResponse.split('\n')
      .filter(l => l.includes('FINDING') || l.includes('ISSUE') || l.includes('MISSING') || l.startsWith('-'))
      .slice(0, 10);

    const result: ScoredArtifact = { artifact: currentArtifact, scores, total, findings, iteration: i + 1, timestamp: new Date().toISOString() };
    if (!bestResult || total > bestResult.total) bestResult = result;
    if (total >= config.threshold) {
      library.store({ domain: config.name, description: JSON.stringify(context).slice(0, 200), artifact: currentArtifact, scores, total });
      break;
    }
    if (i < config.maxIterations - 1) {
      currentArtifact = await llmCall(
        `You are improving a ${config.name} artifact based on reviewer feedback.`,
        config.improvePrompt(currentArtifact, scores, findings),
      );
    }
  }
  return bestResult!;
}

// ─── ConnectedICD domain config ───

const CONNECTED_ICD_CONFIG: DomainConfig = {
  name: 'connectedicd',
  dimensions: ['signal_coverage', 'type_consistency', 'owner_assignment', 'change_impact', 'bidirectional_trace'],
  threshold: 400,
  maxIterations: 5,
  generatePrompt: (ctx, exemplars) =>
    `Generate ICD for interface between ${ctx.system1} and ${ctx.system2}\nSignals: ${ctx.signals?.join(', ')}\n${exemplars.length ? 'Reference:\n' + exemplars.map((e: any) => JSON.stringify(e.artifact).slice(0, 500)).join('\n') : ''}`,
  evaluatePrompt: (artifact, ctx) =>
    `Score this ICD. Rate each 0-100:\nsignal_coverage: All signals defined?\ntype_consistency: Data types match across interfaces?\nowner_assignment: Every interface has an owner?\nchange_impact: Change impact documented?\nbidirectional_trace: Requirements trace both directions?\n\nICD:\n${JSON.stringify(artifact).slice(0, 3000)}`,
  improvePrompt: (artifact, scores, findings) =>
    `Improve this ICD. Scores: ${JSON.stringify(scores)}\nFix:\n${findings.join('\n')}\n\nOriginal:\n${JSON.stringify(artifact).slice(0, 3000)}`,
};

// ─── In-memory skill library ───

const skills: Skill[] = [];
let nextId = 1;

const skillLibrary = {
  retrieve(domain: string, _query: string): Skill[] {
    return skills.filter(s => s.domain === domain).sort((a, b) => b.total - a.total).slice(0, 3);
  },
  store(skill: Omit<Skill, 'id' | 'createdAt' | 'usageCount'>): void {
    skills.push({ ...skill, id: `skill-cicd-${nextId++}`, createdAt: new Date().toISOString(), usageCount: 0 });
  },
};

// ─── MCP Tools ───

export interface ICDGenerateContext {
  system1: string;
  system2: string;
  signals?: string[];
  protocol?: string;
}

export async function toolGenerateICD(
  context: ICDGenerateContext,
  llmCall: (systemPrompt: string, userPrompt: string) => Promise<string>,
): Promise<ScoredArtifact> {
  return generateEvaluateSelectLoop(CONNECTED_ICD_CONFIG, context, llmCall, skillLibrary);
}

export function toolScoreICD(artifact: any, context: ICDGenerateContext): { prompt: string; dimensions: string[] } {
  return { prompt: CONNECTED_ICD_CONFIG.evaluatePrompt(artifact, context), dimensions: CONNECTED_ICD_CONFIG.dimensions };
}

export function getSkills(): Skill[] { return [...skills]; }
export function getSkillCount(): number { return skills.length; }
