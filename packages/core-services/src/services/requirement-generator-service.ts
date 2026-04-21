/**
 * Requirement Generation — auto-generate interface requirements from signal definitions.
 * Format: "System A shall transmit [signal] to System B via [protocol] at [rate]"
 * Exports to ReqIF and links to AssureFlow.
 */
import { type Knex } from 'knex';

export interface GeneratedRequirement {
  displayId: string;
  text: string;
  rationale: string;
  source: string;
  level: string;
  verificationMethod: string;
  isInterface: boolean;
  signalId: string;
  signalName: string;
}

export class RequirementGeneratorService {
  constructor(private db: Knex) {}

  async generateFromSignals(projectId?: string): Promise<GeneratedRequirement[]> {
    let query = this.db('signals').leftJoin('logical_layers', 'signals.id', 'logical_layers.signal_id').leftJoin('transport_layers', 'signals.id', 'transport_layers.signal_id');
    if (projectId) query = query.where('signals.project_id', projectId);
    const signals = await query.select('signals.*', 'logical_layers.source_system', 'logical_layers.dest_system', 'logical_layers.data_type', 'logical_layers.units', 'logical_layers.refresh_rate_ms', 'logical_layers.range_min', 'logical_layers.range_max', 'transport_layers.protocol');

    const reqs: GeneratedRequirement[] = [];
    let counter = 1;

    for (const s of signals) {
      if (!s.source_system || !s.dest_system) continue;

      const protocol = (s.protocol ?? 'data bus').toUpperCase().replace('ARINC429', 'ARINC 429').replace('MILSTD1553', 'MIL-STD-1553');
      const rate = s.refresh_rate_ms ? ` at a rate of ${s.refresh_rate_ms}ms` : '';
      const range = s.range_min != null && s.range_max != null ? ` with a range of ${s.range_min} to ${s.range_max}${s.units ? ` ${s.units}` : ''}` : '';

      reqs.push({
        displayId: `ITF-${String(counter).padStart(3, '0')}`,
        text: `${s.source_system} shall transmit ${s.name} (${s.data_type ?? 'data'}) to ${s.dest_system} via ${protocol}${rate}${range}.`,
        rationale: `Auto-generated from ConnectedFlow signal ${s.name} (ID: ${s.id}). Ensures interface definition is captured as a traceable requirement.`,
        source: `ConnectedFlow signal ${s.id}`,
        level: 'system',
        verificationMethod: 'inspection',
        isInterface: true,
        signalId: s.id,
        signalName: s.name,
      });
      counter++;
    }

    return reqs;
  }

  /** Export generated requirements as ReqIF XML */
  generateReqIF(reqs: GeneratedRequirement[]): string {
    const specObjects = reqs.map(r => `    <SPEC-OBJECT IDENTIFIER="${r.displayId}">
      <VALUES>
        <ATTRIBUTE-VALUE-STRING THE-VALUE="${r.text.replace(/"/g, '&quot;')}"/>
      </VALUES>
    </SPEC-OBJECT>`).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">
  <THE-HEADER>
    <REQ-IF-HEADER IDENTIFIER="connectedflow-generated">
      <CREATION-TIME>${new Date().toISOString()}</CREATION-TIME>
      <SOURCE-TOOL-ID>ConnectedFlow</SOURCE-TOOL-ID>
    </REQ-IF-HEADER>
  </THE-HEADER>
  <CORE-CONTENT>
    <REQ-IF-CONTENT>
      <SPEC-OBJECTS>
${specObjects}
      </SPEC-OBJECTS>
    </REQ-IF-CONTENT>
  </CORE-CONTENT>
</REQ-IF>`;
  }

  /** Push generated requirements to AssureFlow via API */
  async pushToAssureFlow(reqs: GeneratedRequirement[], assureFlowUrl: string, projectId: string, token: string): Promise<{ pushed: number; errors: number }> {
    let pushed = 0, errors = 0;
    for (const r of reqs) {
      try {
        const id = crypto.randomUUID().replace(/-/g, '').slice(0, 26);
        const res = await fetch(`${assureFlowUrl}/v1/projects/${projectId}/requirements`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id, canonicalId: `connectedflow.requirement.${id}`, displayId: r.displayId, projectId, text: r.text, rationale: r.rationale, source: r.source, level: r.level, verificationMethod: r.verificationMethod, isInterface: r.isInterface, status: 'draft', ownerId: 'system', isDerived: true, version: '1', createdBy: 'system', updatedBy: 'system' }),
        });
        if (res.ok) pushed++; else errors++;
      } catch { errors++; }
    }
    return { pushed, errors };
  }
}
