'use client';

import { useState } from 'react';
import { useProject } from '@/lib/project-context';
import { useTraceLinks } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import { Link2, RefreshCw, AlertTriangle, Download, ExternalLink } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api-client';

interface TraceLink {
  id: string;
  signalName: string;
  requirementTool: 'doors' | 'jama';
  externalRequirementId: string;
  requirementText: string;
  linkStatus: 'active' | 'stale' | 'broken';
  lastSyncedAt: string;
}

export default function TraceabilityPage() {
  const queryClient = useQueryClient();
  const { data: linksData, isLoading: loading } = useTraceLinks();
  const links: TraceLink[] = (linksData as any)?.data ?? linksData ?? [];
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post<{ data: TraceLink[] }>('trace-links/sync');
      queryClient.invalidateQueries({ queryKey: ['trace-links'] });
    } catch {
      // handle error
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = async () => {
    await api.post('exports/traceability-matrix');
  };

  const staleCount = links.filter((l) => l.linkStatus === 'stale').length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">

        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Traceability</h1>
                {staleCount > 0 && (
                  <p className="mt-1 flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {staleCount} stale link{staleCount > 1 ? 's' : ''} need attention
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleExport}>
                  <Download className="mr-1 h-4 w-4" /> Export Matrix
                </Button>
                <Button size="sm" onClick={handleSync} disabled={syncing}>
                  <RefreshCw className={`mr-1 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing…' : 'Sync Requirements'}
                </Button>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : links.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center py-12">
                    <Link2 className="mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No trace links found</p>
                  </CardContent>
                </Card>
              ) : (
                links.map((link) => (
                  <Card
                    key={link.id}
                    className={
                      link.linkStatus === 'stale'
                        ? 'border-amber-300/50'
                        : link.linkStatus === 'broken'
                          ? 'border-destructive/50'
                          : ''
                    }
                  >
                    <CardContent className="flex items-center justify-between py-4">
                      <div className="flex items-center gap-3">
                        <Link2 className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{link.signalName}</p>
                            <span className="text-muted-foreground">↔</span>
                            <p className="text-sm">{link.externalRequirementId}</p>
                            <Badge variant="outline" className="text-[10px]">
                              {link.requirementTool.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                            {link.requirementText}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Last synced: {new Date(link.lastSyncedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            link.linkStatus === 'active'
                              ? 'success'
                              : link.linkStatus === 'stale'
                                ? 'warning'
                                : 'destructive'
                          }
                        >
                          {link.linkStatus === 'stale' && <AlertTriangle className="mr-1 h-3 w-3" />}
                          {link.linkStatus}
                        </Badge>
                        <Button size="sm" variant="ghost" asChild>
                          <a href="#" target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </main>
      </div>

  );
}
