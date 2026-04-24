'use client';

import { useState } from 'react';
import { Shield, Check, X, Clock } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProject } from '@/lib/project-context';
import { useAuth } from '@/lib/auth-context';
import { useWorkflows, useApproveWorkflow, useRejectWorkflow } from '@/lib/queries';

const STATUS_STYLE: Record<string, string> = { pending: 'bg-amber-100 text-amber-700', approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700' };

export default function WorkflowsPage() {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [filter, setFilter] = useState<'all' | 'pending'>('pending');
  const { data: requests = [], isLoading: loading } = useWorkflows(currentProject?.id, filter);
  const approveMutation = useApproveWorkflow();
  const rejectMutation = useRejectWorkflow();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3"><Shield className="h-6 w-6 text-primary" /><h1 className="text-2xl font-semibold tracking-tight">Approval Workflows</h1></div>
          <div className="flex gap-2">
            <button onClick={() => setFilter('pending')} className={`text-sm px-3 py-1 rounded ${filter === 'pending' ? 'bg-primary text-white' : 'bg-slate-100'}`}>Pending</button>
            <button onClick={() => setFilter('all')} className={`text-sm px-3 py-1 rounded ${filter === 'all' ? 'bg-primary text-white' : 'bg-slate-100'}`}>All</button>
          </div>
        </div>
        {loading ? <p className="text-muted-foreground">Loading…</p> : requests.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground"><Shield className="h-8 w-8 mx-auto mb-2" /><p>{filter === 'pending' ? 'No pending approvals' : 'No change requests'}</p></div>
        ) : (
          <div className="space-y-3">
            {requests.map((cr: any) => (
              <div key={cr.id} className="rounded-lg border bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-slate-400" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{cr.entity_name || cr.entity_type}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100">{cr.entity_type}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_STYLE[cr.status] || ''}`}>{cr.status}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">Submitted {new Date(cr.submitted_at).toLocaleString()}</p>
                      {cr.rejection_reason && <p className="text-xs text-red-500 mt-1">Reason: {cr.rejection_reason}</p>}
                    </div>
                  </div>
                  {cr.status === 'pending' && isAdmin && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => approveMutation.mutate(cr.id)} className="bg-green-600 hover:bg-green-700"><Check className="mr-1 h-3 w-3" /> Approve</Button>
                      {rejectId === cr.id ? (
                        <div className="flex gap-1">
                          <Input placeholder="Reason..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="h-8 w-40 text-xs" />
                          <Button size="sm" variant="outline" onClick={() => { rejectMutation.mutate({ id: cr.id, reason: rejectReason }); setRejectId(null); setRejectReason(''); }} className="text-red-600">Reject</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setRejectId(cr.id)} className="text-red-600"><X className="mr-1 h-3 w-3" /> Reject</Button>
                      )}
                    </div>
                  )}
                </div>
                {cr.change_payload && Object.keys(cr.change_payload).length > 0 && (
                  <div className="mt-3 p-2 rounded bg-slate-50 text-xs">
                    <span className="font-medium text-slate-600">Changes: </span>
                    {Object.entries(cr.change_payload).map(([k, v]) => <span key={k} className="mr-3"><span className="text-slate-500">{k}:</span> {String(v)}</span>)}
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
