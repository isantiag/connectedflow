'use client';

import { useParams } from 'next/navigation';
import { ArrowLeft, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useSignal, useSignalValidation } from '@/lib/queries';

interface ValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export default function SignalDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: signal, isLoading: loading } = useSignal(params.id);
  const { data: valData } = useSignalValidation(params.id);
  const validations: ValidationIssue[] = valData?.issues ?? [];

  return (
    <div className="flex flex-1 flex-col overflow-hidden">

        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" asChild>
                <a href="/signals"><ArrowLeft className="h-4 w-4" /></a>
              </Button>
              <h1 className="text-2xl font-semibold tracking-tight">
                {loading ? 'Loading…' : signal?.name ?? 'Signal'}
              </h1>
              {signal && (
                <Badge variant={signal.criticality === 'critical' ? 'destructive' : 'outline'}>
                  {signal.criticality}
                </Badge>
              )}
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
              {/* Three-layer tabs */}
              <Tabs defaultValue="logical">
                <TabsList>
                  <TabsTrigger value="logical">Logical</TabsTrigger>
                  <TabsTrigger value="transport">Transport</TabsTrigger>
                  <TabsTrigger value="physical">Physical</TabsTrigger>
                </TabsList>

                <TabsContent value="logical">
                  <Card>
                    <CardHeader><CardTitle>Logical Layer</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {['data_type', 'min_value', 'max_value', 'units', 'refresh_rate_hz', 'source_system', 'dest_system'].map((field) => (
                          <div key={field}>
                            <label className="text-xs font-medium text-muted-foreground">{field}</label>
                            <Input
                              defaultValue={String(signal?.logical?.[field] ?? '')}
                              readOnly
                            />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="transport">
                  <Card>
                    <CardHeader><CardTitle>Transport Layer</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {['protocol', 'bus', 'bit_offset', 'bit_length', 'encoding', 'scale_factor', 'offset_value', 'byte_order'].map((field) => (
                          <div key={field}>
                            <label className="text-xs font-medium text-muted-foreground">{field}</label>
                            <Input
                              defaultValue={String(signal?.transport?.[field] ?? '')}
                              readOnly
                            />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="physical">
                  <Card>
                    <CardHeader><CardTitle>Physical Layer</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {['connector', 'pin_number', 'wire_gauge', 'wire_color', 'wire_type', 'max_length_m', 'shielding'].map((field) => (
                          <div key={field}>
                            <label className="text-xs font-medium text-muted-foreground">{field}</label>
                            <Input
                              defaultValue={String(signal?.physical?.[field] ?? '')}
                              readOnly
                            />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Validation sidebar */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold">Cross-Layer Validation</h2>
                {validations.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" /> All layers consistent
                  </div>
                ) : (
                  validations.map((v, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                        v.severity === 'error'
                          ? 'border-destructive/30 bg-destructive/5 text-destructive'
                          : 'border-amber-300/30 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium">{v.field}</p>
                        <p className="text-xs opacity-80">{v.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

  );
}
