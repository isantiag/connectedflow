'use client';

import { useState } from 'react';
import { GitBranch, Plus, Trash2, Eye } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProject } from '@/lib/project-context';
import { useAuth } from '@/lib/auth-context';
import { useBaselines, useCreateBaseline } from '@/lib/queries';
import { api } from '@/lib/api-client';

export default function BaselinesPage() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { data: baselines = [], isLoading: loading, refetch } = useBaselines(currentProject?.id);
  const createMutation = useCreateBaseline();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ versionLabel: '', description: '' });
  const [viewId, setViewId] = useState<string | null>(null);
  const [viewData, setViewData] = useState<any>(null);

  const createBaseline = async () => {
    if (!form.versionLabel.trim() || !currentProject) return;
    try {
      await createMutation.mutateAsync({ projectId: currentProject.id, versionLabel: form.versionLabel, description: form.description });
      setForm({ versionLabel: '', description: '' }); setShowCreate(false);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
  };

  const deleteBaseline = async (id: string) => {
    if (!confirm('Delete this baseline?')) return;
    await api.delete(`baselines/${id}`); refetch();
  };

  const viewSnapshot = async (id: string) => {
    if (viewId === id) { setViewId(null); setViewData(null); return; }
    setViewId(id);
    setViewData(await api.get(`baselines/${id}`));
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3"><GitBranch className="h-6 w-6 text-primary" /><h1 className="text-2xl font-semibold tracking-tight">Baselines</h1></div>
          {isAdmin && <Button size="sm" onClick={() => setShowCreate(!showCreate)}><Plus className="mr-1 h-4 w-4" /> Freeze Baseline</Button>}
        </div>
        {showCreate && (
          <div className="mb-4 p-4 border rounded-lg bg-white space-y-2">
            <h3 className="text-sm font-semibold">Freeze Current State</h3>
            <div className="flex gap-2">
              <Input placeholder="Version label *" value={form.versionLabel} onChange={e => setForm({ ...form, versionLabel: e.target.value })} className="w-48" />
              <Input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="flex-1" />
              <Button size="sm" onClick={createBaseline} disabled={createMutation.isPending}>{createMutation.isPending ? 'Freezing...' : 'Freeze'}</Button>
              <Button size="sm" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {loading ? <p className="text-muted-foreground">Loading…</p> : baselines.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground"><GitBranch className="h-8 w-8 mx-auto mb-2" /><p>No baselines yet.</p></div>
        ) : (
          <div className="space-y-3">
            {baselines.map((b: any) => (
              <div key={b.id} className="rounded-lg border bg-white overflow-hidden">
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><GitBranch className="h-5 w-5 text-primary" /></div>
                    <div>
                      <div className="flex items-center gap-2"><span className="font-semibold">{b.version_label}</span><span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{b.status}</span></div>
                      <p className="text-xs text-slate-500">{b.description || 'No description'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {b.hierarchy && <div className="flex gap-3 text-xs text-slate-500"><span>{b.hierarchy.systems} sys</span><span>{b.hierarchy.messages} msgs</span><span>{b.hierarchy.parameters} params</span></div>}
                    <span className="text-xs text-slate-400">{new Date(b.created_at).toLocaleDateString()}</span>
                    <button onClick={() => viewSnapshot(b.id)} className="text-slate-400 hover:text-primary"><Eye className="h-4 w-4" /></button>
                    {isAdmin && <button onClick={() => deleteBaseline(b.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </div>
                {viewId === b.id && viewData?.snapshot && (
                  <div className="border-t p-4 bg-slate-50 text-xs">
                    <div className="grid grid-cols-4 gap-4">
                      <div><div className="font-medium mb-1">Systems ({viewData.snapshot.systems?.length || 0})</div>{(viewData.snapshot.systems || []).map((s: any, i: number) => <div key={i} className="text-slate-500">{s.name}</div>)}</div>
                      <div><div className="font-medium mb-1">Connections ({viewData.snapshot.connections?.length || 0})</div>{(viewData.snapshot.connections || []).slice(0, 10).map((c: any, i: number) => <div key={i} className="text-slate-500">{c.name || c.id}</div>)}</div>
                      <div><div className="font-medium mb-1">Messages ({viewData.snapshot.messages?.length || 0})</div>{(viewData.snapshot.messages || []).slice(0, 10).map((m: any, i: number) => <div key={i} className="text-slate-500">{m.message_id_primary} {m.name}</div>)}</div>
                      <div><div className="font-medium mb-1">Parameters ({viewData.snapshot.parameters?.length || 0})</div>{(viewData.snapshot.parameters || []).slice(0, 10).map((p: any, i: number) => <div key={i} className="text-slate-500">{p.name}</div>)}</div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
