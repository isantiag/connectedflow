'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface ConnectorNodeData {
  label: string;
  partNumber?: string;
  connectorType?: string;
  totalPins?: number;
  location?: string;
  pinAssignments?: { pin: string; signalName: string }[];
}

function ConnectorNodeComponent({ data }: NodeProps) {
  const d = data as unknown as ConnectorNodeData;
  return (
    <div className="min-w-[160px] rounded-lg border bg-card shadow-md">
      <div className="rounded-t-lg bg-primary/10 px-3 py-1.5">
        <p className="text-xs font-semibold">{d.label}</p>
        {d.partNumber && (
          <p className="text-[10px] text-muted-foreground">{d.partNumber}</p>
        )}
      </div>
      <div className="space-y-0.5 px-3 py-2">
        {d.pinAssignments?.slice(0, 6).map((pin) => (
          <div key={pin.pin} className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Pin {pin.pin}</span>
            <span className="font-medium">{pin.signalName}</span>
          </div>
        ))}
        {(d.pinAssignments?.length ?? 0) > 6 && (
          <p className="text-[10px] text-muted-foreground">
            +{(d.pinAssignments?.length ?? 0) - 6} more
          </p>
        )}
        {!d.pinAssignments?.length && (
          <p className="text-[10px] text-muted-foreground">No pins assigned</p>
        )}
      </div>
      {d.totalPins != null && (
        <div className="border-t px-3 py-1 text-[10px] text-muted-foreground">
          {d.connectorType ?? 'Connector'} · {d.totalPins} pins
        </div>
      )}
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-primary" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-primary" />
    </div>
  );
}

export const ConnectorNode = memo(ConnectorNodeComponent);
