'use client';

import { useCallback, useState } from 'react';
import { ArrowLeft, Upload, FileSpreadsheet, Check } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';

interface FieldMapping {
  sourceField: string;
  targetField: string | null;
  status: 'mapped' | 'unmapped';
}

export default function SignalImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const res = await api.post<{ mappings: FieldMapping[] }>('signals/import/preview', { fileName: file.name });
      setMappings(res.mappings);
    } catch {
      // handle error
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">

        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" asChild>
                <a href="/signals"><ArrowLeft className="h-4 w-4" /></a>
              </Button>
              <h1 className="text-2xl font-semibold tracking-tight">Bulk Import</h1>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {/* Upload area */}
              <Card>
                <CardHeader><CardTitle>Upload File</CardTitle></CardHeader>
                <CardContent>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
                      dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
                    }`}
                  >
                    <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Drag & drop CSV, Excel, or JSON file
                    </p>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.json"
                      className="mt-3 text-sm"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  {file && (
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                      <span>{file.name}</span>
                      <Button size="sm" onClick={handleImport} disabled={importing}>
                        {importing ? 'Analyzing…' : 'Preview Mapping'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Field mapping preview */}
              <Card>
                <CardHeader><CardTitle>Field Mapping</CardTitle></CardHeader>
                <CardContent>
                  {mappings.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Upload a file to preview field mappings
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {mappings.map((m) => (
                        <div key={m.sourceField} className="flex items-center justify-between rounded border px-3 py-1.5 text-sm">
                          <span>{m.sourceField}</span>
                          <div className="flex items-center gap-2">
                            {m.targetField ? (
                              <>
                                <span className="text-muted-foreground">→</span>
                                <span className="font-medium">{m.targetField}</span>
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              </>
                            ) : (
                              <Badge variant="warning">Unmapped</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                      <Button className="mt-3 w-full" disabled={importing}>
                        Confirm Import
                      </Button>
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
