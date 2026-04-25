'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const LoginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
});
type LoginForm = z.infer<typeof LoginSchema>;

export function LoginScreen() {
  const { login } = useAuth();
  const [serverError, setServerError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(LoginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setServerError('');
    const err = await login(data.email, data.password);
    if (err) setServerError(err);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm p-8 rounded-2xl border bg-white shadow-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold text-slate-900">ConnectedICD</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your account</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Input placeholder="Email address" type="email" {...register('email')} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} />
            {errors.email && <p id="email-error" className="text-xs text-red-500 mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <Input placeholder="Password" type="password" {...register('password')} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} />
            {errors.password && <p id="password-error" className="text-xs text-red-500 mt-1">{errors.password.message}</p>}
          </div>
          {serverError && <p className="text-xs text-red-500">{serverError}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? 'Signing in...' : 'Sign In'}</Button>
        </form>
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
