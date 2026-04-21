'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, GitBranch, ArrowLeftRight, RotateCcw } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api-client';

interface Baseline {
  id: string;
  versionLabel: string;
  description: string;
  status: string;
  signalCount: number;
  createdAt: string;
  createdBy: string;
}

export default function BaselinesPage() {
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [loading, setLoading] = useState(true);
  const [diffPair, setDiffPair] = useState<[string | null, string | null]>([null, null]);

  useEffect(() => {
    api
      .get<{ data: Baseline[] }>('/baselines')
      .then((res) => setBaselines(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    const baseline = await api.post<Baseline>('/baselines', {
      description: 'New baseline',
    });
    setBaselines((prev) => [baseline, ...prev]);
  };

  const handleRevert = async (id: string) => {
    if (!confirm('Revert to this baseline? Current state will be preserved as a new version.')) return;
    await api.post(`/baselines/${id}/revert`, { reason: 'Manual revert' });
  };

  const handleDiff = async () => {
    if (!diffPair[0] || !diffPair[1]) return;
    // Navigate to diff view or open modal
    window.location.href = `/baselines/diff?a=${diffPair[0]}&b=${diffPair[1]}`;
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
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold tracking-tight">Baselines</h1>
              <div className="flex gap-2">
                {diffPair[0] && diffPair[1] && (
                  <Button size="sm" variant="outline" onClick={handleDiff}>
                    <ArrowLeftRight className="mr-1 h-4 w-4" /> Compare
                  </Button>
                )}
                <Button size="sm" onClick={handleCreate}>
                  <Plus className="mr-1 h-4 w-4" /> Create Baseline
                </Button>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : baselines.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center py-12">
                    <GitBranch className="mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No baselines yet</p>
                  </CardContent>
                </Card>
              ) : (
                baselines.map((b) => (
                  <Card key={b.id}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input"
                          checked={diffPair.includes(b.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setDiffPair((prev) =>
                                prev[0] === null ? [b.id, prev[1]] : [prev[0], b.id]
                              );
                            } else {
                              setDiffPair((prev) =>
                                prev[0] === b.id ? [null, prev[1]] : [prev[0], null]
                              );
                            }
                          }}
                        />
                        <div>
                          <p className="font-medium">{b.versionLabel}</p>
                          <p className="text-xs text-muted-foreground">
                            {b.description} · {b.signalCount} signals · {new Date(b.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={b.status === 'locked' ? 'default' : 'secondary'}>
                          {b.status}
                        </Badge>
                        <Button size="sm" variant="ghost" onClick={() => handleRevert(b.id)}>
                          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Revert
                        </Button>
                      </div>
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
