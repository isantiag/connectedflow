'use client';

import { useState } from 'react';
import { Plus, Trash2, Search, Download } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProject } from '@/lib/project-context';
import { useSystems, useCreateSystem, useDeleteSystem } from '@/lib/queries';
import { api } from '@/lib/api-client';

export default function SystemsPage() {
  const { currentProject } = useProject();
  const { data: systems = [], isLoading: loading } = useSystems(currentProject?.id);
  const createMutation = useCreateSystem();
  const deleteMutation = useDeleteSystem();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', system_type: 'lru', manufacturer: '', part_number: '', ata_chapter: '', description: '' });

  const filtered = systems.filter((s: any) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.description || '').toLowerCase().includes(search.toLowerCase()));

  const createSystem = async () => {
    if (!form.name.trim() || !currentProject) return;
    try {
      await createMutation.mutateAsync({ ...form, project_id: currentProject.id });
      setForm({ name: '', system_type: 'lru', manufacturer: '', part_number: '', ata_chapter: '', description: '' });
      setShowCreate(false);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
  };

  const deleteSystem = async (id: string) => {
    if (!confirm('Delete this system and all its ports, connections, messages, and parameters?')) return;
    await deleteMutation.mutateAsync(id);
  };

  const exportICD = () => { if (currentProject) window.open(`http://localhost:4001/api/export/icd?projectId=${currentProject.id}`, '_blank'); };
  const exportPDF = () => { if (currentProject) window.open(`http://localhost:4001/api/export/icd-pdf?projectId=${currentProject.id}`, '_blank'); };
  const exportDBC = () => { if (currentProject) window.open(`http://localhost:4001/api/export/dbc?projectId=${currentProject.id}`, '_blank'); };
  const exportSimulink = () => { if (currentProject) window.open(`http://localhost:4001/api/export/simulink?projectId=${currentProject.id}`, '_blank'); };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Systems</h1>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search systems..." className="pl-9 w-48" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" onClick={exportDBC}><Download className="mr-1 h-4 w-4" /> DBC</Button>
            <Button size="sm" variant="outline" onClick={exportSimulink}><Download className="mr-1 h-4 w-4" /> Simulink</Button>
            <Button size="sm" variant="outline" onClick={exportPDF}><Download className="mr-1 h-4 w-4" /> PDF</Button>
            <Button size="sm" variant="outline" onClick={exportICD}><Download className="mr-1 h-4 w-4" /> Excel</Button>
            <Button size="sm" onClick={() => setShowCreate(!showCreate)}><Plus className="mr-1 h-4 w-4" /> New System</Button>
          </div>
        </div>

        {showCreate && (
          <div className="mb-4 p-4 border rounded-lg bg-white space-y-2">
            <h3 className="text-sm font-semibold">New System</h3>
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Name (e.g. FCC) *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <select value={form.system_type} onChange={e => setForm({ ...form, system_type: e.target.value })} className="text-sm border rounded px-2 py-1">
                <option value="lru">LRU</option><option value="sensor">Sensor</option><option value="actuator">Actuator</option><option value="switch">Switch</option><option value="bus_coupler">Bus Coupler</option>
              </select>
              <Input placeholder="Manufacturer" value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} />
              <Input placeholder="Part number" value={form.part_number} onChange={e => setForm({ ...form, part_number: e.target.value })} />
              <Input placeholder="ATA chapter" value={form.ata_chapter} onChange={e => setForm({ ...form, ata_chapter: e.target.value })} />
              <Input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex gap-2 mt-2">
              <Button size="sm" onClick={createSystem}>Create System</Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : !currentProject ? (
          <p className="text-muted-foreground">No project selected. Create one from the header.</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground">{search ? 'No systems match your search' : 'No systems defined. Click "New System" to create one.'}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm transition-all relative group">
                <button onClick={() => deleteSystem(s.id)} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity" title="Delete system">
                  <Trash2 className="h-4 w-4" />
                </button>
                <a href={`/systems/${s.id}`} className="block">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-slate-900">{s.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{s.system_type}</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">{s.description}</p>
                  <div className="flex gap-4 text-xs text-slate-500">
                    <span>{s.connection_count} connections</span>
                    <span>{s.port_count} ports</span>
                    {s.ata_chapter && <span>ATA {s.ata_chapter}</span>}
                  </div>
                  {s.manufacturer && <div className="text-xs text-slate-400 mt-1">{s.manufacturer}</div>}
                </a>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
