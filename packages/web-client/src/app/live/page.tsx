'use client';

import { useEffect, useRef, useState } from 'react';
import { Radio, Play, Square, AlertTriangle, Download, BarChart3, Binary, Table } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { useProject } from '@/lib/project-context';
import { useLiveAdapters } from '@/lib/queries';
import { api } from '@/lib/api-client';

interface Adapter { id: string; name: string; protocol: string; status: string; type: string; }
interface Reading { parameter_id: string; parameter_name: string; message_id: string; timestamp: string; decoded_value: number; units: string; in_range: boolean; deviation_severity: string | null; min_value: number; max_value: number; }
interface Session { sessionId: string; parameterCount: number; parameters: { id: string; name: string; units: string; min: number; max: number; message: string }[]; }

type ViewMode = 'table' | 'graph' | 'hex';

const GRAPH_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export default function LiveDataPage() {
  const { currentProject } = useProject();
  const { data: adapters = [] } = useLiveAdapters();
  const [selectedAdapter, setSelectedAdapter] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [history, setHistory] = useState<{ ts: number; values: Record<string, number> }[]>([]);
  const [running, setRunning] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [recording, setRecording] = useState<Reading[][]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const start = async () => {
    if (!selectedAdapter) return;
    try {
      const s = await api.post<Session>('live/start', { adapterId: selectedAdapter, projectId: currentProject?.id });
      setSession(s); setRunning(true); setReadings([]); setHistory([]); setRecording([]);
      intervalRef.current = setInterval(async () => {
        try {
          const r = await api.get<{ readings: Reading[] }>(`live/session/${s.sessionId}/readings`);
          setReadings(r.readings);
          setHistory(h => {
            const entry = { ts: Date.now(), values: {} as Record<string, number> };
            r.readings.forEach(rd => { entry.values[rd.parameter_name] = rd.decoded_value; });
            const next = [...h, entry];
            return next.length > 120 ? next.slice(-120) : next;
          });
          if (isRecording) setRecording(rec => [...rec, r.readings]);
        } catch { /* ignore */ }
      }, 1000);
    } catch (e: unknown) { alert(e instanceof Error ? e.message : 'Failed'); }
  };

  const stop = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (session) await api.post('live/stop', { sessionId: session.sessionId }).catch(() => {});
    setRunning(false); setIsRecording(false);
  };

  const exportRecording = () => {
    const flat = recording.flatMap((batch, i) => batch.map(r => ({ batch: i, ...r })));
    const csv = ['Batch,Timestamp,Parameter,Message,Value,Units,InRange,Severity,Min,Max',
      ...flat.map(r => `${r.batch},${r.timestamp},${r.parameter_name},${r.message_id},${r.decoded_value},${r.units},${r.in_range},${r.deviation_severity || ''},${r.min_value},${r.max_value}`)
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `capture_${session?.sessionId?.slice(0, 8) || 'session'}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => { return () => { if (intervalRef.current) clearInterval(intervalRef.current); }; }, []);

  // Draw graph
  useEffect(() => {
    if (viewMode !== 'graph' || !canvasRef.current || history.length < 2) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width = canvas.offsetWidth * 2;
    const H = canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const w = W / 2; const h = H / 2;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 0.5;
    for (let i = 0; i < 5; i++) { const y = 30 + (h - 60) * i / 4; ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(w - 10, y); ctx.stroke(); }

    // Get all parameter names
    const paramNames = [...new Set(history.flatMap(h => Object.keys(h.values)))].slice(0, 8);
    if (paramNames.length === 0) return;

    // Find global min/max across all params
    let gMin = Infinity, gMax = -Infinity;
    history.forEach(h => { Object.values(h.values).forEach(v => { if (v < gMin) gMin = v; if (v > gMax) gMax = v; }); });
    const range = gMax - gMin || 1;
    const margin = range * 0.1;
    gMin -= margin; gMax += margin;

    // Y-axis labels
    ctx.fillStyle = '#94a3b8'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
    for (let i = 0; i < 5; i++) {
      const val = gMax - (gMax - gMin) * i / 4;
      const y = 30 + (h - 60) * i / 4;
      ctx.fillText(val.toFixed(1), 46, y + 3);
    }

    // Draw lines for each parameter
    paramNames.forEach((name, pi) => {
      ctx.strokeStyle = GRAPH_COLORS[pi % GRAPH_COLORS.length];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      history.forEach((entry, i) => {
        const val = entry.values[name];
        if (val === undefined) return;
        const x = 50 + (w - 60) * i / (history.length - 1);
        const y = 30 + (h - 60) * (1 - (val - gMin) / (gMax - gMin));
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // Legend
    ctx.font = '10px sans-serif';
    paramNames.forEach((name, i) => {
      const x = 55 + i * Math.min(120, (w - 60) / paramNames.length);
      ctx.fillStyle = GRAPH_COLORS[i % GRAPH_COLORS.length];
      ctx.fillRect(x, h - 18, 10, 3);
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'left';
      ctx.fillText(name.length > 12 ? name.slice(0, 12) + '…' : name, x + 14, h - 13);
    });
  }, [history, viewMode]);

  const deviations = readings.filter(r => !r.in_range);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Radio className={`h-6 w-6 ${running ? 'text-green-500 animate-pulse' : 'text-primary'}`} />
            <h1 className="text-2xl font-semibold tracking-tight">Live Data Monitor</h1>
            {running && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 animate-pulse">● LIVE</span>}
          </div>
          <div className="flex items-center gap-2">
            <select value={selectedAdapter} onChange={e => setSelectedAdapter(e.target.value)} className="text-sm border rounded px-2 py-1 bg-white" disabled={running}>
              <option value="">Select adapter...</option>
              {adapters.map(a => <option key={a.id} value={a.id}>{a.name} {a.type !== 'simulator' ? '🔌' : '🔄'}</option>)}
            </select>
            {!running ? (
              <Button size="sm" onClick={start} disabled={!selectedAdapter}><Play className="mr-1 h-4 w-4" /> Start</Button>
            ) : (
              <>
                <Button size="sm" variant={isRecording ? 'default' : 'outline'} onClick={() => setIsRecording(!isRecording)} className={isRecording ? 'bg-red-600 hover:bg-red-700' : ''}>
                  {isRecording ? '⏺ Recording' : '⏺ Record'}
                </Button>
                <Button size="sm" variant="outline" onClick={stop} className="text-red-600 border-red-200"><Square className="mr-1 h-4 w-4" /> Stop</Button>
              </>
            )}
            {recording.length > 0 && <Button size="sm" variant="outline" onClick={exportRecording}><Download className="mr-1 h-4 w-4" /> Export CSV</Button>}
          </div>
        </div>

        {/* View mode tabs */}
        {running && (
          <div className="flex gap-1 mb-4">
            {([['table', Table, 'Table'], ['graph', BarChart3, 'Graph'], ['hex', Binary, 'Hex Dump']] as const).map(([mode, Icon, label]) => (
              <button key={mode} onClick={() => setViewMode(mode)} className={`flex items-center gap-1 px-3 py-1.5 rounded text-sm ${viewMode === mode ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
            <span className="ml-auto text-xs text-slate-400">{history.length} samples · {readings.length} params{isRecording ? ` · ${recording.length} recorded` : ''}</span>
          </div>
        )}

        {/* Deviation alerts */}
        {deviations.length > 0 && (
          <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50">
            <div className="flex items-center gap-2 text-amber-800 font-medium text-sm"><AlertTriangle className="h-4 w-4" /> {deviations.length} out-of-range</div>
            <div className="text-xs text-amber-700 mt-1">{deviations.map(d => `${d.parameter_name}: ${d.decoded_value} ${d.units}`).join(' · ')}</div>
          </div>
        )}

        {/* Table view */}
        {viewMode === 'table' && readings.length > 0 && (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium">Parameter</th>
                <th className="px-3 py-2 text-left font-medium">Message</th>
                <th className="px-3 py-2 text-right font-medium">Value</th>
                <th className="px-3 py-2 text-left font-medium">Units</th>
                <th className="px-3 py-2 text-left font-medium">Range</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr></thead>
              <tbody>
                {readings.map((r, i) => (
                  <tr key={i} className={`border-b last:border-0 ${!r.in_range ? (r.deviation_severity === 'error' ? 'bg-red-50' : 'bg-amber-50') : ''}`}>
                    <td className="px-3 py-2 font-medium">{r.parameter_name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.message_id}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{r.decoded_value}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.units}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.min_value} – {r.max_value}</td>
                    <td className="px-3 py-2">
                      {r.in_range ? <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">OK</span>
                        : <span className={`text-xs px-1.5 py-0.5 rounded ${r.deviation_severity === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{r.deviation_severity === 'error' ? '⚠ ERROR' : '⚠ WARN'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Graph view */}
        {viewMode === 'graph' && (
          <div className="rounded-lg border bg-white p-2">
            <canvas ref={canvasRef} className="w-full" style={{ height: 350 }} />
            {history.length < 2 && <p className="text-center text-sm text-muted-foreground py-8">Collecting data...</p>}
          </div>
        )}

        {/* Hex dump view */}
        {viewMode === 'hex' && readings.length > 0 && (
          <div className="rounded-lg border bg-slate-900 p-4 font-mono text-xs text-green-400 overflow-x-auto" style={{ minHeight: 300 }}>
            <div className="text-slate-500 mb-2">{'// Live CAN/Bus Frame Dump — ' + new Date().toISOString()}</div>
            {readings.map((r, i) => {
              // Simulate raw hex from decoded value
              const rawHex = Math.abs(Math.round(r.decoded_value / (1 || 1))).toString(16).toUpperCase().padStart(4, '0');
              const fullFrame = (rawHex + '00'.repeat(6)).slice(0, 16);
              const ascii = fullFrame.match(/.{2}/g)?.map(h => { const c = parseInt(h, 16); return c >= 32 && c < 127 ? String.fromCharCode(c) : '.'; }).join('') || '';
              return (
                <div key={i} className={`flex gap-4 py-0.5 ${!r.in_range ? 'text-red-400' : ''}`}>
                  <span className="text-slate-500 w-20">{r.message_id}</span>
                  <span className="w-48">{fullFrame.match(/.{2}/g)?.join(' ')}</span>
                  <span className="text-slate-600 w-20">{ascii}</span>
                  <span className="text-cyan-400">→ {r.parameter_name}</span>
                  <span className={r.in_range ? 'text-green-400' : 'text-red-400'}>{r.decoded_value} {r.units}</span>
                  {!r.in_range && <span className="text-red-500 font-bold">OUT OF RANGE</span>}
                </div>
              );
            })}
          </div>
        )}

        {!running && !session && (
          <div className="text-center py-12 text-muted-foreground">
            <Radio className="h-8 w-8 mx-auto mb-2" />
            <p>Select an adapter and click Start to begin monitoring</p>
            <p className="text-xs mt-1">🔌 Hardware adapters auto-detected · 🔄 Simulators always available</p>
          </div>
        )}
      </main>
    </div>
  );
}
