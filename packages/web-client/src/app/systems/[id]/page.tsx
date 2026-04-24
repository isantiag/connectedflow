'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConnectionDiagram } from '@/components/connection-diagram';
import { useSystem, useSystemConnections, useSystemPartitions, useProtocols } from '@/lib/queries';
import { api } from '@/lib/api-client';

interface Port { id: string; name: string; protocol_name: string; protocol_id: string; direction: string; connector_label: string; }
interface Func { id: string; name: string; criticality: string; dal: string; }
interface SystemDetail { id: string; name: string; system_type: string; manufacturer: string; description: string; ata_chapter: string; project_id: string; ports: Port[]; functions: Func[]; }
interface ConnSummary { id: string; name: string; remote_system_name: string; protocol_name: string; protocol_id: string; direction: string; message_count: number; }
interface Protocol { id: string; protocol_name: string; }
interface SystemListItem { id: string; name: string; }
interface RemotePort { id: string; name: string; protocol_name: string; direction: string; }
interface Partition { id: string; partition_id: string; name: string; description: string; scheduling_period_ms: number | null; scheduling_duration_ms: number | null; memory_bytes: number | null; criticality: string; dal: string; partition_type: string; ports: { port_name: string; port_direction: string }[]; functions: { function_name: string; criticality: string }[]; }

export default function SystemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [sys, setSys] = useState<SystemDetail | null>(null);
  const [conns, setConns] = useState<ConnSummary[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [portForm, setPortForm] = useState({ name: '', protocol_id: '', direction: 'tx', connector_label: '' });
  const [fnForm, setFnForm] = useState({ name: '', criticality: 'major', dal: '' });
  const [showPortForm, setShowPortForm] = useState(false);
  const [showFnForm, setShowFnForm] = useState(false);
  const [editPortId, setEditPortId] = useState<string | null>(null);
  const [editFnId, setEditFnId] = useState<string | null>(null);
  const [showConnForm, setShowConnForm] = useState(false);
  const [allSystems, setAllSystems] = useState<SystemListItem[]>([]);
  const [remotePorts, setRemotePorts] = useState<RemotePort[]>([]);
  const [partitions, setPartitions] = useState<Partition[]>([]);
  const [showPartForm, setShowPartForm] = useState(false);
  const [partForm, setPartForm] = useState({ partition_id: '', name: '', scheduling_period_ms: '', scheduling_duration_ms: '', memory_bytes: '', criticality: 'major', dal: '', partition_type: 'application' });
  const [connForm, setConnForm] = useState({ remoteSysId: '', localPortId: '', remotePortId: '', protocolId: '', name: '' });

  const reload = () => {
    if (!id) return;
    Promise.all([
      api.get<SystemDetail>(`systems/${id}`),
      api.get<ConnSummary[]>(`systems/${id}/connections`),
      api.get<Protocol[]>('protocols'),
      api.get<SystemListItem[]>('systems'),
      api.get<Partition[]>(`systems/${id}/partitions`).catch(() => []),
    ]).then(([s, c, p, allSys, parts]) => { setSys(s); setConns(c); setProtocols(p); setAllSystems(allSys.filter(x => x.id !== id)); setPartitions(parts); }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(reload, [id]);

  // When remote system changes, fetch its ports
  useEffect(() => {
    if (!connForm.remoteSysId) { setRemotePorts([]); return; }
    api.get<SystemDetail>(`systems/${connForm.remoteSysId}`).then(s => setRemotePorts(s.ports || [])).catch(() => setRemotePorts([]));
  }, [connForm.remoteSysId]);

  const createConnection = async () => {
    if (!connForm.localPortId || !connForm.remotePortId || !connForm.protocolId) {
      alert('Select local port, remote port, and protocol'); return;
    }
    try {
      const localPort = sys?.ports.find(p => p.id === connForm.localPortId);
      const isLocalTx = localPort?.direction === 'tx';
      await api.post('connections', {
        project_id: sys?.project_id,
        source_port_id: isLocalTx ? connForm.localPortId : connForm.remotePortId,
        dest_port_id: isLocalTx ? connForm.remotePortId : connForm.localPortId,
        protocol_id: connForm.protocolId,
        name: connForm.name || undefined,
      });
      setConnForm({ remoteSysId: '', localPortId: '', remotePortId: '', protocolId: '', name: '' });
      setShowConnForm(false);
      reload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to create connection');
    }
  };

  const createPort = async () => {
    if (!portForm.name.trim()) return;
    try {
      if (editPortId) {
        await api.put(`ports/${editPortId}`, { ...portForm, protocol_id: portForm.protocol_id || null });
        setEditPortId(null);
      } else {
        await api.post('ports', { system_id: id, ...portForm, protocol_id: portForm.protocol_id || null });
      }
      setPortForm({ name: '', protocol_id: '', direction: 'tx', connector_label: '' });
      setShowPortForm(false);
      reload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save port.');
    }
  };

  const startEditPort = (p: Port) => {
    setEditPortId(p.id);
    setPortForm({ name: p.name, protocol_id: p.protocol_id || '', direction: p.direction, connector_label: p.connector_label });
    setShowPortForm(true);
  };

  const deletePort = async (portId: string) => {
    if (!confirm('Delete this port?')) return;
    await api.delete(`ports/${portId}`);
    reload();
  };

  const createFn = async () => {
    if (!fnForm.name.trim()) return;
    try {
      if (editFnId) {
        await api.put(`functions/${editFnId}`, fnForm);
        setEditFnId(null);
      } else {
        await api.post('functions', { system_id: id, ...fnForm });
      }
      setFnForm({ name: '', criticality: 'major', dal: '' });
      setShowFnForm(false);
      reload();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save function.');
    }
  };

  const startEditFn = (f: Func) => {
    setEditFnId(f.id);
    setFnForm({ name: f.name, criticality: f.criticality, dal: f.dal });
    setShowFnForm(true);
  };

  const createPartition = async () => {
    if (!partForm.partition_id.trim() || !partForm.name.trim()) { alert('Partition ID and name required'); return; }
    try {
      await api.post('partitions', { system_id: id, ...partForm, scheduling_period_ms: partForm.scheduling_period_ms ? parseInt(partForm.scheduling_period_ms) : null, scheduling_duration_ms: partForm.scheduling_duration_ms ? parseInt(partForm.scheduling_duration_ms) : null, memory_bytes: partForm.memory_bytes ? parseInt(partForm.memory_bytes) : null });
      setPartForm({ partition_id: '', name: '', scheduling_period_ms: '', scheduling_duration_ms: '', memory_bytes: '', criticality: 'major', dal: '', partition_type: 'application' });
      setShowPartForm(false); reload();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
  };

  const deletePartition = async (partId: string) => {
    if (!confirm('Delete this partition?')) return;
    await api.delete(`partitions/${partId}`); reload();
  };

  const deleteFn = async (fnId: string) => {
    if (!confirm('Delete this function?')) return;
    await api.delete(`functions/${fnId}`);
    reload();
  };

  const deleteConn = async (connId: string) => {
    if (!confirm('Delete this connection and all its messages/parameters?')) return;
    await api.delete(`connections/${connId}`);
    reload();
  };

  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!sys) return <div className="p-8 text-muted-foreground">System not found</div>;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="text-xs text-slate-400 mb-4">
          <a href="/systems" className="hover:text-slate-600">Systems</a><span className="mx-1">›</span>
          <span className="text-slate-700 font-medium">{sys.name}</span>
        </div>
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">{sys.name}</h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{sys.system_type}</span>
          {sys.manufacturer && <span className="text-xs text-slate-400">{sys.manufacturer}</span>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Connections (main content) */}
          <div className="lg:col-span-2">
            <ConnectionDiagram systemName={sys.name} connections={conns} onConnectionClick={(id) => window.location.href = `/connections/${id}`} />
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-800">Connections ({conns.length})</h2>
              <button onClick={() => setShowConnForm(!showConnForm)} className="text-xs text-primary hover:underline">+ New Connection</button>
            </div>

            {showConnForm && (
              <div className="mb-4 p-4 border rounded-lg bg-white space-y-2">
                <h3 className="text-sm font-semibold">New Connection</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500">Local Port ({sys.name})</label>
                    <select value={connForm.localPortId} onChange={e => { setConnForm({ ...connForm, localPortId: e.target.value }); const p = sys.ports.find(x => x.id === e.target.value); if (p?.protocol_id) setConnForm(f => ({ ...f, localPortId: e.target.value, protocolId: p.protocol_id })); }} className="w-full text-sm border rounded px-2 py-1">
                      <option value="">Select port...</option>
                      {sys.ports.map(p => <option key={p.id} value={p.id}>{p.name} ({p.protocol_name}, {p.direction})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Remote System</label>
                    <select value={connForm.remoteSysId} onChange={e => setConnForm({ ...connForm, remoteSysId: e.target.value, remotePortId: '' })} className="w-full text-sm border rounded px-2 py-1">
                      <option value="">Select system...</option>
                      {allSystems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Remote Port</label>
                    <select value={connForm.remotePortId} onChange={e => setConnForm({ ...connForm, remotePortId: e.target.value })} className="w-full text-sm border rounded px-2 py-1">
                      <option value="">Select port...</option>
                      {remotePorts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.protocol_name}, {p.direction})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Protocol</label>
                    <select value={connForm.protocolId} onChange={e => setConnForm({ ...connForm, protocolId: e.target.value })} className="w-full text-sm border rounded px-2 py-1">
                      <option value="">Select protocol...</option>
                      {protocols.map(p => <option key={p.id} value={p.id}>{p.protocol_name}</option>)}
                    </select>
                  </div>
                </div>
                <Input placeholder="Connection name (optional)" value={connForm.name} onChange={e => setConnForm({ ...connForm, name: e.target.value })} className="text-sm" />
                <div className="flex gap-2">
                  <Button size="sm" onClick={createConnection}>Create Connection</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowConnForm(false)}>Cancel</Button>
                </div>
              </div>
            )}
            <div className="rounded-lg border">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Direction</th>
                  <th className="px-4 py-2 text-left font-medium">Remote System</th>
                  <th className="px-4 py-2 text-left font-medium">Protocol</th>
                  <th className="px-4 py-2 text-left font-medium">Messages</th>
                  <th className="w-20 px-4 py-2" />
                </tr></thead>
                <tbody>
                  {conns.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No connections</td></tr>
                  ) : conns.map(c => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2"><span className={`text-xs px-1.5 py-0.5 rounded font-medium ${c.direction === 'tx' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>{c.direction === 'tx' ? '→ TX' : '← RX'}</span></td>
                      <td className="px-4 py-2 font-medium">{c.remote_system_name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{c.protocol_name}</td>
                      <td className="px-4 py-2">{c.message_count}</td>
                      <td className="px-4 py-2 flex gap-2">
                        <a href={`/connections/${c.id}`} className="text-primary hover:underline text-xs">View →</a>
                        <button onClick={() => deleteConn(c.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            {/* Ports */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-slate-800">Ports ({sys.ports.length})</h2>
                <button onClick={() => setShowPortForm(!showPortForm)} className="text-xs text-primary hover:underline">+ Add</button>
              </div>
              {showPortForm && (
                <div className="mb-2 p-2 border rounded bg-white space-y-1">
                  <Input placeholder="Port name *" value={portForm.name} onChange={e => setPortForm({ ...portForm, name: e.target.value })} className="text-xs h-7" />
                  <div className="flex gap-1">
                    <select value={portForm.protocol_id} onChange={e => setPortForm({ ...portForm, protocol_id: e.target.value })} className="text-xs border rounded px-1 py-1 flex-1">
                      <option value="">Protocol...</option>
                      {protocols.map(p => <option key={p.id} value={p.id}>{p.protocol_name}</option>)}
                    </select>
                    <select value={portForm.direction} onChange={e => setPortForm({ ...portForm, direction: e.target.value })} className="text-xs border rounded px-1 py-1">
                      <option value="tx">TX</option><option value="rx">RX</option><option value="bidirectional">Bidir</option>
                    </select>
                  </div>
                  <Input placeholder="Connector (e.g. J1)" value={portForm.connector_label} onChange={e => setPortForm({ ...portForm, connector_label: e.target.value })} className="text-xs h-7" />
                  <Button size="sm" onClick={createPort} className="text-xs h-7">{editPortId ? 'Save Port' : 'Add Port'}</Button>
                </div>
              )}
              <div className="space-y-1">
                {sys.ports.map(p => (
                  <div key={p.id} className="text-xs p-2 rounded border bg-white flex justify-between items-center group">
                    <span className="font-medium">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{p.protocol_name} · {p.direction} · {p.connector_label}</span>
                      <button onClick={() => startEditPort(p)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-primary"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => deletePort(p.id)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Functions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-slate-800">Functions ({sys.functions.length})</h2>
                <button onClick={() => setShowFnForm(!showFnForm)} className="text-xs text-primary hover:underline">+ Add</button>
              </div>
              {showFnForm && (
                <div className="mb-2 p-2 border rounded bg-white space-y-1">
                  <Input placeholder="Function name *" value={fnForm.name} onChange={e => setFnForm({ ...fnForm, name: e.target.value })} className="text-xs h-7" />
                  <div className="flex gap-1">
                    <select value={fnForm.criticality} onChange={e => setFnForm({ ...fnForm, criticality: e.target.value })} className="text-xs border rounded px-1 py-1 flex-1">
                      <option value="catastrophic">Catastrophic</option><option value="hazardous">Hazardous</option><option value="major">Major</option><option value="minor">Minor</option><option value="no_effect">No Effect</option>
                    </select>
                    <Input placeholder="DAL" value={fnForm.dal} onChange={e => setFnForm({ ...fnForm, dal: e.target.value })} className="text-xs h-7 w-16" />
                  </div>
                  <Button size="sm" onClick={createFn} className="text-xs h-7">{editFnId ? 'Save Function' : 'Add Function'}</Button>
                </div>
              )}
              <div className="space-y-1">
                {sys.functions.map(f => (
                  <div key={f.id} className="text-xs p-2 rounded border bg-white flex justify-between items-center group">
                    <span className="font-medium">{f.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">{f.criticality} · DAL {f.dal}</span>
                      <button onClick={() => startEditFn(f)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-primary"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => deleteFn(f.id)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ARINC 653 Partitions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-slate-800">Partitions ({partitions.length})</h2>
                <button onClick={() => setShowPartForm(!showPartForm)} className="text-xs text-primary hover:underline">+ Add</button>
              </div>
              {showPartForm && (
                <div className="mb-2 p-2 border rounded bg-white space-y-1">
                  <div className="flex gap-1">
                    <Input placeholder="Partition ID *" value={partForm.partition_id} onChange={e => setPartForm({ ...partForm, partition_id: e.target.value })} className="text-xs h-7" />
                    <Input placeholder="Name *" value={partForm.name} onChange={e => setPartForm({ ...partForm, name: e.target.value })} className="text-xs h-7" />
                  </div>
                  <div className="flex gap-1">
                    <Input placeholder="Period (ms)" value={partForm.scheduling_period_ms} onChange={e => setPartForm({ ...partForm, scheduling_period_ms: e.target.value })} className="text-xs h-7" />
                    <Input placeholder="Duration (ms)" value={partForm.scheduling_duration_ms} onChange={e => setPartForm({ ...partForm, scheduling_duration_ms: e.target.value })} className="text-xs h-7" />
                  </div>
                  <div className="flex gap-1">
                    <Input placeholder="Memory (bytes)" value={partForm.memory_bytes} onChange={e => setPartForm({ ...partForm, memory_bytes: e.target.value })} className="text-xs h-7" />
                    <Input placeholder="DAL" value={partForm.dal} onChange={e => setPartForm({ ...partForm, dal: e.target.value })} className="text-xs h-7 w-16" />
                  </div>
                  <Button size="sm" onClick={createPartition} className="text-xs h-7">Add Partition</Button>
                </div>
              )}
              <div className="space-y-1">
                {partitions.map(p => (
                  <div key={p.id} className="text-xs p-2 rounded border bg-white group">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{p.partition_id}: {p.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">{p.dal ? 'DAL '+p.dal : ''} {p.partition_type}</span>
                        <button onClick={() => deletePartition(p.id)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </div>
                    {(p.scheduling_period_ms || p.memory_bytes) && (
                      <div className="text-slate-400 mt-0.5">
                        {p.scheduling_period_ms && <span>Period: {p.scheduling_period_ms}ms </span>}
                        {p.scheduling_duration_ms && <span>Duration: {p.scheduling_duration_ms}ms </span>}
                        {p.memory_bytes && <span>Mem: {(p.memory_bytes/1024).toFixed(0)}KB</span>}
                      </div>
                    )}
                    {p.functions.length > 0 && <div className="text-slate-400 mt-0.5">Functions: {p.functions.map(f => f.function_name).join(', ')}</div>}
                    {p.ports.length > 0 && <div className="text-slate-400 mt-0.5">Ports: {p.ports.map(pt => pt.port_name).join(', ')}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
