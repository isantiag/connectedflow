'use client';

import { useState } from 'react';

const BUS_COLORS: Record<string, string> = {
  'ARINC 429': '#3b82f6',
  'ARINC 825': '#f59e0b',
  'AFDX': '#8b5cf6',
  'MIL-STD-1553': '#ef4444',
  'Discrete': '#6b7280',
  'Analog': '#10b981',
};

interface Conn {
  id: string;
  remote_system_name: string;
  protocol_name: string;
  direction: string;
  message_count: number;
}

export function ConnectionDiagram({ systemName, connections, onConnectionClick }: { systemName: string; connections: Conn[]; onConnectionClick?: (id: string) => void }) {
  const [hoveredConn, setHoveredConn] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  if (connections.length === 0) return null;

  const grouped = connections.reduce<Record<string, Conn[]>>((acc, c) => {
    (acc[c.remote_system_name] = acc[c.remote_system_name] || []).push(c);
    return acc;
  }, {});

  const remotes = Object.keys(grouped).sort();

  // Split into left (RX/inputs) and right (TX/outputs)
  const leftItems: { name: string; conns: Conn[] }[] = [];
  const rightItems: { name: string; conns: Conn[] }[] = [];
  for (const name of remotes) {
    const conns = grouped[name];
    if (conns.some(c => c.direction === 'rx')) leftItems.push({ name, conns });
    else rightItems.push({ name, conns });
  }
  if (leftItems.length === 0 && rightItems.length > 1) leftItems.push(...rightItems.splice(0, Math.ceil(rightItems.length / 2)));
  if (rightItems.length === 0 && leftItems.length > 1) rightItems.push(...leftItems.splice(0, Math.ceil(leftItems.length / 2)));

  const maxSide = Math.max(leftItems.length, rightItems.length, 1);
  const nodeH = 40;
  const nodeW = 110;
  const spacing = Math.max(nodeH + 16, 60);
  const totalHeight = Math.max(280, maxSide * spacing + 80);
  const centerX = 370;
  const centerY = totalHeight / 2;
  const leftX = 90;
  const rightX = 650;

  const getY = (i: number, count: number) => centerY + (i - (count - 1) / 2) * spacing;

  // Curved path between two points
  const curvePath = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = (x2 - x1) * 0.4;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div className="rounded-xl border bg-white p-5 mb-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800 mb-4">Interface Diagram</h2>
      <svg width="740" height={totalHeight} className="w-full" viewBox={`0 0 740 ${totalHeight}`}>
        <defs>
          <marker id="arrowHead" viewBox="0 0 10 8" refX="9" refY="4" markerWidth={7} markerHeight={7} orient="auto-start-reverse">
            <path d="M 0 0 L 10 4 L 0 8 z" fill="#94a3b8" />
          </marker>
          <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.08" />
          </filter>
        </defs>

        {/* Center system */}
        <g filter="url(#shadow)">
          <rect x={centerX - 60} y={centerY - 24} width={120} height={48} rx={10} fill="#0f172a" />
          <text x={centerX} y={centerY + 1} textAnchor="middle" fill="white" fontSize={14} fontWeight="700">{systemName}</text>
          <text x={centerX} y={centerY + 15} textAnchor="middle" fill="#94a3b8" fontSize={9}>{connections.length} interfaces</text>
        </g>

        {/* Left nodes + connections */}
        {leftItems.map((item, i) => {
          const ny = getY(i, leftItems.length);
          const isNodeHovered = hoveredNode === `l-${item.name}`;
          return (
            <g key={`l-${item.name}`}>
              {/* Connection lines */}
              {item.conns.map((c, j) => {
                const color = BUS_COLORS[c.protocol_name] || '#94a3b8';
                const lineY = ny + (j - (item.conns.length - 1) / 2) * 5;
                const isHovered = hoveredConn === c.id;
                const midX = (leftX + nodeW / 2 + centerX - 60) / 2;
                const midY = (lineY + centerY) / 2 - 12;
                return (
                  <g key={c.id}
                    onMouseEnter={() => setHoveredConn(c.id)}
                    onMouseLeave={() => setHoveredConn(null)}
                    onClick={() => onConnectionClick?.(c.id)}
                    style={{ cursor: onConnectionClick ? 'pointer' : 'default' }}>
                    <path d={curvePath(leftX + nodeW / 2, lineY, centerX - 60, centerY)}
                      fill="none" stroke={color} strokeWidth={isHovered ? 3 : 1.5} strokeOpacity={isHovered ? 1 : 0.7}
                      markerEnd="url(#arrowHead)" />
                    {/* Protocol label on line */}
                    <rect x={midX - 32} y={midY - 8} width={64} height={16} rx={4}
                      fill="white" stroke={color} strokeWidth={0.5} opacity={isHovered ? 1 : 0.85} />
                    <text x={midX} y={midY + 3} textAnchor="middle" fontSize={8} fill={color} fontWeight="600">
                      {c.protocol_name}
                    </text>
                    {/* Message count badge */}
                    {c.message_count > 0 && (
                      <g>
                        <circle cx={midX + 38} cy={midY} r={8} fill={color} opacity={0.9} />
                        <text x={midX + 38} y={midY + 3} textAnchor="middle" fontSize={8} fill="white" fontWeight="700">{c.message_count}</text>
                      </g>
                    )}
                    {/* Hover tooltip */}
                    {isHovered && (
                      <g>
                        <rect x={midX - 55} y={midY + 12} width={110} height={20} rx={4} fill="#1e293b" opacity={0.95} />
                        <text x={midX} y={midY + 25} textAnchor="middle" fontSize={9} fill="white">
                          {c.message_count} messages · Click to view
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
              {/* Remote node */}
              <g onMouseEnter={() => setHoveredNode(`l-${item.name}`)} onMouseLeave={() => setHoveredNode(null)} filter="url(#shadow)">
                <rect x={leftX - nodeW / 2} y={ny - nodeH / 2} width={nodeW} height={nodeH} rx={8}
                  fill={isNodeHovered ? '#e2e8f0' : '#f8fafc'} stroke={isNodeHovered ? '#94a3b8' : '#e2e8f0'} strokeWidth={1.5} />
                <text x={leftX} y={ny + 1} textAnchor="middle" fontSize={12} fill="#1e293b" fontWeight="600">{item.name}</text>
                <text x={leftX} y={ny + 13} textAnchor="middle" fontSize={8} fill="#94a3b8">← RX</text>
              </g>
            </g>
          );
        })}

        {/* Right nodes + connections */}
        {rightItems.map((item, i) => {
          const ny = getY(i, rightItems.length);
          const isNodeHovered = hoveredNode === `r-${item.name}`;
          return (
            <g key={`r-${item.name}`}>
              {item.conns.map((c, j) => {
                const color = BUS_COLORS[c.protocol_name] || '#94a3b8';
                const lineY = ny + (j - (item.conns.length - 1) / 2) * 5;
                const isHovered = hoveredConn === c.id;
                const midX = (centerX + 60 + rightX - nodeW / 2) / 2;
                const midY = (centerY + lineY) / 2 - 12;
                return (
                  <g key={c.id}
                    onMouseEnter={() => setHoveredConn(c.id)}
                    onMouseLeave={() => setHoveredConn(null)}
                    onClick={() => onConnectionClick?.(c.id)}
                    style={{ cursor: onConnectionClick ? 'pointer' : 'default' }}>
                    <path d={curvePath(centerX + 60, centerY, rightX - nodeW / 2, lineY)}
                      fill="none" stroke={color} strokeWidth={isHovered ? 3 : 1.5} strokeOpacity={isHovered ? 1 : 0.7}
                      markerEnd="url(#arrowHead)" />
                    <rect x={midX - 32} y={midY - 8} width={64} height={16} rx={4}
                      fill="white" stroke={color} strokeWidth={0.5} opacity={isHovered ? 1 : 0.85} />
                    <text x={midX} y={midY + 3} textAnchor="middle" fontSize={8} fill={color} fontWeight="600">
                      {c.protocol_name}
                    </text>
                    {c.message_count > 0 && (
                      <g>
                        <circle cx={midX + 38} cy={midY} r={8} fill={color} opacity={0.9} />
                        <text x={midX + 38} y={midY + 3} textAnchor="middle" fontSize={8} fill="white" fontWeight="700">{c.message_count}</text>
                      </g>
                    )}
                    {isHovered && (
                      <g>
                        <rect x={midX - 55} y={midY + 12} width={110} height={20} rx={4} fill="#1e293b" opacity={0.95} />
                        <text x={midX} y={midY + 25} textAnchor="middle" fontSize={9} fill="white">
                          {c.message_count} messages · Click to view
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
              <g onMouseEnter={() => setHoveredNode(`r-${item.name}`)} onMouseLeave={() => setHoveredNode(null)} filter="url(#shadow)">
                <rect x={rightX - nodeW / 2} y={ny - nodeH / 2} width={nodeW} height={nodeH} rx={8}
                  fill={isNodeHovered ? '#e2e8f0' : '#f8fafc'} stroke={isNodeHovered ? '#94a3b8' : '#e2e8f0'} strokeWidth={1.5} />
                <text x={rightX} y={ny + 1} textAnchor="middle" fontSize={12} fill="#1e293b" fontWeight="600">{item.name}</text>
                <text x={rightX} y={ny + 13} textAnchor="middle" fontSize={8} fill="#94a3b8">TX →</text>
              </g>
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(10, ${totalHeight - 20})`}>
          {Object.entries(BUS_COLORS).map(([name, color], i) => (
            <g key={name} transform={`translate(${i * 110}, 0)`}>
              <rect x={0} y={-4} width={12} height={8} rx={2} fill={color} opacity={0.8} />
              <text x={16} y={4} fontSize={9} fill="#64748b">{name}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
