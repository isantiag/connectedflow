'use client';

import { Bell, Moon, Plus, Sun, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProject } from '@/lib/project-context';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api-client';

interface Project { id: string; name: string; aircraft_type: string; program_phase: string; }

export function Header() {
  const [dark, setDark] = useState(false);
  const { projects, currentProject, setProjectId, addProject } = useProject();
  const { user, logout } = useAuth();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', aircraft_type: '', certification_basis: '', program_phase: 'concept' });

  const toggleTheme = () => { setDark(prev => { const next = !prev; document.documentElement.classList.toggle('dark', next); return next; }); };

  const createProject = async () => {
    if (!form.name.trim()) return;
    try {
      const proj = await api.post<Project>('projects', form);
      addProject(proj);
      setForm({ name: '', aircraft_type: '', certification_basis: '', program_phase: 'concept' });
      setShowNew(false);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
  };

  return (
    <header className="border-b bg-card">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <select value={currentProject?.id || ''} onChange={e => setProjectId(e.target.value)} className="text-sm font-medium border rounded px-2 py-1 bg-white max-w-[250px]">
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={() => setShowNew(!showNew)} className="text-xs text-primary hover:underline flex items-center gap-0.5">
            <Plus className="h-3 w-3" /> New
          </button>
          {currentProject && <span className="text-xs text-muted-foreground">{currentProject.aircraft_type} · {currentProject.program_phase}</span>}
        </div>
        <div className="flex items-center gap-2">
          {user && (
            <div className="flex items-center gap-2 mr-2">
              <span className="text-xs text-slate-600">{user.displayName}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{user.role}</span>
            </div>
          )}
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
          <Button variant="ghost" size="icon" aria-label="Notifications"><Bell className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={logout} className="text-xs text-slate-500">Logout</Button>
        </div>
      </div>
      {showNew && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <Input placeholder="Project name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="h-8 text-sm w-48" />
          <Input placeholder="Aircraft type" value={form.aircraft_type} onChange={e => setForm({ ...form, aircraft_type: e.target.value })} className="h-8 text-sm w-36" />
          <Input placeholder="Cert. basis" value={form.certification_basis} onChange={e => setForm({ ...form, certification_basis: e.target.value })} className="h-8 text-sm w-36" />
          <select value={form.program_phase} onChange={e => setForm({ ...form, program_phase: e.target.value })} className="text-sm border rounded px-2 py-1 h-8">
            <option value="concept">Concept</option><option value="preliminary">Preliminary</option><option value="detailed">Detailed</option><option value="certification">Certification</option>
          </select>
          <Button size="sm" className="h-8" onClick={createProject}>Create</Button>
          <button onClick={() => setShowNew(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
      )}
    </header>
  );
}
