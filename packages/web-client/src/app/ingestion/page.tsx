'use client';

import { useState } from 'react';
import { Upload, Check, AlertCircle, Brain, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { useProject } from '@/lib/project-context';
import { api } from '@/lib/api-client';

interface ExtractedSignal {
  name: string; source_system: string; dest_system: string; protocol: string; label: string;
  message_name: string; encoding: string; units: string; bit_offset: number | null; bit_length: number | null;
  min_value: number | null; max_value: number | null; resolution: number | null; rate: number | null; confidence: number;
}

interface ParseResult {
  jobId: string;
  extracted: ExtractedSignal[];
  stats: { total: number; sheets: number; highConfidence: number; lowConfidence: number };
}

interface ConfirmResult {
  confirmed: boolean;
  stats: { systems: number; connections: number; messages: number; parameters: number };
}

export default function IngestionPage() {
  const { currentProject } = useProject();
  const [result, setResult] = useState<ParseResult | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'ai' | 'pattern'>('ai');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true); setError(''); setResult(null); setConfirmResult(null);

    try {
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const endpoint = mode === 'ai' ? 'parse/ai-extract' : 'parse/excel';
      const res = await api.post<ParseResult>(endpoint, { base64, fileName: file.name });
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!result || !currentProject) return;
    setConfirming(true);
    try {
      const res = await api.post<ConfirmResult>(`parse-jobs/${result.jobId}/confirm-hierarchy`, { projectId: currentProject.id });
      setConfirmResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">ICD Ingestion</h1>
        <p className="text-sm text-muted-foreground mb-4">Upload an Excel ICD file to extract systems, connections, messages, and parameters</p>

        {/* Mode selector */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => setMode('ai')} className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-all ${mode === 'ai' ? 'border-primary bg-primary/5 text-primary font-medium' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            <Brain className="h-4 w-4" /> AI-Powered (Gemini)
          </button>
          <button onClick={() => setMode('pattern')} className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-all ${mode === 'pattern' ? 'border-primary bg-primary/5 text-primary font-medium' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            <FileSpreadsheet className="h-4 w-4" /> Pattern Matching
          </button>
        </div>

        {/* Upload area */}
        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-slate-50 transition-colors mb-6">
          <Upload className="h-8 w-8 text-slate-400 mb-2" />
          <span className="text-sm text-slate-500">Click to upload Excel file (.xlsx)</span>
          <span className="text-xs text-slate-400 mt-1">{mode === 'ai' ? 'Gemini will analyze and extract ICD data' : 'Column patterns will be auto-detected'}</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleUpload} />
        </label>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            {mode === 'ai' ? 'Gemini is analyzing your ICD file...' : 'Parsing file...'}
          </div>
        )}
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {result && (
          <div>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="p-3 rounded-lg border bg-white">
                <div className="text-2xl font-bold">{result.stats.total}</div>
                <div className="text-xs text-slate-500">Parameters Found</div>
              </div>
              <div className="p-3 rounded-lg border bg-white">
                <div className="text-2xl font-bold text-green-600">{result.stats.highConfidence}</div>
                <div className="text-xs text-slate-500">High Confidence</div>
              </div>
              <div className="p-3 rounded-lg border bg-white">
                <div className="text-2xl font-bold text-amber-600">{result.stats.lowConfidence}</div>
                <div className="text-xs text-slate-500">Needs Review</div>
              </div>
              <div className="p-3 rounded-lg border bg-white">
                <div className="text-2xl font-bold">{result.stats.sheets || 0}</div>
                <div className="text-xs text-slate-500">Sheets Analyzed</div>
              </div>
            </div>

            {/* Extracted data table */}
            <div className="rounded-lg border overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium">Conf.</th>
                    <th className="px-3 py-2 text-left font-medium">Parameter</th>
                    <th className="px-3 py-2 text-left font-medium">Source</th>
                    <th className="px-3 py-2 text-left font-medium">Dest</th>
                    <th className="px-3 py-2 text-left font-medium">Protocol</th>
                    <th className="px-3 py-2 text-left font-medium">Label/ID</th>
                    <th className="px-3 py-2 text-left font-medium">Bits</th>
                    <th className="px-3 py-2 text-left font-medium">Encoding</th>
                    <th className="px-3 py-2 text-left font-medium">Range</th>
                    <th className="px-3 py-2 text-left font-medium">Units</th>
                    <th className="px-3 py-2 text-left font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {result.extracted.map((s, i) => (
                    <tr key={i} className={`border-b last:border-0 ${(s.confidence || 0) < 0.5 ? 'bg-amber-50' : 'hover:bg-muted/30'}`}>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${(s.confidence || 0) >= 0.7 ? 'bg-green-100 text-green-700' : (s.confidence || 0) >= 0.5 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {Math.round((s.confidence || 0) * 100)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.source_system || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.dest_system || '—'}</td>
                      <td className="px-3 py-2">{s.protocol || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{s.label || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">{s.bit_offset != null ? `${s.bit_offset}-${(s.bit_offset || 0) + (s.bit_length || 1) - 1}` : '—'}</td>
                      <td className="px-3 py-2 text-xs">{s.encoding || '—'}</td>
                      <td className="px-3 py-2 text-xs">{s.min_value != null ? `${s.min_value}..${s.max_value}` : '—'}</td>
                      <td className="px-3 py-2">{s.units || '—'}</td>
                      <td className="px-3 py-2 text-xs">{s.rate ? `${s.rate} Hz` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Confirm */}
            {!confirmResult ? (
              <Button onClick={handleConfirm} disabled={confirming}>
                {confirming ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Importing...</> : <><Check className="mr-1 h-4 w-4" /> Import into {currentProject?.name}</>}
              </Button>
            ) : (
              <div className="p-4 rounded-lg border border-green-200 bg-green-50">
                <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                  <Check className="h-4 w-4" /> Imported successfully into {currentProject?.name}
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm text-green-600">
                  <div>{confirmResult.stats.systems} systems created</div>
                  <div>{confirmResult.stats.connections} connections created</div>
                  <div>{confirmResult.stats.messages} messages created</div>
                  <div>{confirmResult.stats.parameters} parameters created</div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
