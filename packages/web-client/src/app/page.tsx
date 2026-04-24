'use client';

import { Header } from '@/components/layout/header';
import { useProject } from '@/lib/project-context';
import { useDashboard, useInsights } from '@/lib/queries';

interface Insight { type: string; category: string; title: string; description: string; suggestion: string; }
const INSIGHT_STYLE: Record<string, string> = { error: 'border-red-200 bg-red-50 text-red-800', warning: 'border-amber-200 bg-amber-50 text-amber-800', info: 'border-blue-200 bg-blue-50 text-blue-800' };
const STAT_ICONS: Record<string, string> = { systems: '📦', connections: '🔗', messages: '📨', parameters: '⚡', protocols: '🔌', signals: '📡' };

export default function DashboardPage() {
  const { currentProject } = useProject();
  const { data } = useDashboard(currentProject?.id);
  const { data: insightsData } = useInsights(currentProject?.id);
  const insights: Insight[] = insightsData?.insights || [];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto p-8 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">ConnectedICD — Interface Control Document Management</p>
        </div>

        {data && (
          <>
            <div className="grid grid-cols-6 gap-3 mb-8">
              {(['systems', 'connections', 'messages', 'parameters', 'protocols', 'signals'] as const).map(key => (
                <div key={key} className="p-4 rounded-xl border border-slate-200 bg-white">
                  <div className="text-2xl mb-1">{STAT_ICONS[key]}</div>
                  <div className="text-2xl font-bold text-slate-900">{data[key]}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 capitalize">{key}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-800">Bus Type Distribution</h2>
                </div>
                <div className="p-5 space-y-3">
                  {(data.busBreakdown || []).length === 0 ? (
                    <p className="text-sm text-slate-400">No connections yet</p>
                  ) : data.busBreakdown.map((b: any) => {
                    const pct = Math.round((b.count / (data.connections || 1)) * 100);
                    return (
                      <div key={b.protocol} className="flex items-center gap-3">
                        <span className="text-xs font-medium text-slate-700 w-28">{b.protocol}</span>
                        <span className="text-xs text-slate-500 w-16">{b.count} conn.</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-semibold w-10 text-right text-slate-600">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-800">Systems</h2>
                </div>
                <div className="divide-y divide-slate-50">
                  {(data.recentSystems || []).map((s: any, i: number) => (
                    <div key={i} className="px-5 py-3 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800">{s.name}</span>
                      <span className="text-[10px] text-slate-400">{new Date(s.time).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {insights.length > 0 && (
              <div className="mt-6 rounded-xl border bg-white overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                  <span className="text-sm">🧠</span>
                  <h2 className="text-sm font-semibold text-slate-800">AI Insights</h2>
                  <span className="text-xs text-slate-400 ml-auto">{insights.length} findings</span>
                </div>
                <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
                  {insights.slice(0, 6).map((ins, i) => (
                    <div key={i} className={`text-xs p-2 rounded border ${INSIGHT_STYLE[ins.type] || INSIGHT_STYLE.info}`}>
                      <span className="font-medium">{ins.title}</span>
                      <span className="ml-2 opacity-75">{ins.suggestion}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-3 mt-6">
              {[
                { label: 'Systems', href: '/systems', icon: '📦', desc: 'Manage LRUs and interfaces' },
                { label: 'Ingestion', href: '/ingestion', icon: '📂', desc: 'Upload Excel ICD files' },
                { label: 'AI Analysis', href: '/ai-analysis', icon: '🤖', desc: 'Architecture review, safety' },
                { label: 'Anomalies', href: '/anomalies', icon: '⚠️', desc: 'ICD consistency checks' },
              ].map(a => (
                <a key={a.label} href={a.href} className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all">
                  <div className="text-xl mb-2">{a.icon}</div>
                  <div className="text-sm font-semibold text-slate-800">{a.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{a.desc}</div>
                </a>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
