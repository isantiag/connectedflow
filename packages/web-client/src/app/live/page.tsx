'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Circle, Pause, Play, Square } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { wsClient } from '@/lib/ws-client';

interface LiveParameter {
  signalId: string;
  signalName: string;
  decodedValue: number;
  units: string;
  inRange: boolean;
  deviationSeverity: 'warning' | 'error' | null;
  timestamp: number;
}

export default function LiveDataPage() {
  const [parameters, setParameters] = useState<Map<string, LiveParameter>>(new Map());
  const [connected, setConnected] = useState(false);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    wsClient.connect();
    setConnected(true);

    const unsub = wsClient.on('live-data', (payload) => {
      if (pausedRef.current) return;
      const param = payload as LiveParameter;
      setParameters((prev) => {
        const next = new Map(prev);
        next.set(param.signalId, param);
        return next;
      });
    });

    return () => {
      unsub();
      wsClient.disconnect();
      setConnected(false);
    };
  }, []);

  const toggleRecording = () => {
    if (recording) {
      wsClient.send('stop-recording', {});
    } else {
      wsClient.send('start-recording', {});
    }
    setRecording(!recording);
  };

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setPaused(!paused);
  };

  const params = Array.from(parameters.values());

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
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Live Data Monitor</h1>
                <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <Circle className={`h-2 w-2 fill-current ${connected ? 'text-emerald-500' : 'text-destructive'}`} />
                  {connected ? 'Connected' : 'Disconnected'}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={togglePause}>
                  {paused ? <Play className="mr-1 h-4 w-4" /> : <Pause className="mr-1 h-4 w-4" />}
                  {paused ? 'Resume' : 'Pause'}
                </Button>
                <Button
                  size="sm"
                  variant={recording ? 'destructive' : 'default'}
                  onClick={toggleRecording}
                >
                  {recording ? <Square className="mr-1 h-4 w-4" /> : <Circle className="mr-1 h-4 w-4" />}
                  {recording ? 'Stop Recording' : 'Record'}
                </Button>
              </div>
            </div>

            {/* Parameter cards */}
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {params.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="flex flex-col items-center py-12">
                    <Activity className="mb-2 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Waiting for live data…
                    </p>
                  </CardContent>
                </Card>
              ) : (
                params.map((p) => (
                  <motion.div
                    key={p.signalId}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Card className={
                      p.deviationSeverity === 'error'
                        ? 'border-destructive/50 bg-destructive/5'
                        : p.deviationSeverity === 'warning'
                          ? 'border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20'
                          : ''
                    }>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">{p.signalName}</CardTitle>
                          {p.deviationSeverity && (
                            <Badge variant={p.deviationSeverity === 'error' ? 'destructive' : 'warning'}>
                              {p.deviationSeverity}
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-semibold tabular-nums">
                          {p.decodedValue.toFixed(2)}
                          <span className="ml-1 text-sm font-normal text-muted-foreground">{p.units}</span>
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(p.timestamp).toLocaleTimeString()}
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))
              )}
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
