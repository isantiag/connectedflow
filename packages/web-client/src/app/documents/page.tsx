'use client';

import { useCallback, useState } from 'react';
import { Upload, FileText, CheckCircle2, XCircle, Clock, Eye } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useParseJobs } from '@/lib/queries';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

interface ParseJob {
  id: string;
  fileName: string;
  status: 'queued' | 'processing' | 'review_pending' | 'confirmed' | 'failed';
  totalSignals: number;
  avgConfidence: number;
  createdAt: string;
}

interface ExtractedSignal {
  name: string;
  confidence: number;
  needsReview: boolean;
  data: Record<string, unknown>;
}

const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'warning' | 'success' | 'destructive'; icon: typeof Clock }> = {
  queued: { variant: 'secondary', icon: Clock },
  processing: { variant: 'warning', icon: Clock },
  review_pending: { variant: 'warning', icon: Eye },
  confirmed: { variant: 'success', icon: CheckCircle2 },
  failed: { variant: 'destructive', icon: XCircle },
};

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const { data: jobsData, isLoading: loading } = useParseJobs();
  const jobs: ParseJob[] = (jobsData as any)?.data ?? jobsData ?? [];
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [extractions, setExtractions] = useState<ExtractedSignal[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const handleUpload = useCallback(async (file: File) => {
    await api.post<ParseJob>('parse-jobs', { fileName: file.name });
    queryClient.invalidateQueries({ queryKey: ['parse-jobs'] });
  }, [queryClient]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const viewExtractions = async (jobId: string) => {
    setSelectedJob(jobId);
    const res = await api.get<{ signals: ExtractedSignal[] }>(`/parse-jobs/${jobId}/extractions`);
    setExtractions(res.signals);
  };

  const confirmExtraction = async (jobId: string) => {
    await api.post(`/parse-jobs/${jobId}/confirm`);
    queryClient.invalidateQueries({ queryKey: ['parse-jobs'] });
    setSelectedJob(null);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">

        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload ICD documents for AI-powered signal extraction
            </p>

            {/* Upload area */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`mt-6 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
              }`}
            >
              <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag & drop PDF, Word, or Excel documents
              </p>
              <input
                type="file"
                accept=".pdf,.docx,.xlsx"
                className="mt-3 text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
              {/* Parse job list */}
              <Card>
                <CardHeader><CardTitle>Parse Jobs</CardTitle></CardHeader>
                <CardContent>
                  {loading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : jobs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No documents uploaded yet</p>
                  ) : (
                    <div className="space-y-2">
                      {jobs.map((job) => {
                        const cfg = statusConfig[job.status] ?? statusConfig.queued;
                        const Icon = cfg.icon;
                        return (
                          <div
                            key={job.id}
                            className={`flex items-center justify-between rounded-lg border p-3 text-sm transition-colors hover:bg-muted/30 ${
                              selectedJob === job.id ? 'border-primary bg-primary/5' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{job.fileName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {job.totalSignals} signals · {Math.round(job.avgConfidence * 100)}% avg confidence
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={cfg.variant}>
                                <Icon className="mr-1 h-3 w-3" />{job.status}
                              </Badge>
                              {job.status === 'review_pending' && (
                                <Button size="sm" variant="outline" onClick={() => viewExtractions(job.id)}>
                                  Review
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Extraction review */}
              <Card>
                <CardHeader><CardTitle>Extraction Review</CardTitle></CardHeader>
                <CardContent>
                  {!selectedJob ? (
                    <p className="text-sm text-muted-foreground">Select a job to review extractions</p>
                  ) : (
                    <div className="space-y-2">
                      {extractions.map((ext, i) => (
                        <div
                          key={i}
                          className={`rounded-lg border p-3 text-sm ${
                            ext.needsReview ? 'border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{ext.name}</span>
                            <Badge variant={ext.confidence >= 0.8 ? 'success' : ext.confidence >= 0.5 ? 'warning' : 'destructive'}>
                              {Math.round(ext.confidence * 100)}%
                            </Badge>
                          </div>
                          {ext.needsReview && (
                            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Needs manual review</p>
                          )}
                        </div>
                      ))}
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" onClick={() => confirmExtraction(selectedJob)}>
                          Confirm All
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setSelectedJob(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>

  );
}
