'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { useProject } from '@/lib/project-context';
import { useN2Matrix } from '@/lib/queries';

const PROTO_COLOR: Record<string, string> = { 'ARINC 429': 'bg-blue-50 text-blue-700', 'ARINC 825': 'bg-amber-50 text-amber-700', 'AFDX': 'bg-purple-50 text-purple-700', 'Discrete': 'bg-slate-100 text-slate-600', 'Analog': 'bg-emerald-50 text-emerald-700', 'MIL-STD-1553': 'bg-red-50 text-red-700' };

export default function N2MatrixPage() {
  const { currentProject } = useProject();
  const { data } = useN2Matrix(currentProject?.id);
  const [selected, setSelected] = useState<{ source: string; dest: string; cells: any[] } | null>(null);

  const getCell = (src: string, dst: string) => data?.cells?.filter((c: any) => c.source === src && c.dest === dst) || [];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">N² Interface Matrix</h1>
          <p className="text-sm text-slate-500 mt-1">System-to-system connections. Click a cell to see details.</p>
        </div>
        <div className="flex gap-4 mb-4 text-xs">
          {Object.entries(PROTO_COLOR).map(([name, cls]) => (
            <span key={name} className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded ${cls.split(' ')[0]}`} /> {name}</span>
          ))}
        </div>
        {!data || !data.systems?.length ? <p className="text-muted-foreground">No systems in this project</p> : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full">
              <thead><tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-medium text-slate-500 border-b border-r">Source ↓ / Dest →</th>
                {data.systems.map((s: string) => <th key={s} className="px-3 py-3 text-center text-xs font-semibold text-slate-700 border-b min-w-[80px]">{s}</th>)}
              </tr></thead>
              <tbody>
                {data.systems.map((src: string) => (
                  <tr key={src} className="group">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 text-xs font-semibold text-slate-700 border-r border-b group-hover:bg-slate-50">{src}</td>
                    {data.systems.map((dst: string) => {
                      const cells = getCell(src, dst);
                      const isSelf = src === dst;
                      const totalMsgs = cells.reduce((s: number, c: any) => s + c.count, 0);
                      return (
                        <td key={dst} className="px-1 py-1 border-b text-center">
                          {isSelf ? <div className="w-full h-10 bg-slate-100 rounded" /> : cells.length > 0 ? (
                            <button onClick={() => setSelected({ source: src, dest: dst, cells })} className={`w-full h-10 rounded-lg text-xs font-semibold transition-all ${PROTO_COLOR[cells[0].protocol] || 'bg-slate-50 text-slate-600'} ${selected?.source === src && selected?.dest === dst ? 'ring-2 ring-blue-500' : ''}`}>{totalMsgs}</button>
                          ) : <div className="w-full h-10 rounded-lg bg-white" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {selected && (
          <div className="mt-6 p-6 rounded-xl border bg-white shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">{selected.source} → {selected.dest}</h3>
              <button onClick={() => setSelected(null)} className="text-xs text-slate-400">✕</button>
            </div>
            <div className="space-y-2">
              {selected.cells.map((c: any, i: number) => (
                <a key={i} href={`/connections/${c.connectionId}`} className="flex items-center justify-between p-3 rounded-lg border hover:bg-slate-50">
                  <div><span className="text-sm font-medium">{c.protocol}</span><span className="text-xs text-slate-500 ml-2">{c.count} messages</span></div>
                  <span className="text-xs text-primary">View →</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
