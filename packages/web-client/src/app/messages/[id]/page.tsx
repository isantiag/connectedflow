'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMessageParameters, useMessage, useProtocols } from '@/lib/queries';
import { api } from '@/lib/api-client';

interface Param { id: string; name: string; bit_offset: number; bit_length: number; encoding: string; units: string; min_value: number | null; max_value: number | null; resolution: number | null; ssm_convention: string | null; function_name: string | null; protocol_attrs: Record<string, unknown>; criticality: string; }
interface Protocol { id: string; protocol_name: string; field_schema: { message_fields: string[]; parameter_fields: string[] }; }
interface MessageDetail { id: string; name: string; message_id_primary: string; protocol_id: string; }

export default function MessageParametersPage() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useState<Param[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [msg, setMsg] = useState<MessageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', bit_offset: '', bit_length: '', encoding: 'BNR', units: '', min_value: '', max_value: '', resolution: '', ssm_convention: '', protocol_attrs: {} as Record<string, string> });

  const reload = () => {
    if (!id) return;
    Promise.all([
      api.get<Param[]>(`messages/${id}/parameters`),
      api.get<Protocol[]>('protocols'),
      api.get<MessageDetail>(`messages/${id}`).catch(() => null),
    ]).then(([p, protos, m]) => { setParams(p); setProtocols(protos); if (m) setMsg(m); })
      .catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(reload, [id]);

  const proto = protocols.find(p => p.id === msg?.protocol_id);
  const dynamicCols = proto?.field_schema?.parameter_fields || [];
  const formatKey = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const resetForm = () => setForm({ name: '', bit_offset: '', bit_length: '', encoding: 'BNR', units: '', min_value: '', max_value: '', resolution: '', ssm_convention: '', protocol_attrs: {} });

  const startEdit = (p: Param) => {
    setEditId(p.id);
    setForm({
      name: p.name, bit_offset: String(p.bit_offset), bit_length: String(p.bit_length),
      encoding: p.encoding, units: p.units || '', min_value: p.min_value != null ? String(p.min_value) : '',
      max_value: p.max_value != null ? String(p.max_value) : '', resolution: p.resolution != null ? String(p.resolution) : '',
      ssm_convention: p.ssm_convention || '',
      protocol_attrs: Object.fromEntries(Object.entries(p.protocol_attrs || {}).map(([k, v]) => [k, String(v ?? '')])),
    });
    setShowForm(false);
  };

  const saveEdit = async () => {
    if (!editId || !form.name.trim()) return;
    try {
      await api.put(`parameters/${editId}`, {
        name: form.name, bit_offset: parseInt(form.bit_offset) || 0, bit_length: parseInt(form.bit_length) || 1,
        encoding: form.encoding, units: form.units,
        min_value: form.min_value ? parseFloat(form.min_value) : null,
        max_value: form.max_value ? parseFloat(form.max_value) : null,
        resolution: form.resolution ? parseFloat(form.resolution) : null,
        ssm_convention: form.ssm_convention || null, protocol_attrs: form.protocol_attrs,
      });
      setEditId(null); resetForm(); reload();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
  };

  const createParam = async () => {
    if (!form.name.trim()) { alert('Parameter name is required'); return; }
    try {
      await api.post('parameters', {
        message_id: id, name: form.name, bit_offset: parseInt(form.bit_offset) || 0, bit_length: parseInt(form.bit_length) || 1,
        encoding: form.encoding, units: form.units,
        min_value: form.min_value ? parseFloat(form.min_value) : null,
        max_value: form.max_value ? parseFloat(form.max_value) : null,
        resolution: form.resolution ? parseFloat(form.resolution) : null,
        ssm_convention: form.ssm_convention || null, protocol_attrs: form.protocol_attrs,
      });
      resetForm(); setShowForm(false); reload();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
  };

  const deleteParam = async (paramId: string) => {
    if (!confirm('Delete this parameter?')) return;
    await api.delete(`parameters/${paramId}`); reload();
  };

  const renderForm = (onSave: () => void, onCancel: () => void, label: string) => (
    <div className="mb-4 p-4 border rounded-lg bg-white space-y-2">
      <h3 className="text-sm font-semibold">{label}</h3>
      <div className="grid grid-cols-4 gap-2">
        <Input placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <Input placeholder="Bit offset" type="number" value={form.bit_offset} onChange={e => setForm({ ...form, bit_offset: e.target.value })} />
        <Input placeholder="Bit length" type="number" value={form.bit_length} onChange={e => setForm({ ...form, bit_length: e.target.value })} />
        <select value={form.encoding} onChange={e => setForm({ ...form, encoding: e.target.value })} className="text-sm border rounded px-2 py-1">
          <option value="BNR">BNR</option><option value="BCD">BCD</option><option value="discrete">Discrete</option>
          <option value="unsigned">Unsigned</option><option value="signed">Signed</option><option value="float32">Float32</option>
        </select>
        <Input placeholder="Units" value={form.units} onChange={e => setForm({ ...form, units: e.target.value })} />
        <Input placeholder="Min" type="number" value={form.min_value} onChange={e => setForm({ ...form, min_value: e.target.value })} />
        <Input placeholder="Max" type="number" value={form.max_value} onChange={e => setForm({ ...form, max_value: e.target.value })} />
        <Input placeholder="Resolution" value={form.resolution} onChange={e => setForm({ ...form, resolution: e.target.value })} />
      </div>
      {dynamicCols.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {dynamicCols.map(col => (
            <Input key={col} placeholder={formatKey(col)} value={form.protocol_attrs[col] || ''} onChange={e => setForm({ ...form, protocol_attrs: { ...form.protocol_attrs, [col]: e.target.value } })} className="text-xs" />
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave}>{label.startsWith('Edit') ? 'Save' : 'Create'}</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="text-xs text-slate-400 mb-4">
          <a href="/systems" className="hover:text-slate-600">Systems</a><span className="mx-1">›</span>
          <span className="text-slate-700 font-medium">Parameters</span>
          {proto && <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{proto.protocol_name}</span>}
          {msg && <span className="ml-2 text-slate-600">— {msg.name || msg.message_id_primary}</span>}
        </div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Parameters</h1>
          <Button size="sm" onClick={() => { setShowForm(!showForm); setEditId(null); resetForm(); }}><Plus className="mr-1 h-4 w-4" /> New Parameter</Button>
        </div>

        {showForm && !editId && renderForm(createParam, () => setShowForm(false), 'New Parameter')}
        {editId && renderForm(saveEdit, () => { setEditId(null); resetForm(); }, 'Edit Parameter')}

        {loading ? <p className="text-muted-foreground">Loading…</p> : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">Parameter</th>
                <th className="px-3 py-2 text-left font-medium">Bits</th>
                <th className="px-3 py-2 text-left font-medium">Encoding</th>
                <th className="px-3 py-2 text-left font-medium">Range</th>
                <th className="px-3 py-2 text-left font-medium">Resolution</th>
                <th className="px-3 py-2 text-left font-medium">Units</th>
                {dynamicCols.map(col => <th key={col} className="px-3 py-2 text-left font-medium">{formatKey(col)}</th>)}
                <th className="px-3 py-2 text-left font-medium">SSM</th>
                <th className="w-16 px-3 py-2" />
              </tr></thead>
              <tbody>
                {params.length === 0 ? (
                  <tr><td colSpan={8 + dynamicCols.length} className="px-3 py-6 text-center text-muted-foreground">No parameters. Click "New Parameter" to add one.</td></tr>
                ) : params.map(p => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.bit_offset}–{p.bit_offset + p.bit_length - 1}</td>
                    <td className="px-3 py-2"><span className="text-xs px-1.5 py-0.5 rounded bg-slate-100">{p.encoding}</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{p.min_value != null && p.max_value != null ? `${p.min_value} … ${p.max_value}` : '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.resolution ?? '—'}</td>
                    <td className="px-3 py-2">{p.units || '—'}</td>
                    {dynamicCols.map(col => <td key={col} className="px-3 py-2 text-muted-foreground font-mono text-xs">{p.protocol_attrs?.[col] != null ? String(p.protocol_attrs[col]) : '—'}</td>)}
                    <td className="px-3 py-2 text-muted-foreground">{p.ssm_convention || '—'}</td>
                    <td className="px-3 py-2 flex gap-1">
                      <button onClick={() => startEdit(p)} className="text-slate-400 hover:text-primary"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => deleteParam(p.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
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
