'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ProjectProvider } from '@/lib/project-context';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { LoginScreen } from '@/components/login-screen';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return <LoginScreen />;
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          <ProjectProvider>{children}</ProjectProvider>
        </AuthGate>
      </AuthProvider>
    </QueryClientProvider>
  );
}
