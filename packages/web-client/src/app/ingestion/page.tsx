'use client';

import { useState, useCallback } from 'react';

export default function IngestionPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/ingest/preview', { method: 'POST', body: fd });
      setResult(await r.json());
    } catch { setResult({ error: 'Upload failed — is the API running?' }); }
    setLoading(false);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Universal Ingestion</h1>
        <p className="text-sm text-slate-500 mt-1">Drop any ICD file — Excel, Word, PDF, DBC, CSV — and AI extracts signals automatically.</p>
      </div>

      {/* Supported formats */}
      <div className="flex flex-wrap gap-2 mb-6">
        {['Excel (.xlsx)', 'Word (.docx)', 'PDF', 'Vector DBC', 'CSV', 'ReqIF', 'XML'].map(f => (
          <span key={f} className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{f}</span>
        ))}
      </div>

      {/* Drop zone */}
      <div onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}
        className={`relative rounded-2xl border-2 border-dashed p-16 text-center transition-all cursor-pointer ${dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
        onClick={() => document.getElementById('file-input')?.click()}>
        <input id="file-input" type="file" className="hidden" accept=".xlsx,.xls,.csv,.dbc,.pdf,.docx,.xml,.reqif,.txt" onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); }} />
        <div className="text-4xl mb-3">{file ? '📄' : '📂'}</div>
        <p className="text-sm font-medium text-slate-700">{file ? file.name : 'Drop a file here or click to browse'}</p>
        {file && <p className="text-xs text-slate-400 mt-1">{(file.size / 1024).toFixed(0)} KB · {file.type || file.name.split('.').pop()}</p>}
      </div>

      {file && !result && (
        <button onClick={handleUpload} disabled={loading}
          className="mt-4 w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {loading ? '🔍 AI is analyzing your file...' : '🚀 Extract Signals'}
        </button>
      )}

      {/* Results */}
      {result && !result.error && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{result.signals_found} signals found</h3>
              <p className="text-xs text-slate-500">{result.needs_review} need human review · Format: {result.format}</p>
            </div>
            <button onClick={() => { setResult(null); setFile(null); }} className="text-xs text-slate-400 hover:text-slate-600">↻ Start over</button>
          </div>

          {/* Signal preview table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="px-4 py-2.5 text-left font-medium text-slate-500">Signal</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-500">Source</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-500">Dest</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-500">Protocol</th>
                  <th className="px-3 py-2.5 text-center font-medium text-slate-500">Confidence</th>
                  <th className="px-3 py-2.5 text-center font-medium text-slate-500">Review</th>
                </tr>
              </thead>
              <tbody>
                {(result.preview ?? result.signals ?? []).slice(0, 20).map((s: any, i: number) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-mono font-medium text-slate-800">{s.name}</td>
                    <td className="px-3 py-2.5 text-slate-600">{s.source_system ?? s.sourceSystem}</td>
                    <td className="px-3 py-2.5 text-slate-600">{s.dest_system ?? s.destSystem}</td>
                    <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100">{s.protocol}</span></td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-[10px] font-semibold ${(s.confidence ?? 0) >= 0.8 ? 'text-emerald-600' : (s.confidence ?? 0) >= 0.5 ? 'text-amber-600' : 'text-red-600'}`}>
                        {Math.round((s.confidence ?? 0) * 100)}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center">{s.needs_review ? <span className="text-amber-500">⚠️</span> : <span className="text-emerald-500">✓</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors">
            ✓ Import {result.signals_found} Signals into ConnectedICD
          </button>
        </div>
      )}

      {result?.error && (
        <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{result.error}</div>
      )}
    </div>
  );
}
