'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Clock, Shield } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api-client';

interface ChangeRequest {
  id: string;
  signalName: string;
  submittedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  criticality: string;
  submittedAt: string;
  description: string;
}

export default function WorkflowsPage() {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ data: ChangeRequest[] }>('/change-requests')
      .then((res) => setRequests(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleApprove = async (id: string) => {
    await api.post(`/change-requests/${id}/approve`);
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'approved' as const } : r))
    );
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    await api.post(`/change-requests/${id}/reject`, { reason });
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'rejected' as const } : r))
    );
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-semibold tracking-tight">Change Requests</h1>
            </div>

            <div className="mt-6 space-y-3">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : requests.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center py-12">
                    <CheckCircle2 className="mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No pending change requests</p>
                  </CardContent>
                </Card>
              ) : (
                requests.map((cr) => (
                  <Card key={cr.id}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{cr.signalName}</p>
                          <Badge variant={cr.criticality === 'critical' ? 'destructive' : 'outline'}>
                            {cr.criticality}
                          </Badge>
                          <Badge
                            variant={
                              cr.status === 'approved'
                                ? 'success'
                                : cr.status === 'rejected'
                                  ? 'destructive'
                                  : 'warning'
                            }
                          >
                            {cr.status === 'pending' && <Clock className="mr-1 h-3 w-3" />}
                            {cr.status === 'approved' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                            {cr.status === 'rejected' && <XCircle className="mr-1 h-3 w-3" />}
                            {cr.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {cr.description} · by {cr.submittedBy} · {new Date(cr.submittedAt).toLocaleDateString()}
                        </p>
                      </div>
                      {cr.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleApprove(cr.id)}>
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleReject(cr.id)}>
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
