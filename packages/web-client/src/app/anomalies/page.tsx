'use client';

import { useState } from 'react';

const SEVERITY_STYLE = { high: 'bg-red-50 border-red-200 text-red-800', medium: 'bg-amber-50 border-amber-200 text-amber-800', low: 'bg-blue-50 border-blue-200 text-blue-800' };
const SEVERITY_DOT = { high: 'bg-red-500', medium: 'bg-amber-500', low: 'bg-blue-500' };

// Rule-based anomalies (from the existing anomaly detection service)
const RULE_BASED = [
  { id: 1, type: 'Bus Overload', severity: 'high' as const, signal: 'CAN_BUS_1', description: 'CAN Bus 1 utilization at 92% — exceeds 80% threshold', recommendation: 'Move low-priority signals to CAN Bus 2 or increase bus speed' },
  { id: 2, type: 'Range Overlap', severity: 'medium' as const, signal: 'AIRSPEED_IAS', description: 'Logical range (0-600 kts) exceeds BNR encoding capacity at current scale factor', recommendation: 'Adjust scale factor or reduce range to fit 15-bit BNR encoding' },
  { id: 3, type: 'Timing Mismatch', severity: 'medium' as const, signal: 'ATTITUDE_PITCH', description: 'Refresh rate 5ms exceeds ARINC 429 bus cycle rate at current label count', recommendation: 'Reduce refresh rate to 10ms or dedicate a separate ARINC 429 bus' },
  { id: 4, type: 'Wire Gauge', severity: 'low' as const, signal: 'AFDX_VL_12', description: '26 AWG wire on 100 Mbps AFDX virtual link — marginal for cable length > 5m', recommendation: 'Use 24 AWG or verify cable length is within spec' },
];

export default function AnomaliesPage() {
  const [aiResult, setAiResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'rules' | 'ai'>('rules');

  const runAiDetection = async () => {
    setLoading(true); setTab('ai');
    try {
      const r = await fetch('/api/ai/anomalies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      setAiResult(await r.json());
    } catch { setAiResult({ error: 'AI detection failed — is the API running?' }); }
    setLoading(false);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Anomaly Detection</h1>
          <p className="text-sm text-slate-500 mt-1">Rule-based checks + AI-powered pattern detection</p>
        </div>
        <button onClick={runAiDetection} disabled={loading}
          className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
          {loading ? '🤖 AI scanning...' : '🤖 Run AI Detection'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        <button onClick={() => setTab('rules')} className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === 'rules' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
          🔒 Rule-Based ({RULE_BASED.length})
        </button>
        <button onClick={() => setTab('ai')} className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${tab === 'ai' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
          🤖 AI Detection {aiResult?.analysis?.totalAnomalies ? `(${aiResult.analysis.totalAnomalies})` : ''}
        </button>
      </div>

      {/* Rule-based anomalies */}
      {tab === 'rules' && (
        <div className="space-y-3">
          {RULE_BASED.map(a => (
            <div key={a.id} className={`p-4 rounded-xl border ${SEVERITY_STYLE[a.severity]}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[a.severity]}`} />
                <span className="text-xs font-semibold uppercase">{a.type}</span>
                <span className="text-xs opacity-60">· {a.signal}</span>
              </div>
              <p className="text-sm">{a.description}</p>
              <p className="text-xs opacity-70 mt-1">💡 {a.recommendation}</p>
            </div>
          ))}
        </div>
      )}

      {/* AI anomalies */}
      {tab === 'ai' && (
        <div>
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="text-3xl animate-pulse mb-3">🔍</div>
                <p className="text-sm text-slate-500">AI is scanning for patterns rule-based checks miss...</p>
              </div>
            </div>
          )}

          {aiResult && !loading && (
            <div className="space-y-4">
              {/* Score */}
              {aiResult.analysis?.dataQualityScore != null && (
                <div className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 bg-white">
                  <div className={`text-3xl font-bold ${aiResult.analysis.dataQualityScore >= 80 ? 'text-emerald-600' : aiResult.analysis.dataQualityScore >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                    {aiResult.analysis.dataQualityScore}%
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Data Quality Score</div>
                    <div className="text-xs text-slate-500">{aiResult.analysis.totalAnomalies ?? 0} anomalies detected · {aiResult.provider}</div>
                  </div>
                </div>
              )}

              {/* Anomaly list */}
              {(aiResult.analysis?.anomalies ?? []).map((a: any, i: number) => (
                <div key={i} className={`p-4 rounded-xl border ${SEVERITY_STYLE[a.severity as keyof typeof SEVERITY_STYLE] ?? SEVERITY_STYLE.medium}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[a.severity as keyof typeof SEVERITY_DOT] ?? SEVERITY_DOT.medium}`} />
                    <span className="text-xs font-semibold uppercase">{a.type}</span>
                  </div>
                  <p className="text-sm">{a.description}</p>
                  {a.affectedSignals?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {a.affectedSignals.map((s: string) => <span key={s} className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/50">{s}</span>)}
                    </div>
                  )}
                  {a.suggestion && <p className="text-xs opacity-70 mt-1">💡 {a.suggestion}</p>}
                </div>
              ))}

              {typeof aiResult.analysis === 'string' && (
                <div className="p-4 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 whitespace-pre-wrap">{aiResult.analysis}</div>
              )}

              {aiResult.error && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{aiResult.error}</div>
              )}
            </div>
          )}

          {!aiResult && !loading && (
            <div className="text-center py-16 text-slate-400">
              <div className="text-3xl mb-3">🤖</div>
              <p className="text-sm">Click "Run AI Detection" to scan for anomalies beyond rule-based checks</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
