'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConnectionMessages, useConnection, useProtocols } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

interface Message { id: string; message_id_primary: string; message_id_secondary: string | null; name: string; refresh_rate_hz: number | null; protocol_attrs: Record<string, unknown>; parameter_count: number; }
interface Protocol { id: string; protocol_name: string; field_schema: { message_fields: string[]; parameter_fields: string[] }; }
interface Connection { id: string; name: string; protocol_id: string; }

export default function ConnectionMessagesPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: messages = [], isLoading: loading } = useConnectionMessages(id) as { data: Message[]; isLoading: boolean };
  const { data: protocols = [] } = useProtocols() as { data: Protocol[] };
  const { data: conn = null } = useConnection(id) as { data: Connection | null };
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ message_id_primary: '', message_id_secondary: '', name: '', refresh_rate_hz: '', protocol_attrs: {} as Record<string, string> });

  const reload = () => {
    queryClient.invalidateQueries({ queryKey: ['connection-messages', id] });
    queryClient.invalidateQueries({ queryKey: ['connection', id] });
  };

  const proto = protocols.find(p => p.id === conn?.protocol_id);
  const dynamicCols = proto?.field_schema?.message_fields || [];
  const formatKey = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const resetForm = () => setForm({ message_id_primary: '', message_id_secondary: '', name: '', refresh_rate_hz: '', protocol_attrs: {} });

  const startEdit = (m: Message) => {
    setEditId(m.id);
    setForm({
      message_id_primary: m.message_id_primary, message_id_secondary: m.message_id_secondary || '',
      name: m.name, refresh_rate_hz: m.refresh_rate_hz != null ? String(m.refresh_rate_hz) : '',
      protocol_attrs: Object.fromEntries(Object.entries(m.protocol_attrs || {}).map(([k, v]) => [k, String(v ?? '')])),
    });
    setShowForm(false);
  };

  const save = async () => {
    if (!form.message_id_primary.trim()) { alert('Message ID is required'); return; }
    const payload = {
      message_id_primary: form.message_id_primary, message_id_secondary: form.message_id_secondary || null,
      name: form.name, refresh_rate_hz: form.refresh_rate_hz ? parseFloat(form.refresh_rate_hz) : null,
      protocol_attrs: form.protocol_attrs,
    };
    try {
      if (editId) {
        await api.put(`messages/${editId}`, payload);
      } else {
        await api.post('messages', { connection_id: id, protocol_id: conn?.protocol_id, ...payload });
      }
      resetForm(); setShowForm(false); setEditId(null); reload();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
  };

  const deleteMsg = async (msgId: string) => {
    if (!confirm('Delete this message and all its parameters?')) return;
    await api.delete(`messages/${msgId}`); reload();
  };

  const renderForm = (label: string) => (
    <div className="mb-4 p-4 border rounded-lg bg-white space-y-2">
      <h3 className="text-sm font-semibold">{label}</h3>
      <div className="grid grid-cols-4 gap-2">
        <Input placeholder="Message ID (e.g. 0310) *" value={form.message_id_primary} onChange={e => setForm({ ...form, message_id_primary: e.target.value })} />
        <Input placeholder="Secondary ID (e.g. SDI)" value={form.message_id_secondary} onChange={e => setForm({ ...form, message_id_secondary: e.target.value })} />
        <Input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Input placeholder="Rate (Hz)" value={form.refresh_rate_hz} onChange={e => setForm({ ...form, refresh_rate_hz: e.target.value })} />
      </div>
      {dynamicCols.length > 0 && (
        <div>
          <label className="text-xs text-slate-500">Protocol fields ({proto?.protocol_name})</label>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {dynamicCols.map(col => (
              <Input key={col} placeholder={formatKey(col)} value={form.protocol_attrs[col] || ''} onChange={e => setForm({ ...form, protocol_attrs: { ...form.protocol_attrs, [col]: e.target.value } })} className="text-xs" />
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={save}>{editId ? 'Save' : 'Create'}</Button>
        <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setEditId(null); resetForm(); }}>Cancel</Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="text-xs text-slate-400 mb-4">
          <a href="/systems" className="hover:text-slate-600">Systems</a><span className="mx-1">›</span>
          <span className="text-slate-700 font-medium">Messages</span>
          {proto && <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{proto.protocol_name}</span>}
        </div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Messages{conn?.name ? ` — ${conn.name}` : ''}</h1>
          <Button size="sm" onClick={() => { setShowForm(!showForm); setEditId(null); resetForm(); }}><Plus className="mr-1 h-4 w-4" /> New Message</Button>
        </div>

        {(showForm || editId) && renderForm(editId ? 'Edit Message' : 'New Message')}

        {loading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                {dynamicCols.map(col => <th key={col} className="px-3 py-2 text-left font-medium">{formatKey(col)}</th>)}
                <th className="px-3 py-2 text-left font-medium">Rate (Hz)</th>
                <th className="px-3 py-2 text-left font-medium">Params</th>
                <th className="w-20 px-3 py-2" />
              </tr></thead>
              <tbody>
                {messages.length === 0 ? (
                  <tr><td colSpan={5 + dynamicCols.length} className="px-3 py-6 text-center text-muted-foreground">No messages. Click "New Message" to add one.</td></tr>
                ) : messages.map(m => (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono font-medium">{m.message_id_primary}{m.message_id_secondary && <span className="text-slate-400 ml-1">/{m.message_id_secondary}</span>}</td>
                    <td className="px-3 py-2">{m.name}</td>
                    {dynamicCols.map(col => <td key={col} className="px-3 py-2 text-muted-foreground font-mono text-xs">{m.protocol_attrs?.[col] != null ? String(m.protocol_attrs[col]) : '—'}</td>)}
                    <td className="px-3 py-2 text-muted-foreground">{m.refresh_rate_hz ?? '—'}</td>
                    <td className="px-3 py-2">{m.parameter_count}</td>
                    <td className="px-3 py-2 flex gap-1">
                      <a href={`/messages/${m.id}`} className="text-primary hover:underline text-xs">Detail →</a>
                      <button onClick={() => startEdit(m)} className="text-slate-400 hover:text-primary"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => deleteMsg(m.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
