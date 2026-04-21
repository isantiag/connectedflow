/**
 * AI Analysis Service for ConnectedICD
 * 
 * Uses Claude/Gemini to provide intelligent analysis of ICD data:
 * - Bus throughput analysis and bottleneck detection
 * - Interface routing optimization proposals
 * - Trend analysis across baselines
 * - Constraint validation (protocol limits, wire gauge, timing)
 * - Architecture insights and recommendations
 * - Anomaly detection beyond rule-based checks
 */
import { LlmService } from './llm-service.js';
import { type Knex } from 'knex';

const SYSTEM_PROMPT = `You are an aerospace ICD (Interface Control Document) analysis expert for ConnectedICD. You understand ARINC 429, CAN Bus, MIL-STD-1553, AFDX protocols deeply. You analyze signal definitions, bus loading, interface architectures, and provide actionable recommendations. Always respond in JSON format when asked. Reference DO-160G, DO-178C, DO-254, and ARP 4754A where relevant.`;

export class AiAnalysisService {
  private llm: LlmService;

  constructor(private db: Knex) {
    this.llm = new LlmService();
  }

  /** Analyze bus throughput and detect bottlenecks */
  async analyzeThroughput(projectId?: string) {
    const signals = await this._getSignals(projectId);
    const busSummary = this._summarizeByBus(signals);

    const prompt = `Analyze the bus throughput for this aerospace system. Identify bottlenecks, overloaded buses, and recommend optimizations.

Bus Summary:
${JSON.stringify(busSummary, null, 2)}

Return JSON: {
  buses: [{ protocol, signalCount, estimatedLoadPercent, status: "ok"|"warning"|"critical", issues: [string], recommendations: [string] }],
  overallHealth: "healthy"|"at_risk"|"critical",
  topRecommendations: [string]
}`;

    const res = await this.llm.chat(prompt, SYSTEM_PROMPT);
    return this._parseJson(res.text, res);
  }

  /** Propose optimal signal routing between systems */
  async proposeRouting(sourceSystem: string, destSystem: string, dataRequirements: string) {
    const signals = await this._getSignals();
    const existingRoutes = signals.filter((s: any) =>
      (s.source_system === sourceSystem && s.dest_system === destSystem) ||
      (s.source_system === destSystem && s.dest_system === sourceSystem)
    );

    const prompt = `Propose the optimal interface routing for a new data path between ${sourceSystem} and ${destSystem}.

Existing interfaces between these systems:
${JSON.stringify(existingRoutes.map((s: any) => ({ name: s.name, protocol: s.protocol, refreshRate: s.refresh_rate_ms })), null, 2)}

New data requirements: ${dataRequirements}

Consider: existing bus utilization, protocol suitability, redundancy requirements, latency constraints, wire weight.

Return JSON: {
  recommendedProtocol: string,
  rationale: string,
  alternatives: [{ protocol, pros: [string], cons: [string] }],
  estimatedBusImpact: string,
  wiringConsiderations: string,
  certificationImpact: string
}`;

    const res = await this.llm.chat(prompt, SYSTEM_PROMPT);
    return this._parseJson(res.text, res);
  }

  /** Analyze trends across baselines */
  async analyzeTrends(projectId?: string) {
    const baselines = await this.db('baselines').where(projectId ? { project_id: projectId } : {}).orderBy('created_at').limit(10);
    const currentSignals = await this._getSignals(projectId);

    const prompt = `Analyze the ICD evolution trends for this aerospace project.

Current state: ${currentSignals.length} signals
Baselines: ${JSON.stringify(baselines.map((b: any) => ({ label: b.label, status: b.status, createdAt: b.created_at })), null, 2)}

Signal breakdown by protocol:
${JSON.stringify(this._summarizeByBus(currentSignals), null, 2)}

Return JSON: {
  maturityAssessment: string,
  growthRate: string,
  stabilityScore: 0-100,
  risks: [{ area: string, description: string, severity: "high"|"medium"|"low" }],
  recommendations: [string],
  readinessForReview: string
}`;

    const res = await this.llm.chat(prompt, SYSTEM_PROMPT);
    return this._parseJson(res.text, res);
  }

  /** Validate constraints across all signals */
  async validateConstraints(projectId?: string) {
    const signals = await this._getSignals(projectId);
    const busSummary = this._summarizeByBus(signals);

    const prompt = `Perform a comprehensive constraint validation on this ICD dataset. Check for:
1. Protocol-specific limits (ARINC 429: 256 labels per bus, 100kbps; CAN: 8 bytes DLC; 1553: 32 RTs)
2. Timing constraints (refresh rates vs bus capacity)
3. Naming convention violations
4. Missing critical fields
5. Duplicate signal definitions
6. Orphan signals (no source or dest)
7. Cross-protocol consistency issues

Signal data:
${JSON.stringify(signals.slice(0, 50).map((s: any) => ({ name: s.name, protocol: s.protocol, source: s.source_system, dest: s.dest_system, refreshMs: s.refresh_rate_ms, dataType: s.data_type })), null, 2)}

Bus summary: ${JSON.stringify(busSummary, null, 2)}

Return JSON: {
  totalChecks: number,
  passed: number,
  warnings: number,
  errors: number,
  findings: [{ check: string, severity: "error"|"warning"|"info", description: string, affectedSignals: [string], recommendation: string }],
  overallScore: 0-100
}`;

    const res = await this.llm.chat(prompt, SYSTEM_PROMPT);
    return this._parseJson(res.text, res);
  }

  /** Get architecture insights and recommendations */
  async architectureInsights(projectId?: string) {
    const signals = await this._getSignals(projectId);
    const busSummary = this._summarizeByBus(signals);
    const systemPairs = this._getSystemPairs(signals);

    const prompt = `Provide architecture-level insights for this aerospace ICD.

Systems and their interfaces:
${JSON.stringify(systemPairs, null, 2)}

Bus utilization:
${JSON.stringify(busSummary, null, 2)}

Total signals: ${signals.length}

Analyze:
1. Are there systems with too many interfaces (coupling risk)?
2. Are there single points of failure in the bus architecture?
3. Could any interfaces be consolidated to reduce bus count?
4. Are redundancy patterns consistent across critical interfaces?
5. What's the overall architecture health?

Return JSON: {
  architectureScore: 0-100,
  couplingAnalysis: { highCoupling: [{ system, interfaceCount, risk }], recommendation: string },
  redundancyGaps: [{ interface, issue, recommendation }],
  consolidationOpportunities: [{ signals: [string], currentBuses: [string], proposedBus: string, savings: string }],
  singlePointsOfFailure: [{ component, impact, mitigation }],
  topInsights: [string]
}`;

    const res = await this.llm.chat(prompt, SYSTEM_PROMPT);
    return this._parseJson(res.text, res);
  }

  /** Detect anomalies beyond rule-based checks */
  async detectAnomalies(projectId?: string) {
    const signals = await this._getSignals(projectId);

    const prompt = `Detect anomalies in this ICD dataset that rule-based checks would miss. Look for:
1. Unusual refresh rates for the data type (e.g., position data at 1Hz is suspicious)
2. Inconsistent naming patterns within the same system
3. Signals that seem duplicated with slight variations
4. Missing reciprocal signals (A→B has airspeed but B→A has no acknowledgment)
5. Protocol mismatches (high-bandwidth data on low-speed bus)

Signals (sample):
${JSON.stringify(signals.slice(0, 40).map((s: any) => ({ name: s.name, protocol: s.protocol, source: s.source_system, dest: s.dest_system, refreshMs: s.refresh_rate_ms, dataType: s.data_type, units: s.units })), null, 2)}

Return JSON: {
  anomalies: [{ type: string, severity: "high"|"medium"|"low", description: string, affectedSignals: [string], suggestion: string }],
  totalAnomalies: number,
  dataQualityScore: 0-100
}`;

    const res = await this.llm.chat(prompt, SYSTEM_PROMPT);
    return this._parseJson(res.text, res);
  }

  // ── Helpers ────────────────────────────────────────────────────

  private async _getSignals(projectId?: string) {
    let q = this.db('signals').leftJoin('logical_layers', 'signals.id', 'logical_layers.signal_id').leftJoin('transport_layers', 'signals.id', 'transport_layers.signal_id');
    if (projectId) q = q.where('signals.project_id', projectId);
    return q.select('signals.*', 'logical_layers.source_system', 'logical_layers.dest_system', 'logical_layers.data_type', 'logical_layers.units', 'logical_layers.refresh_rate_ms', 'logical_layers.range_min', 'logical_layers.range_max', 'transport_layers.protocol');
  }

  private _summarizeByBus(signals: any[]) {
    const buses: Record<string, { count: number; systems: Set<string> }> = {};
    for (const s of signals) {
      const proto = s.protocol ?? 'unknown';
      if (!buses[proto]) buses[proto] = { count: 0, systems: new Set() };
      buses[proto].count++;
      if (s.source_system) buses[proto].systems.add(s.source_system);
      if (s.dest_system) buses[proto].systems.add(s.dest_system);
    }
    return Object.entries(buses).map(([proto, data]) => ({ protocol: proto, signalCount: data.count, systemCount: data.systems.size, systems: Array.from(data.systems) }));
  }

  private _getSystemPairs(signals: any[]) {
    const pairs: Record<string, number> = {};
    for (const s of signals) {
      if (s.source_system && s.dest_system) {
        const key = `${s.source_system} → ${s.dest_system}`;
        pairs[key] = (pairs[key] ?? 0) + 1;
      }
    }
    return Object.entries(pairs).map(([pair, count]) => ({ interface: pair, signalCount: count })).sort((a, b) => b.signalCount - a.signalCount);
  }

  private _parseJson(text: string, res: any) {
    try {
      const clean = text.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      return { analysis: JSON.parse(clean), provider: res.provider, model: res.model };
    } catch {
      return { analysis: text, provider: res.provider, model: res.model };
    }
  }
}
