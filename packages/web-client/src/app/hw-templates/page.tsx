'use client';

import { useState } from 'react';
import { Plus, Trash2, Copy, Package } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProject } from '@/lib/project-context';
import { useHWTemplates, useProtocols } from '@/lib/queries';
import { api } from '@/lib/api-client';

export default function HWTemplatesPage() {
  const { currentProject } = useProject();
  const { data: templates = [], isLoading: loading, refetch } = useHWTemplates();
  const { data: protocols = [] } = useProtocols();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', manufacturer: '', part_number: '', description: '', system_type: 'lru', ata_chapter: '', ports: [{ name: '', protocol_id: '', direction: 'tx', connector_label: '' }], functions: [{ name: '', criticality: 'major', dal: '' }] });

  const addPort = () => setForm({ ...form, ports: [...form.ports, { name: '', protocol_id: '', direction: 'tx', connector_label: '' }] });
  const addFn = () => setForm({ ...form, functions: [...form.functions, { name: '', criticality: 'major', dal: '' }] });

  const create = async () => {
    if (!form.name.trim()) { alert('Name required'); return; }
    try {
      await api.post('hw-templates', { ...form, ports: form.ports.filter(p => p.name), functions: form.functions.filter(f => f.name) });
      setForm({ name: '', manufacturer: '', part_number: '', description: '', system_type: 'lru', ata_chapter: '', ports: [{ name: '', protocol_id: '', direction: 'tx', connector_label: '' }], functions: [{ name: '', criticality: 'major', dal: '' }] });
      setShowCreate(false); refetch();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
  };

  const instantiate = async (tmplId: string, tmplName: string) => {
    if (!currentProject) { alert('Select a project'); return; }
    const name = prompt('System name:', tmplName);
    if (!name) return;
    try {
      const res = await api.post<any>(`hw-templates/${tmplId}/instantiate`, { project_id: currentProject.id, name });
      alert(`Created "${name}" with ${res.portsCreated} ports and ${res.functionsCreated} functions`);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
  };

  const del = async (id: string) => { if (!confirm('Delete?')) return; await api.delete(`hw-templates/${id}`); refetch(); };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3"><Package className="h-6 w-6 text-primary" /><div><h1 className="text-2xl font-semibold tracking-tight">Hardware ICD Templates</h1><p className="text-sm text-muted-foreground">Reusable LRU definitions</p></div></div>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}><Plus className="mr-1 h-4 w-4" /> New Template</Button>
        </div>
        {showCreate && (
          <div className="mb-6 p-4 border rounded-lg bg-white space-y-3">
            <h3 className="text-sm font-semibold">New Template</h3>
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="Manufacturer" value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} />
              <Input placeholder="Part number" value={form.part_number} onChange={e => setForm({ ...form, part_number: e.target.value })} />
            </div>
            <div><div className="flex items-center justify-between"><span className="text-xs font-medium">Ports</span><button onClick={addPort} className="text-xs text-primary">+ Add</button></div>
              {form.ports.map((p, i) => (<div key={i} className="flex gap-1 mt-1"><Input placeholder="Port name" value={p.name} onChange={e => { const ports = [...form.ports]; ports[i] = { ...p, name: e.target.value }; setForm({ ...form, ports }); }} className="text-xs h-7" /><select value={p.protocol_id} onChange={e => { const ports = [...form.ports]; ports[i] = { ...p, protocol_id: e.target.value }; setForm({ ...form, ports }); }} className="text-xs border rounded px-1 h-7"><option value="">Protocol...</option>{protocols.map((pr: any) => <option key={pr.id} value={pr.id}>{pr.protocol_name}</option>)}</select></div>))}
            </div>
            <div><div className="flex items-center justify-between"><span className="text-xs font-medium">Functions</span><button onClick={addFn} className="text-xs text-primary">+ Add</button></div>
              {form.functions.map((f, i) => (<div key={i} className="flex gap-1 mt-1"><Input placeholder="Function name" value={f.name} onChange={e => { const fns = [...form.functions]; fns[i] = { ...f, name: e.target.value }; setForm({ ...form, functions: fns }); }} className="text-xs h-7" /></div>))}
            </div>
            <div className="flex gap-2"><Button size="sm" onClick={create}>Create</Button><Button size="sm" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button></div>
          </div>
        )}
        {loading ? <p className="text-muted-foreground">Loading…</p> : templates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground"><Package className="h-8 w-8 mx-auto mb-2" /><p>No templates yet.</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t: any) => (
              <div key={t.id} className="rounded-xl border bg-white p-5 hover:shadow-sm transition-all relative group">
                <div className="flex items-center justify-between mb-2"><h3 className="text-lg font-semibold">{t.name}</h3><span className="text-xs px-2 py-0.5 rounded-full bg-slate-100">{t.system_type}</span></div>
                <p className="text-xs text-slate-500 mb-2">{t.description || t.manufacturer}</p>
                <div className="flex gap-3 text-xs text-slate-500 mb-3"><span>{t.port_count} ports</span><span>{t.function_count} fns</span></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => instantiate(t.id, t.name)} className="text-xs"><Copy className="mr-1 h-3 w-3" /> Use in Project</Button>
                  <button onClick={() => del(t.id)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
