'use client';

import { useState } from 'react';
import { Brain, Send, Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProject } from '@/lib/project-context';
import { api } from '@/lib/api-client';

const ANALYSIS_TYPES = [
  { id: 'general', label: 'General Architecture Review', desc: 'Strengths, weaknesses, recommendations' },
  { id: 'bus_loading', label: 'Bus Loading Analysis', desc: 'Bandwidth utilization and overload risks' },
  { id: 'safety', label: 'Safety Assessment', desc: 'Single points of failure, redundancy gaps (ARP 4761)' },
  { id: 'compliance', label: 'Standards Compliance', desc: 'ARINC 429/825, DO-178C/DO-254 checks' },
];

export default function AIAnalysisPage() {
  const { currentProject } = useProject();
  const [analysisResult, setAnalysisResult] = useState('');
  const [analysisType, setAnalysisType] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatMsg, setChatMsg] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string; text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);

  const runAnalysis = async (type: string) => {
    if (!currentProject) return;
    setLoading(true); setAnalysisType(type); setAnalysisResult('');
    try {
      const res = await api.post<{ analysis: string }>('ai/analyze', { projectId: currentProject.id, type });
      setAnalysisResult(res.analysis);
    } catch (e: unknown) {
      setAnalysisResult(e instanceof Error ? e.message : 'Analysis failed');
    } finally { setLoading(false); }
  };

  const sendChat = async () => {
    if (!chatMsg.trim() || !currentProject) return;
    const msg = chatMsg; setChatMsg('');
    setChatHistory(h => [...h, { role: 'user', text: msg }]);
    setChatLoading(true);
    try {
      const res = await api.post<{ response: string }>('ai/chat', { message: msg, projectId: currentProject.id });
      setChatHistory(h => [...h, { role: 'assistant', text: res.response }]);
    } catch {
      setChatHistory(h => [...h, { role: 'assistant', text: 'Error: AI service unavailable' }]);
    } finally { setChatLoading(false); }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Brain className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">AI Analysis</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 mb-3">Automated Analysis</h2>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {ANALYSIS_TYPES.map(t => (
                <button key={t.id} onClick={() => runAnalysis(t.id)} disabled={loading}
                  className="p-3 rounded-lg border bg-white hover:border-primary hover:shadow-sm transition-all text-left">
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
            {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground p-4"><Loader2 className="h-4 w-4 animate-spin" /> Running analysis...</div>}
            {analysisResult && !loading && (
              <div className="rounded-lg border bg-white p-4">
                <h3 className="text-sm font-semibold mb-2">{ANALYSIS_TYPES.find(t => t.id === analysisType)?.label}</h3>
                <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{analysisResult}</div>
              </div>
            )}
          </div>

          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">AI Assistant</h2>
            <div className="flex-1 rounded-lg border bg-white flex flex-col" style={{ minHeight: 400 }}>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatHistory.length === 0 && <p className="text-sm text-muted-foreground">Ask anything about your ICD architecture.</p>}
                {chatHistory.map((m, i) => (
                  <div key={i} className={`text-sm ${m.role === 'user' ? 'text-right' : ''}`}>
                    <div className={`inline-block max-w-[85%] p-2 rounded-lg ${m.role === 'user' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-700'}`}>
                      <div className="whitespace-pre-wrap">{m.text}</div>
                    </div>
                  </div>
                ))}
                {chatLoading && <div className="text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-1" />Thinking...</div>}
              </div>
              <div className="border-t p-3 flex gap-2">
                <Input placeholder="Ask about your ICD..." value={chatMsg} onChange={e => setChatMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} className="flex-1" />
                <Button size="sm" onClick={sendChat} disabled={chatLoading}><Send className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
