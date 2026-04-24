'use client';

import { AlertTriangle, AlertCircle, Info, RefreshCw } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { useProject } from '@/lib/project-context';
import { useAnomalies } from '@/lib/queries';

const SEV_ICON = { error: AlertCircle, warning: AlertTriangle, info: Info };
const SEV_BG = { error: 'border-red-200 bg-red-50', warning: 'border-amber-200 bg-amber-50', info: 'border-blue-200 bg-blue-50' };
const SEV_TEXT = { error: 'text-red-800', warning: 'text-amber-800', info: 'text-blue-800' };
const SEV_BADGE = { error: 'bg-red-100 text-red-700', warning: 'bg-amber-100 text-amber-700', info: 'bg-blue-100 text-blue-700' };

export default function AnomaliesPage() {
  const { currentProject } = useProject();
  const { data: result, isLoading: loading, refetch } = useAnomalies(currentProject?.id);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Anomaly Detection</h1>
            <p className="text-sm text-muted-foreground mt-1">Automated ICD consistency checks</p>
          </div>
          <Button size="sm" onClick={() => refetch()} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Scan
          </Button>
        </div>

        {result && (
          <>
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="p-3 rounded-lg border bg-white"><div className="text-2xl font-bold">{result.summary?.total}</div><div className="text-xs text-slate-500">Total</div></div>
              <div className="p-3 rounded-lg border bg-white"><div className="text-2xl font-bold text-red-600">{result.summary?.errors}</div><div className="text-xs text-slate-500">Errors</div></div>
              <div className="p-3 rounded-lg border bg-white"><div className="text-2xl font-bold text-amber-600">{result.summary?.warnings}</div><div className="text-xs text-slate-500">Warnings</div></div>
              <div className="p-3 rounded-lg border bg-white"><div className="text-2xl font-bold text-blue-600">{result.summary?.info}</div><div className="text-xs text-slate-500">Info</div></div>
            </div>

            {(result.anomalies || []).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p className="font-medium text-green-700">No anomalies detected</p>
              </div>
            ) : (
              <div className="space-y-3">
                {result.anomalies.map((a: any, i: number) => {
                  const Icon = (SEV_ICON as any)[a.severity] || Info;
                  return (
                    <div key={i} className={`p-4 rounded-lg border ${(SEV_BG as any)[a.severity] || SEV_BG.info}`}>
                      <div className="flex items-start gap-3">
                        <Icon className={`h-5 w-5 mt-0.5 ${(SEV_TEXT as any)[a.severity]}`} />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${(SEV_BADGE as any)[a.severity]}`}>{a.severity}</span>
                            <span className="text-xs text-slate-500">{a.category?.replace(/_/g, ' ')}</span>
                          </div>
                          <h3 className={`font-medium ${(SEV_TEXT as any)[a.severity]}`}>{a.title}</h3>
                          <p className="text-sm text-slate-600 mt-1">{a.description}</p>
                          <p className="text-xs text-slate-500 mt-2 italic">💡 {a.suggestion}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
