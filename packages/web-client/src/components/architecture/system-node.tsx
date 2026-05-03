'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

const DAL_COLORS: Record<string, { bg: string; text: string }> = {
  A: { bg: 'bg-red-100 border-red-300', text: 'text-red-800' },
  B: { bg: 'bg-orange-100 border-orange-300', text: 'text-orange-800' },
  C: { bg: 'bg-yellow-100 border-yellow-300', text: 'text-yellow-800' },
  D: { bg: 'bg-blue-100 border-blue-300', text: 'text-blue-800' },
  E: { bg: 'bg-slate-100 border-slate-300', text: 'text-slate-600' },
};

export interface SystemNodeData {
  label: string;
  systemType: string;
  dalLevel: string;
  massKg: number | null;
  powerWatts: number | null;
  ataChapter: string;
  selected?: boolean;
}

function SystemNodeComponent({ data }: NodeProps) {
  const d = data as unknown as SystemNodeData;
  const dal = DAL_COLORS[d.dalLevel] ?? DAL_COLORS.E;

  return (
    <div
      className={`min-w-[150px] rounded-lg border bg-white shadow-sm ${d.selected ? 'ring-2 ring-blue-500' : ''}`}
      role="group"
      aria-label={`System: ${d.label}`}
    >
      <div className="flex items-center justify-between rounded-t-lg bg-slate-50 px-3 py-1.5 border-b">
        <span className="text-xs font-semibold text-slate-800 truncate max-w-[100px]">{d.label}</span>
        {d.dalLevel && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${dal.bg} ${dal.text}`}>
            DAL {d.dalLevel}
          </span>
        )}
      </div>
      <div className="px-3 py-2 space-y-0.5">
        <div className="text-[10px] text-slate-500">{d.systemType}</div>
        {d.massKg != null && (
          <div className="text-[10px] text-slate-600">{d.massKg} kg</div>
        )}
        {d.powerWatts != null && (
          <div className="text-[10px] text-slate-600">{d.powerWatts} W</div>
        )}
        {d.ataChapter && (
          <div className="text-[10px] text-slate-400">ATA {d.ataChapter}</div>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-slate-400" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-slate-400" />
    </div>
  );
}

export const SystemNode = memo(SystemNodeComponent);
