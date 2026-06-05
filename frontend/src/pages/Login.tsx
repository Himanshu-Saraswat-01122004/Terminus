import React, { useState } from 'react';
import { Github, KeyRound, Mail, AlertCircle, ArrowRight } from 'lucide-react';

interface LoginProps {
  onSuccess: (token: string) => void;
  onNavigateToRegister: () => void;
}

export default function Login({ onSuccess, onNavigateToRegister }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:3000/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to authenticate');
      }

      onSuccess(data.token);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider: 'github' | 'google') => {
    window.location.href = `http://localhost:3000/auth/${provider}`;
  };

  return (
    <div className="w-full max-w-md p-8 rounded-2xl border border-white/5 bg-[#0b0f17]/60 backdrop-blur-xl shadow-2xl relative">
      {/* Glow highlight */}
      <div className="absolute -top-10 -left-10 w-40 h-40 bg-blue-500/10 rounded-full filter blur-3xl pointer-events-none"></div>

      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight">Welcome Back</h2>
        <p className="text-gray-400 text-sm mt-2">Sign in to your Terminas cloud workspace</p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-3 items-start text-red-400 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Email Address</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-500" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@domain.com"
              className="w-full pl-11 pr-4 py-3 bg-[#0d121f]/60 border border-white/5 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Password</label>
          <div className="relative">
            <KeyRound className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-500" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-11 pr-4 py-3 bg-[#0d121f]/60 border border-white/5 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/40 focus:ring-1 focus:ring-blue-500/20 transition-all"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-medium flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 transition-all disabled:opacity-50"
        >
          {loading ? 'Authenticating...' : 'Sign In'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      <div className="relative my-8 flex items-center justify-center">
        <span className="absolute inset-x-0 h-px bg-white/5"></span>
        <span className="relative px-3 bg-[#0b0f17] text-xs font-semibold text-gray-500 uppercase tracking-wider">or continue with</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => handleOAuth('github')}
          className="py-3 px-4 rounded-xl border border-white/5 bg-[#0d121f]/40 hover:bg-[#0d121f]/80 text-gray-300 hover:text-white flex items-center justify-center gap-2 transition-all font-medium"
        >
          <Github className="w-5 h-5" />
          GitHub
        </button>
        <button
          onClick={() => handleOAuth('google')}
          className="py-3 px-4 rounded-xl border border-white/5 bg-[#0d121f]/40 hover:bg-[#0d121f]/80 text-gray-300 hover:text-white flex items-center justify-center gap-2 transition-all font-medium"
        >
          {/* Custom minimal Google SVG icon */}
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.51 0-6.377-2.87-6.377-6.38s2.87-6.38 6.377-6.38c1.6 0 3.05.59 4.178 1.57l3.023-3.027C19.443 2.59 16.03 1.2 12.24 1.2c-5.99 0-10.8 4.81-10.8 10.8s4.81 10.8 10.8 10.8c5.44 0 9.87-3.88 9.87-10.8 0-.685-.06-1.35-.17-2.015H12.24z" />
          </svg>
          Google
        </button>
      </div>

      <p className="text-center text-xs text-gray-500 mt-8">
        New to Terminas?{' '}
        <button onClick={onNavigateToRegister} className="text-blue-400 hover:underline font-semibold">
          Create an account
        </button>
      </p>
    </div>
  );
}
