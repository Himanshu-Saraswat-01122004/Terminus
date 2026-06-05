import React, { useState, useEffect } from 'react';
import { Terminal, Shield, Users, Server, LogOut, CheckCircle2, UserCircle, Play, Square, Trash2, ExternalLink, Plus } from 'lucide-react';
import Login from './pages/Login';
import Register from './pages/Register';
import OAuthSuccess from './pages/OAuthSuccess';
import Workspace from './pages/Workspace';

type AppView = 'login' | 'register' | 'oauth-success' | 'dashboard' | 'workspace';

interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: string;
  bio: string;
  billing_amount: number;
}

interface ContainerWorkspace {
  id: string;
  name: string;
  docker_id: string;
  private_ip: string;
  template: string;
  status: string;
  started_at: string;
}

interface TemplateItem {
  id: string;
  name: string;
  image: string;
  price: number;
}

function App() {
  const [view, setView] = useState<AppView>('login');
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<UserProfile | null>(null);
  const [workspaces, setWorkspaces] = useState<ContainerWorkspace[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<ContainerWorkspace | null>(null);
  
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Auto route based on token state
  useEffect(() => {
    if (window.location.pathname === '/oauth-success') {
      setView('oauth-success');
    } else if (token) {
      setView('dashboard');
      fetchUserProfile(token);
      fetchWorkspaces(token);
      fetchTemplates(token);
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
        handleLogout();
      }
    } catch {
      handleLogout();
    }
  };

  const fetchWorkspaces = async (authToken: string) => {
    try {
      const res = await fetch('http://localhost:3000/containers', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (res.ok) {
        setWorkspaces(data.workspaces || []);
      }
    } catch (err) {
      console.error('Failed to load workspaces:', err);
    }
  };

  const fetchTemplates = async (authToken: string) => {
    // Return standard template if DB table is clean
    const fallbackTemplates = [
      { id: '11111111-1111-1111-1111-111111111111', name: 'Node.js 20 Developer Environment', image: 'node:20-bookworm-slim', price: 0.05 }
    ];
    setTemplates(fallbackTemplates);
    setSelectedTemplateId(fallbackTemplates[0].id);
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
    setWorkspaces([]);
    setView('login');
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim() || !selectedTemplateId || !token) return;
    setLoading(true);

    try {
      const res = await fetch('http://localhost:3000/containers/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newWorkspaceName,
          template_id: selectedTemplateId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create workspace');
      
      setNewWorkspaceName('');
      fetchWorkspaces(token);
      setMsg('Workspace created successfully!');
      setTimeout(() => setMsg(''), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartWorkspace = async (workspaceId: string) => {
    if (!token) return;
    try {
      const res = await fetch('http://localhost:3000/containers/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ container_id: workspaceId }),
      });
      if (res.ok) fetchWorkspaces(token);
    } catch (err) {
      console.error(err);
    }
  };

  const handleStopWorkspace = async (workspaceId: string) => {
    if (!token) return;
    try {
      const res = await fetch('http://localhost:3000/containers/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ container_id: workspaceId }),
      });
      if (res.ok) {
        fetchWorkspaces(token);
        fetchUserProfile(token); // Refresh billing balance
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteWorkspace = async (workspaceId: string) => {
    if (!token || !confirm('Are you sure you want to delete this workspace? All active memory will be lost.')) return;
    try {
      const res = await fetch(`http://localhost:3000/containers/${workspaceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) fetchWorkspaces(token);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenWorkspace = (workspace: ContainerWorkspace) => {
    setSelectedWorkspace(workspace);
    setView('workspace');
  };

  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col p-6 text-gray-200">
      {/* Background glowing effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/5 rounded-full filter blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full filter blur-[100px] pointer-events-none"></div>

      {view === 'oauth-success' && (
        <OAuthSuccess onSuccess={handleLoginSuccess} />
      )}

      {view === 'login' && (
        <div className="flex-1 flex flex-col items-center justify-center">
          {msg && (
            <div className="w-full max-w-md p-4 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex gap-2 items-center">
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
        <div className="flex-1 flex items-center justify-center">
          <Register
            onSuccess={handleRegisterSuccess}
            onNavigateToLogin={() => setView('login')}
          />
        </div>
      )}

      {view === 'workspace' && selectedWorkspace && user && (
        <Workspace
          containerId={selectedWorkspace.id}
          workspaceName={selectedWorkspace.name}
          username={user.username}
          onBack={() => {
            setView('dashboard');
            setSelectedWorkspace(null);
            if (token) {
              fetchWorkspaces(token);
              fetchUserProfile(token);
            }
          }}
        />
      )}

      {view === 'dashboard' && user && (
        <div className="w-full max-w-6xl mx-auto relative z-10 flex-1 flex flex-col justify-between">
          <div>
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

            {msg && (
              <div className="p-4 mb-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex gap-2 items-center">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span>{msg}</span>
              </div>
            )}

            <div className="grid md:grid-cols-3 gap-6">
              {/* Sidebar Panel: Profile & Creation */}
              <div className="space-y-6 md:col-span-1">
                {/* Profile Card */}
                <div className="p-6 rounded-2xl border border-white/5 bg-[#0b0f17]/60 backdrop-blur-xl">
                  <h3 className="font-semibold text-white text-lg mb-4">User Profile</h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-gray-500 block">Email</span>
                      <span className="text-gray-300 font-medium">{user.email}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Uptime Balance</span>
                      <span className="text-gray-300 font-semibold">${user.billing_amount.toFixed(4)}</span>
                    </div>
                  </div>
                </div>

                {/* Create Workspace */}
                <div className="p-6 rounded-2xl border border-white/5 bg-[#0b0f17]/60 backdrop-blur-xl">
                  <h3 className="font-semibold text-white text-lg mb-4">New Workspace</h3>
                  <form onSubmit={handleCreateWorkspace} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Workspace Name</label>
                      <input
                        type="text"
                        value={newWorkspaceName}
                        onChange={(e) => setNewWorkspaceName(e.target.value)}
                        placeholder="my-node-app"
                        className="w-full px-4 py-2.5 bg-[#0d121f]/60 border border-white/5 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all text-sm"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Template</label>
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        className="w-full px-4 py-2.5 bg-[#0d121f]/60 border border-white/5 rounded-xl text-white focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all text-sm"
                      >
                        {templates.map((t) => (
                          <option key={t.id} value={t.id} className="bg-[#0b0f17]">
                            {t.name} (${t.price}/hr)
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-medium flex items-center justify-center gap-2 shadow-lg shadow-purple-500/10 transition-all disabled:opacity-50 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      {loading ? 'Starting Sandbox...' : 'Create Sandbox'}
                    </button>
                  </form>
                </div>
              </div>

              {/* Main Panel: Active Workspaces */}
              <div className="md:col-span-2 space-y-6">
                <div className="p-6 rounded-2xl border border-white/5 bg-[#0b0f17]/60 backdrop-blur-xl">
                  <h3 className="font-semibold text-white text-lg mb-4">Workspaces</h3>
                  
                  {workspaces.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-white/5 rounded-xl">
                      <Server className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">No active developer environments found.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {workspaces.map((ws) => (
                        <div
                          key={ws.id}
                          className="p-4 rounded-xl border border-white/[0.03] bg-[#0d121f]/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-purple-500/20 transition-all"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-white text-base">{ws.name}</h4>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                ws.status === 'running'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/10'
                                  : 'bg-yellow-500/15 text-yellow-500 border border-yellow-500/10'
                              }`}>
                                {ws.status}
                              </span>
                            </div>
                            <p className="text-gray-500 text-xs mt-1">
                              Template: {ws.template} | IP: {ws.private_ip || 'None'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {ws.status === 'running' ? (
                              <>
                                <button
                                  onClick={() => handleOpenWorkspace(ws)}
                                  className="py-2 px-3 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 font-semibold text-xs flex items-center gap-1.5 transition-all border border-purple-500/10"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  Open Editor
                                </button>
                                <button
                                  onClick={() => handleStopWorkspace(ws.id)}
                                  className="p-2 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 transition-all border border-yellow-500/10"
                                  title="Stop Sandbox"
                                >
                                  <Square className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleStartWorkspace(ws.id)}
                                  className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-all border border-emerald-500/10"
                                  title="Start Sandbox"
                                >
                                  <Play className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteWorkspace(ws.id)}
                                  className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all border border-red-500/10"
                                  title="Delete Sandbox"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <footer className="mt-16 text-center text-gray-600 text-xs">
            Terminas Cloud Platform &copy; 2026. All rights reserved.
          </footer>
        </div>
      )}
    </div>
  );
}

export default App;
