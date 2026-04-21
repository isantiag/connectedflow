'use client';

import { useState } from 'react';

// Mock data — replace with API calls
const STATS = { signals: 247, buses: 6, systems: 12, baselines: 3, pendingHandshakes: 4, openComments: 8 };
const BUS_HEALTH = [
  { protocol: 'ARINC 429', signals: 89, load: 62, status: 'healthy' },
  { protocol: 'CAN Bus', signals: 74, load: 78, status: 'warning' },
  { protocol: 'MIL-STD-1553', signals: 32, load: 41, status: 'healthy' },
  { protocol: 'AFDX', signals: 28, load: 23, status: 'healthy' },
  { protocol: 'Discrete', signals: 16, load: 0, status: 'healthy' },
  { protocol: 'Analog', signals: 8, load: 0, status: 'healthy' },
];
const RECENT = [
  { action: 'Signal created', target: 'AIRSPEED_IAS', user: 'R. Santiago', time: '2 min ago' },
  { action: 'Baseline frozen', target: 'v0.3-PDR', user: 'Kiro Agent', time: '15 min ago' },
  { action: 'Comment added', target: 'HV_BUS_VOLTAGE', user: 'Supplier A', time: '1 hr ago' },
  { action: 'Handshake approved', target: 'FCC→ADC interface', user: 'J. Chen', time: '2 hr ago' },
];

const LOAD_COLOR = (load: number) => load >= 80 ? 'bg-red-500' : load >= 60 ? 'bg-amber-500' : 'bg-emerald-500';
const STATUS_DOT = (s: string) => s === 'healthy' ? 'bg-emerald-400' : s === 'warning' ? 'bg-amber-400' : 'bg-red-400';

export default function DashboardPage() {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">ConnectedICD — Interface Control Document Management</p>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: 'Signals', value: STATS.signals, icon: '⚡' },
          { label: 'Buses', value: STATS.buses, icon: '🔌' },
          { label: 'Systems', value: STATS.systems, icon: '📦' },
          { label: 'Baselines', value: STATS.baselines, icon: '📌' },
          { label: 'Pending Handshakes', value: STATS.pendingHandshakes, icon: '🤝', alert: true },
          { label: 'Open Comments', value: STATS.openComments, icon: '💬' },
        ].map(m => (
          <div key={m.label} className="p-4 rounded-xl border border-slate-200 bg-white">
            <div className="text-2xl mb-1">{m.icon}</div>
            <div className={`text-2xl font-bold ${m.alert && m.value > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{m.value}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Bus Health */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">Bus Health</h2>
          </div>
          <div className="p-5 space-y-3">
            {BUS_HEALTH.map(b => (
              <div key={b.protocol} className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT(b.status)}`} />
                <span className="text-xs font-medium text-slate-700 w-28">{b.protocol}</span>
                <span className="text-xs text-slate-500 w-16">{b.signals} signals</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${LOAD_COLOR(b.load)}`} style={{ width: `${b.load}%` }} />
                </div>
                <span className={`text-xs font-semibold w-10 text-right ${b.load >= 80 ? 'text-red-600' : b.load >= 60 ? 'text-amber-600' : 'text-emerald-600'}`}>{b.load}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">Recent Activity</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {RECENT.map((r, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-slate-800">{r.action}</span>
                  <span className="text-xs text-slate-500 ml-1.5">· {r.target}</span>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400">{r.user}</div>
                  <div className="text-[10px] text-slate-400">{r.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Import ICD', href: '/ingestion', icon: '📂', desc: 'Upload Excel, PDF, DBC' },
          { label: 'N² Matrix', href: '/n2-matrix', icon: '📊', desc: 'System interface overview' },
          { label: 'AI Analysis', href: '/ai-analysis', icon: '🤖', desc: 'Throughput, routing, anomalies' },
          { label: 'Export Excel', href: '/signals', icon: '📥', desc: 'Download formatted ICD' },
        ].map(a => (
          <a key={a.label} href={a.href} className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm transition-all">
            <div className="text-xl mb-2">{a.icon}</div>
            <div className="text-sm font-semibold text-slate-800">{a.label}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{a.desc}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
