'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Filter, ChevronRight } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';

interface SignalRow {
  id: string;
  name: string;
  status: string;
  criticality: string;
  protocol?: string;
  bus?: string;
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ data: SignalRow[] }>('/signals', { search, page: '1', limit: '50' })
      .then((res) => setSignals(res.data))
      .catch(() => setSignals([]))
      .finally(() => setLoading(false));
  }, [search]);

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
              <h1 className="text-2xl font-semibold tracking-tight">Signals</h1>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href="/signals/import">Import</a>
                </Button>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" /> New Signal
                </Button>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search signals..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </div>

            {/* Data Table */}
            <div className="mt-4 rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-2 text-left font-medium">Name</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Criticality</th>
                    <th className="px-4 py-2 text-left font-medium">Protocol</th>
                    <th className="px-4 py-2 text-left font-medium">Bus</th>
                    <th className="w-10 px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  ) : signals.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        No signals found
                      </td>
                    </tr>
                  ) : (
                    signals.map((s) => (
                      <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{s.name}</td>
                        <td className="px-4 py-2">
                          <Badge variant={s.status === 'active' ? 'success' : 'secondary'}>
                            {s.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant={s.criticality === 'critical' ? 'destructive' : 'outline'}>
                            {s.criticality}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{s.protocol ?? '—'}</td>
                        <td className="px-4 py-2 text-muted-foreground">{s.bus ?? '—'}</td>
                        <td className="px-4 py-2">
                          <a href={`/signals/${s.id}`}>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
