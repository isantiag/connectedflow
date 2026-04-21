'use client';

import { useState } from 'react';

const ANALYSES = [
  { id: 'throughput', label: 'Bus Throughput', icon: '📊', desc: 'Detect bottlenecks and overloaded buses', endpoint: '/api/ai/throughput' },
  { id: 'routing', label: 'Routing Proposal', icon: '🔀', desc: 'Optimal signal routing between systems', endpoint: '/api/ai/routing' },
  { id: 'trends', label: 'Trend Analysis', icon: '📈', desc: 'ICD evolution across baselines', endpoint: '/api/ai/trends' },
  { id: 'constraints', label: 'Constraint Check', icon: '🔒', desc: 'Protocol limits, timing, naming', endpoint: '/api/ai/constraints' },
  { id: 'architecture', label: 'Architecture', icon: '🏗️', desc: 'Coupling, redundancy, consolidation', endpoint: '/api/ai/architecture' },
  { id: 'anomalies', label: 'Anomaly Detection', icon: '🔍', desc: 'Patterns rule-based checks miss', endpoint: '/api/ai/anomalies' },
];

export default function AiAnalysisPage() {
  const [active, setActive] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [routingForm, setRoutingForm] = useState({ source: '', dest: '', requirements: '' });

  const run = async (id: string) => {
    setActive(id); setResult(null); setLoading(true);
    const analysis = ANALYSES.find(a => a.id === id)!;
    try {
      const body = id === 'routing' ? { sourceSystem: routingForm.source, destSystem: routingForm.dest, dataRequirements: routingForm.requirements } : {};
      const r = await fetch(analysis.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setResult(await r.json());
    } catch { setResult({ error: 'Analysis failed — is the API running?' }); }
    setLoading(false);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">AI Analysis</h1>
        <p className="text-sm text-slate-500 mt-1">Claude / Gemini powered insights for your ICD architecture.</p>
      </div>

      {/* Analysis cards */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {ANALYSES.map(a => (
          <button key={a.id} onClick={() => a.id === 'routing' ? setActive('routing-form') : run(a.id)}
            className={`p-4 rounded-xl border text-left transition-all ${active === a.id ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'}`}>
            <div className="text-2xl mb-2">{a.icon}</div>
            <div className="text-sm font-semibold text-slate-800">{a.label}</div>
            <div className="text-xs text-slate-500 mt-0.5">{a.desc}</div>
          </button>
        ))}
      </div>

      {/* Routing form */}
      {active === 'routing-form' && (
        <div className="mb-6 p-6 rounded-xl border border-slate-200 bg-white space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Routing Proposal — Define the interface</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={routingForm.source} onChange={e => setRoutingForm(p => ({ ...p, source: e.target.value }))} placeholder="Source system (e.g., FCC)"
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            <input value={routingForm.dest} onChange={e => setRoutingForm(p => ({ ...p, dest: e.target.value }))} placeholder="Destination system (e.g., ADC)"
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
          <input value={routingForm.requirements} onChange={e => setRoutingForm(p => ({ ...p, requirements: e.target.value }))} placeholder="Data requirements (e.g., airspeed, altitude at 50ms, safety-critical)"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          <button onClick={() => run('routing')} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Analyze Routing</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="text-3xl animate-pulse mb-3">🤖</div>
            <p className="text-sm text-slate-500">AI is analyzing your ICD data...</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{ANALYSES.find(a => a.id === active)?.label} Results</h3>
              <p className="text-xs text-slate-400">{result.provider} · {result.model}</p>
            </div>
            <button onClick={() => { setResult(null); setActive(null); }} className="text-xs text-slate-400 hover:text-slate-600">✕ Close</button>
          </div>
          <div className="p-6">
            {typeof result.analysis === 'object' ? (
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono bg-slate-50 p-4 rounded-lg overflow-auto max-h-96">{JSON.stringify(result.analysis, null, 2)}</pre>
            ) : (
              <div className="text-sm text-slate-700 whitespace-pre-wrap">{String(result.analysis ?? result.error ?? 'No results')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
