'use client';

import { useState } from 'react';
import {
  Activity,
  Box,
  ChevronLeft,
  FileText,
  GitBranch,
  LayoutDashboard,
  Link2,
  Network,
  Radio,
  Settings,
  Shield,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { icon: Zap, label: 'Signals', href: '/signals' },
  { icon: Box, label: 'Systems', href: '/systems' },
  { icon: Network, label: 'Architecture', href: '/architecture' },
  { icon: Box, label: 'HW Templates', href: '/hw-templates' },
  { icon: Box, label: 'N² Matrix', href: '/n2-matrix' },
  { icon: Radio, label: 'Live Data', href: '/live' },
  { icon: Box, label: 'Wiring', href: '/wiring' },
  { icon: FileText, label: 'Ingestion', href: '/ingestion' },
  { icon: FileText, label: 'Documents', href: '/documents' },
  { icon: GitBranch, label: 'Baselines', href: '/baselines' },
  { icon: Link2, label: 'Traceability', href: '/traceability' },
  { icon: Shield, label: 'Workflows', href: '/workflows' },
  { icon: Activity, label: 'AI Analysis', href: '/ai-analysis' },
  { icon: Activity, label: 'Anomalies', href: '/anomalies' },
  { icon: Settings, label: 'Settings', href: '/settings' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r bg-card transition-all duration-200',
        collapsed ? 'w-14' : 'w-[220px]'
      )}
    >
      <div className="flex h-14 items-center justify-between px-3">
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight">
            ConnectedICD
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft
            className={cn(
              'h-4 w-4 transition-transform',
              collapsed && 'rotate-180'
            )}
          />
        </Button>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-2" aria-label="Main navigation">
        {navItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
              collapsed && 'justify-center'
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </a>
        ))}
      </nav>
    </aside>
  );
}
