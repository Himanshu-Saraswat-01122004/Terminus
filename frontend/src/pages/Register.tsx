import React, { useState } from 'react';
import { User, Mail, KeyRound, AlertCircle, ArrowRight } from 'lucide-react';

interface RegisterProps {
  onSuccess: () => void;
  onNavigateToLogin: () => void;
}

export default function Register({ onSuccess, onNavigateToLogin }: RegisterProps) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:3000/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create account');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 rounded-2xl border border-white/5 bg-[#0b0f17]/60 backdrop-blur-xl shadow-2xl relative">
      {/* Glow highlight */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-purple-500/10 rounded-full filter blur-3xl pointer-events-none"></div>

      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight">Get Started</h2>
        <p className="text-gray-400 text-sm mt-2">Create a secure Terminas cloud workspace account</p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-3 items-start text-red-400 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Username</label>
          <div className="relative">
            <User className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="developer_yogi"
              className="w-full pl-11 pr-4 py-3 bg-[#0d121f]/60 border border-white/5 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Email Address</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-3.5 w-5 h-5 text-gray-500" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@domain.com"
              className="w-full pl-11 pr-4 py-3 bg-[#0d121f]/60 border border-white/5 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all"
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
              placeholder="Min 6 characters"
              className="w-full pl-11 pr-4 py-3 bg-[#0d121f]/60 border border-white/5 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all"
              minLength={6}
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-medium flex items-center justify-center gap-2 shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 transition-all disabled:opacity-50"
        >
          {loading ? 'Creating Account...' : 'Sign Up'}
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      <p className="text-center text-xs text-gray-500 mt-8">
        Already have an account?{' '}
        <button onClick={onNavigateToLogin} className="text-purple-400 hover:underline font-semibold">
          Sign in
        </button>
      </p>
    </div>
  );
}
