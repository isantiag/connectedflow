'use client';

import { useState } from 'react';

// Mock data — replace with API call to GET /api/n2-matrix
const SYSTEMS = ['FCC', 'ADC', 'AHRS', 'EPS', 'BMS', 'GEN', 'NAV', 'COMM'];
const MOCK_CELLS: Record<string, { count: number; status: 'green' | 'yellow' | 'red' | 'gray' }> = {
  'FCC→ADC': { count: 12, status: 'green' }, 'FCC→AHRS': { count: 8, status: 'green' },
  'FCC→EPS': { count: 4, status: 'yellow' }, 'ADC→FCC': { count: 6, status: 'green' },
  'AHRS→FCC': { count: 5, status: 'green' }, 'EPS→BMS': { count: 7, status: 'red' },
  'BMS→EPS': { count: 3, status: 'green' }, 'GEN→EPS': { count: 2, status: 'green' },
  'NAV→FCC': { count: 9, status: 'green' }, 'COMM→NAV': { count: 1, status: 'gray' },
  'FCC→NAV': { count: 4, status: 'yellow' },
};

const STATUS_BG = { green: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100', yellow: 'bg-amber-50 text-amber-700 hover:bg-amber-100', red: 'bg-red-50 text-red-700 hover:bg-red-100', gray: 'bg-slate-50 text-slate-400' };

export default function N2MatrixPage() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">N² Interface Matrix</h1>
        <p className="text-sm text-slate-500 mt-1">System-to-system signal overview. Click a cell to see signal details.</p>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-6 text-xs">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-400" /> Valid</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-400" /> Warnings</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-400" /> Errors</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-300" /> No interface</span>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-medium text-slate-500 border-b border-r">Source ↓ / Dest →</th>
              {SYSTEMS.map(s => (
                <th key={s} className="px-3 py-3 text-center text-xs font-semibold text-slate-700 border-b min-w-[80px]">{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SYSTEMS.map(src => (
              <tr key={src} className="group">
                <td className="sticky left-0 z-10 bg-white px-4 py-2 text-xs font-semibold text-slate-700 border-r border-b group-hover:bg-slate-50">{src}</td>
                {SYSTEMS.map(dst => {
                  const key = `${src}→${dst}`;
                  const cell = MOCK_CELLS[key];
                  const isSelf = src === dst;
                  return (
                    <td key={dst} className="px-1 py-1 border-b text-center">
                      {isSelf ? (
                        <div className="w-full h-10 bg-slate-100 rounded" />
                      ) : cell ? (
                        <button onClick={() => setSelected(key)}
                          className={`w-full h-10 rounded-lg text-xs font-semibold transition-all ${STATUS_BG[cell.status]} ${selected === key ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}>
                          {cell.count}
                        </button>
                      ) : (
                        <div className="w-full h-10 rounded-lg bg-white" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="mt-6 p-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{selected.replace('→', ' → ')}</h3>
              <p className="text-xs text-slate-500">{MOCK_CELLS[selected]?.count ?? 0} signals on this interface</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-xs text-slate-400 hover:text-slate-600">✕ Close</button>
          </div>
          <p className="text-xs text-slate-400">Signal list will load from API — click to view/edit individual signals</p>
        </div>
      )}
    </div>
  );
}
