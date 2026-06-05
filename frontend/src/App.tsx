import React, { useState, useEffect } from 'react';
import { Terminal, Shield, Users, Server, LogOut, CheckCircle2, UserCircle } from 'lucide-react';
import Login from './pages/Login';
import Register from './pages/Register';
import OAuthSuccess from './pages/OAuthSuccess';

type AppView = 'login' | 'register' | 'oauth-success' | 'dashboard';

interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: string;
  bio: string;
  billing_amount: number;
}

function App() {
  const [view, setView] = useState<AppView>('login');
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [msg, setMsg] = useState('');

  // Handle URL detection for OAuth Redirection path
  useEffect(() => {
    if (window.location.pathname === '/oauth-success') {
      setView('oauth-success');
    } else if (token) {
      setView('dashboard');
      fetchUserProfile(token);
    }
  }, [token]);

  const fetchUserProfile = async (authToken: string) => {
    try {
      const res = await fetch('http://localhost:3000/user/me', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
      } else {
        // Token expired or invalid
        handleLogout();
      }
    } catch {
      handleLogout();
    }
  };

  const handleLoginSuccess = (newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setView('dashboard');
  };

  const handleRegisterSuccess = () => {
    setMsg('Account created successfully! Please log in.');
    setView('login');
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch('http://localhost:3000/auth/logout', {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    localStorage.removeItem('token');
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax';
    setToken(null);
    setUser(null);
    setView('login');
  };

  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center p-6 text-gray-200 overflow-y-auto">
      {/* Background glowing effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/5 rounded-full filter blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full filter blur-[100px] pointer-events-none"></div>

      {view === 'oauth-success' && (
        <OAuthSuccess onSuccess={handleLoginSuccess} />
      )}

      {view === 'login' && (
        <div className="flex flex-col items-center gap-4">
          {msg && (
            <div className="w-full max-w-md p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex gap-2 items-center">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{msg}</span>
            </div>
          )}
          <Login
            onSuccess={handleLoginSuccess}
            onNavigateToRegister={() => {
              setMsg('');
              setView('register');
            }}
          />
        </div>
      )}

      {view === 'register' && (
        <Register
          onSuccess={handleRegisterSuccess}
          onNavigateToLogin={() => setView('login')}
        />
      )}

      {view === 'dashboard' && user && (
        <div className="w-full max-w-4xl relative z-10">
          <header className="flex justify-between items-center mb-10 pb-6 border-b border-white/5">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Terminas Console
              </h1>
              <p className="text-gray-400 text-sm mt-1">Manage cloud workspaces & templates</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/5 bg-[#0b0f17]/40 text-gray-300 text-sm">
                <UserCircle className="w-4 h-4 text-purple-400" />
                <span>{user.username}</span>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/10">
                  {user.role}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2.5 rounded-xl border border-white/5 bg-[#0b0f17]/40 hover:bg-red-500/10 hover:text-red-400 transition-all"
                title="Log Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </header>

          <main className="grid md:grid-cols-3 gap-6">
            {/* Profile Card */}
            <div className="p-6 rounded-2xl border border-white/5 bg-[#0b0f17]/60 backdrop-blur-xl md:col-span-1 flex flex-col justify-between">
              <div>
                <h3 className="font-semibold text-white text-lg mb-3">User Profile</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-gray-500 block">Email</span>
                    <span className="text-gray-300 font-medium">{user.email}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Uptime Balance</span>
                    <span className="text-gray-300 font-semibold">${user.billing_amount.toFixed(2)}</span>
                  </div>
                  {user.bio && (
                    <div>
                      <span className="text-gray-500 block">Bio</span>
                      <p className="text-gray-400 text-xs leading-relaxed">{user.bio}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-white/5 text-[11px] text-gray-500">
                User ID: {user.id}
              </div>
            </div>

            {/* Core Features Overview */}
            <div className="p-6 rounded-2xl border border-white/5 bg-[#0b0f17]/60 backdrop-blur-xl md:col-span-2">
              <h3 className="font-semibold text-white text-lg mb-4">Workspace Features</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-white/[0.02] bg-[#0d121f]/40 flex gap-3 items-start">
                  <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-medium text-white text-sm">Go Orchestrator</h4>
                    <p className="text-gray-500 text-xs mt-1">Docker lifecycle commands with CPU/RAM caps.</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-white/[0.02] bg-[#0d121f]/40 flex gap-3 items-start">
                  <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-medium text-white text-sm">Go Container Agent</h4>
                    <p className="text-gray-500 text-xs mt-1">Lightweight binary with socket PTY streams.</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-white/[0.02] bg-[#0d121f]/40 flex gap-3 items-start">
                  <div className="p-2.5 rounded-lg bg-pink-500/10 text-pink-400">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-medium text-white text-sm">Yjs Collaboration</h4>
                    <p className="text-gray-500 text-xs mt-1">CRDT synchronized document and cursor sharing.</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-white/[0.02] bg-[#0d121f]/40 flex gap-3 items-start">
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-medium text-white text-sm">Strict Sandbox</h4>
                    <p className="text-gray-500 text-xs mt-1">1.0 CPU, 512MB RAM + Outbound limit controls.</p>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

export default App;
