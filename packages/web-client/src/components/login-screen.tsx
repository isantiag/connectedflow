'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) return;
    setLoading(true); setError('');
    const err = await login(email, password || undefined);
    if (err) setError(err);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm p-8 rounded-2xl border bg-white shadow-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-slate-900">ConnectedICD</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your account</p>
        </div>
        <div className="space-y-3">
          <Input placeholder="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button className="w-full" onClick={handleLogin} disabled={loading}>{loading ? 'Signing in...' : 'Sign In'}</Button>
        </div>
        <div className="mt-6 text-xs text-slate-400 space-y-1">
          <p className="font-medium text-slate-500">Test accounts:</p>
          <p>admin@enteraero.com / Admin1!</p>
          <p>editor@enteraero.com / Editor1!</p>
          <p>viewer@supplier.com / Viewer1!</p>
        </div>
      </div>
    </div>
  );
}
