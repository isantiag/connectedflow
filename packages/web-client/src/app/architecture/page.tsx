'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { X } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { SystemNode } from '@/components/architecture/system-node';
import { useProject } from '@/lib/project-context';
import { useSystems, useBusInstances } from '@/lib/queries';
import { api } from '@/lib/api-client';

const nodeTypes = { system: SystemNode };

export default function ArchitecturePage() {
  const { currentProject } = useProject();
  const { data: systems = [], isLoading: sysLoading } = useSystems(currentProject?.id);
  const { data: busInstances = [], isLoading: busLoading } = useBusInstances(currentProject?.id);
  const loading = sysLoading || busLoading;

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedSystem, setSelectedSystem] = useState<any>(null);

  // Filters
  const [dalFilter, setDalFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [ataFilter, setAtaFilter] = useState('');

  // Derive unique filter options
  const dalLevels = useMemo(() => [...new Set(systems.map((s: any) => s.dal_level).filter(Boolean))].sort(), [systems]);
  const systemTypes = useMemo(() => [...new Set(systems.map((s: any) => s.system_type).filter(Boolean))].sort(), [systems]);
  const ataChapters = useMemo(() => [...new Set(systems.map((s: any) => s.ata_chapter).filter(Boolean))].sort(), [systems]);

  // Filter systems
  const filtered = useMemo(() => {
    return systems.filter((s: any) => {
      if (dalFilter && s.dal_level !== dalFilter) return false;
      if (typeFilter && s.system_type !== typeFilter) return false;
      if (ataFilter && s.ata_chapter !== ataFilter) return false;
      return true;
    });
  }, [systems, dalFilter, typeFilter, ataFilter]);

  // Build nodes and edges when filtered data changes
  useEffect(() => {
    const filteredIds = new Set(filtered.map((s: any) => s.id));

    const newNodes: Node[] = filtered.map((s: any, i: number) => ({
      id: s.id,
      type: 'system',
      position: {
        x: s.diagram_x || (i % 4) * 220,
        y: s.diagram_y || Math.floor(i / 4) * 140,
      },
      data: {
        label: s.name,
        systemType: s.system_type || 'lru',
        dalLevel: s.dal_level || '',
        massKg: s.mass_kg,
        powerWatts: s.power_watts,
        ataChapter: s.ata_chapter || '',
        selected: selectedSystem?.id === s.id,
      },
    }));

    // Build edges from bus instances — each bus connects systems that share it
    // We use connections (source_port → dest_port → system) but since we don't have
    // direct connection-to-system mapping in the bus instance list, we create edges
    // between systems that appear on the same bus via the connection table.
    // For now, use a simpler approach: create edges from bus instances by looking at
    // connections that reference each bus.
    const newEdges: Edge[] = [];
    // We'll derive edges from the systems' connection data if available,
    // or from bus instances. Since bus_instance.list() doesn't return connected systems,
    // we'll create placeholder edges based on bus instances as labels.
    // The real edges come from the connection table — let's fetch them.

    setNodes(newNodes);
    setEdges(newEdges);
  }, [filtered, selectedSystem, setNodes, setEdges]);

  // Fetch connections to build edges
  useEffect(() => {
    if (!currentProject?.id || filtered.length === 0) return;

    const filteredIds = new Set(filtered.map((s: any) => s.id));

    // Fetch connections for each system and build edges
    Promise.all(
      filtered.map((s: any) =>
        api.get<any[]>(`systems/${s.id}/connections`).catch(() => [])
      )
    ).then((allConns) => {
      const edgeMap = new Map<string, Edge>();
      allConns.forEach((conns, idx) => {
        const sys = filtered[idx];
        (conns || []).forEach((c: any) => {
          // Only add edge if both systems are in filtered set
          const remoteId = systems.find((s: any) => s.name === c.remote_system_name)?.id;
          if (!remoteId || !filteredIds.has(remoteId)) return;

          const edgeId = [sys.id, remoteId].sort().join('-');
          if (!edgeMap.has(edgeId)) {
            edgeMap.set(edgeId, {
              id: edgeId,
              source: c.direction === 'tx' ? sys.id : remoteId,
              target: c.direction === 'tx' ? remoteId : sys.id,
              label: c.protocol_name || '',
              style: { strokeWidth: 1.5 },
              labelStyle: { fontSize: 10, fill: '#64748b' },
              labelBgStyle: { fill: '#fff', fillOpacity: 0.9 },
              labelBgPadding: [4, 2] as [number, number],
            });
          }
        });
      });
      setEdges(Array.from(edgeMap.values()));
    });
  }, [currentProject?.id, filtered, systems, setEdges]);

  // Save position on drag end
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange(changes);
      for (const change of changes) {
        if (change.type === 'position' && change.dragging === false && change.position) {
          api.put(`systems/${change.id}/diagram-position`, {
            x: Math.round(change.position.x),
            y: Math.round(change.position.y),
          }).catch(() => {});
        }
      }
    },
    [onNodesChange],
  );

  // Click to select
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const sys = systems.find((s: any) => s.id === node.id);
      setSelectedSystem(sys || null);
    },
    [systems],
  );

  const handlePaneClick = useCallback(() => setSelectedSystem(null), []);

  // Budget summary
  const totalMass = filtered.reduce((sum: number, s: any) => sum + (Number(s.mass_kg) || 0), 0);
  const totalPower = filtered.reduce((sum: number, s: any) => sum + (Number(s.power_watts) || 0), 0);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <main className="relative flex-1" role="main" aria-label="Architecture diagram">
          {/* Filter toolbar */}
          <div className="absolute left-4 top-4 z-10 flex gap-2 flex-wrap" role="toolbar" aria-label="Diagram filters">
            <select
              value={dalFilter}
              onChange={(e) => setDalFilter(e.target.value)}
              className="text-xs border rounded px-2 py-1 bg-white"
              aria-label="Filter by DAL level"
            >
              <option value="">All DAL</option>
              {dalLevels.map((d: string) => <option key={d} value={d}>DAL {d}</option>)}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs border rounded px-2 py-1 bg-white"
              aria-label="Filter by system type"
            >
              <option value="">All Types</option>
              {systemTypes.map((t: string) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={ataFilter}
              onChange={(e) => setAtaFilter(e.target.value)}
              className="text-xs border rounded px-2 py-1 bg-white"
              aria-label="Filter by ATA chapter"
            >
              <option value="">All ATA</option>
              {ataChapters.map((a: string) => <option key={a} value={a}>ATA {a}</option>)}
            </select>
            {(dalFilter || typeFilter || ataFilter) && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7"
                onClick={() => { setDalFilter(''); setTypeFilter(''); setAtaFilter(''); }}
              >
                Clear
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading architecture…
            </div>
          ) : !currentProject ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No project selected.
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {systems.length === 0 ? 'No systems defined. Create systems first.' : 'No systems match the current filters.'}
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              nodeTypes={nodeTypes}
              fitView
              className="bg-slate-50"
            >
              <Background gap={20} size={1} />
              <Controls />
              <MiniMap nodeStrokeWidth={3} className="!bottom-14 !right-4" />
            </ReactFlow>
          )}

          {/* Budget summary bar */}
          <div
            className="absolute bottom-0 left-0 right-0 z-10 flex items-center gap-6 border-t bg-white px-4 py-2 text-xs text-slate-600"
            role="status"
            aria-label="Budget summary"
          >
            <span><strong>{filtered.length}</strong> systems</span>
            <span>Total mass: <strong>{totalMass.toFixed(1)} kg</strong></span>
            <span>Total power: <strong>{totalPower.toFixed(1)} W</strong></span>
            <span>Bus instances: <strong>{busInstances.length}</strong></span>
          </div>
        </main>

        {/* Side panel for selected system */}
        {selectedSystem && (
          <aside
            className="w-72 shrink-0 border-l bg-white overflow-y-auto"
            role="complementary"
            aria-label="System details"
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">{selectedSystem.name}</h2>
              <button
                onClick={() => setSelectedSystem(null)}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Close details panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <Detail label="Type" value={selectedSystem.system_type} />
              <Detail label="DAL Level" value={selectedSystem.dal_level || '—'} />
              <Detail label="ATA Chapter" value={selectedSystem.ata_chapter || '—'} />
              <Detail label="Mass" value={selectedSystem.mass_kg != null ? `${selectedSystem.mass_kg} kg` : '—'} />
              <Detail label="Power" value={selectedSystem.power_watts != null ? `${selectedSystem.power_watts} W` : '—'} />
              <Detail label="Manufacturer" value={selectedSystem.manufacturer || '—'} />
              <Detail label="Part Number" value={selectedSystem.part_number || '—'} />
              <Detail label="Location" value={selectedSystem.location || '—'} />
              <Detail label="Redundancy" value={selectedSystem.redundancy_group || '—'} />
              <Detail label="Description" value={selectedSystem.description || '—'} />
              <div className="pt-2">
                <a
                  href={`/systems/${selectedSystem.id}`}
                  className="text-blue-600 hover:underline text-xs"
                >
                  View full details →
                </a>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-slate-700 mt-0.5">{value}</dd>
    </div>
  );
}
