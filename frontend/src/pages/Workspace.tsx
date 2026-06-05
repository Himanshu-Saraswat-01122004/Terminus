import React, { useState, useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import { Terminal as Xterm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Folder,
  File,
  ChevronDown,
  ChevronRight,
  Terminal as TerminalIcon,
  Activity,
  Files,
  ArrowLeft,
  Loader2,
  Save,
  X,
  Play,
  RotateCw
} from 'lucide-react';
import 'xterm/css/xterm.css';

interface WorkspaceProps {
  containerId: string;
  workspaceName: string;
  username: string;
  onBack: () => void;
}

interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  child?: FileItem[];
}

type SidebarTab = 'explorer' | 'telemetry';

export default function Workspace({ containerId, workspaceName, username, onBack }: WorkspaceProps) {
  // Navigation & Tabs States
  const [activeTab, setActiveTab] = useState<SidebarTab>('explorer');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openFiles, setOpenFiles] = useState<string[]>(['main.js']);
  const [activeFile, setActiveFile] = useState<string>('main.js');
  const [fileTree, setFileTree] = useState<FileItem | null>(null);
  
  // States
  const [loadingTree, setLoadingTree] = useState(false);
  const [collabUsers, setCollabUsers] = useState<string[]>([]);
  const [stats, setStats] = useState<{ cpu: number; ram: number }>({ cpu: 0, ram: 0 });
  const [warnSuspension, setWarnSuspension] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(true);

  // Telemetry History
  const [telemetryHistory, setTelemetryHistory] = useState<{ time: string; cpu: number; ram: number }[]>([]);

  // Ref Hooks
  const editorRef = useRef<any>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const xtermInstanceRef = useRef<Xterm | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Fetch Container Filesystem Tree
  const fetchFileTree = async () => {
    setLoadingTree(true);
    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch(
        `http://localhost:3000/ws/container/${containerId}/files/tree?path=&token=${encodeURIComponent(token)}`
      );
      if (res.ok) {
        const data = await res.json();
        setFileTree(data);
      }
    } catch (err) {
      console.error('Failed to load file tree:', err);
    } finally {
      setLoadingTree(false);
    }
  };

  useEffect(() => {
    fetchFileTree();
  }, [containerId]);

  // Telemetry and Idle Polling
  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    const interval = setInterval(async () => {
      // 1. Fetch live container CPU/RAM stats
      try {
        const statsRes = await fetch(`http://localhost:3000/containers/${containerId}/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (statsRes.ok) {
          const data = await statsRes.json();
          const cpuVal = data.cpu_percentage || 0;
          const ramVal = data.memory_usage_mb || 0;
          setStats({ cpu: cpuVal, ram: ramVal });

          // Append to chart history (limit to 20 samples)
          setTelemetryHistory((prev) => [
            ...prev.slice(-19),
            {
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              cpu: parseFloat(cpuVal.toFixed(1)),
              ram: parseFloat(ramVal.toFixed(1))
            }
          ]);
        }
      } catch (err) {
        console.error('Stats poll error:', err);
      }

      // 2. Fetch agent idle indicators
      try {
        const idleRes = await fetch(
          `http://localhost:3000/ws/container/${containerId}/idle-status?token=${encodeURIComponent(token)}`
        );
        if (idleRes.ok) {
          const idleData = await idleRes.json();
          setWarnSuspension(idleData.warn_suspension);
        }
      } catch (err) {
        console.error('Idle status error:', err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [containerId]);

  // Yjs Session Coordinator
  const initYjs = (editor: any) => {
    cleanupYjs();

    const token = localStorage.getItem('token') || '';
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const wsUrl = `ws://localhost:3000/ws/container/${containerId}/collaboration?token=${encodeURIComponent(token)}`;
    const roomName = `${containerId}-${activeFile}`;

    const provider = new WebsocketProvider(wsUrl, roomName, ydoc);
    providerRef.current = provider;

    const ytext = ydoc.getText('monaco');

    const binding = new MonacoBinding(
      ytext,
      editor.getModel(),
      new Set([editor]),
      provider.awareness
    );
    bindingRef.current = binding;

    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16);
    provider.awareness.setLocalStateField('user', {
      name: username,
      color: randomColor,
    });

    const updateUsers = () => {
      const states = provider.awareness.getStates();
      const users: string[] = [];
      states.forEach((state: any) => {
        if (state.user) {
          users.push(state.user.name);
        }
      });
      setCollabUsers(users);
    };

    provider.awareness.on('change', updateUsers);
    updateUsers();
  };

  const cleanupYjs = () => {
    if (bindingRef.current) {
      bindingRef.current.destroy();
      bindingRef.current = null;
    }
    if (providerRef.current) {
      providerRef.current.destroy();
      providerRef.current = null;
    }
    if (ydocRef.current) {
      ydocRef.current.destroy();
      ydocRef.current = null;
    }
  };

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
    initYjs(editor);
  };

  useEffect(() => {
    if (editorRef.current) {
      initYjs(editorRef.current);
    }
    return () => cleanupYjs();
  }, [activeFile]);

  // Explicit Save Hook
  const handleSaveFile = async () => {
    if (!editorRef.current) return;
    const content = editorRef.current.getValue();
    const token = localStorage.getItem('token') || '';

    try {
      const res = await fetch(
        `http://localhost:3000/ws/container/${containerId}/file/write?path=${encodeURIComponent(activeFile)}&token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: content,
        }
      );
      if (!res.ok) throw new Error('Save failed');
      alert(`File "${activeFile}" saved successfully.`);
      fetchFileTree(); // Reload tree for updated sizing
    } catch (err: any) {
      alert('Failed saving: ' + err.message);
    }
  };

  // Mount Xterm.js Terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Xterm({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: "'Fira Code', monospace",
      theme: {
        background: '#07090e',
        foreground: '#e2e8f0',
        cursor: '#a855f7',
        black: '#07090e',
        red: '#f43f5e',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#8b5cf6',
        cyan: '#06b6d4',
        white: '#cbd5e1'
      }
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermInstanceRef.current = term;
    fitAddonRef.current = fitAddon;

    const token = localStorage.getItem('token') || '';
    const wsUrl = `ws://localhost:3000/ws/container/${containerId}/term?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      // Send fit dimensions
      ws.send(JSON.stringify({
        type: 'resize',
        cols: term.cols,
        rows: term.rows
      }));
    };

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    const handleResize = () => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'resize',
          cols: term.cols,
          rows: term.rows
        }));
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      ws.close();
      term.dispose();
    };
  }, [containerId, terminalOpen]);

  // Tab Manager Helpers
  const handleOpenFile = (path: string) => {
    if (!openFiles.includes(path)) {
      setOpenFiles((prev) => [...prev, path]);
    }
    setActiveFile(path);
  };

  const handleCloseFile = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = openFiles.filter((f) => f !== path);
    setOpenFiles(filtered);
    if (activeFile === path && filtered.length > 0) {
      setActiveFile(filtered[filtered.length - 1]);
    }
  };

  // Recursive Directory Tree Component
  const FileNodeView = ({ node, depth = 0 }: { node: FileItem; depth: number }) => {
    const [collapsed, setCollapsed] = useState(true);

    if (!node.is_dir) {
      return (
        <button
          onClick={() => handleOpenFile(node.path)}
          className={`w-full text-left py-1.5 pr-2 pl-3 rounded-lg text-xs flex items-center gap-2 hover:bg-white/[0.02] transition-all ${
            activeFile === node.path
              ? 'bg-purple-500/15 text-purple-400 font-semibold border-l-2 border-purple-500 rounded-l-none'
              : 'text-gray-400'
          }`}
          style={{ paddingLeft: `${depth * 12 + 12}px` }}
        >
          <File className="w-3.5 h-3.5 shrink-0 text-blue-400" />
          <span className="truncate">{node.name}</span>
        </button>
      );
    }

    return (
      <div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full text-left py-1.5 px-2 rounded-lg text-xs font-medium text-gray-300 flex items-center gap-1.5 hover:bg-white/[0.02] transition-all"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
          )}
          <Folder className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
        {!collapsed && node.child && (
          <div className="space-y-0.5 mt-0.5">
            {node.child.map((child) => (
              <FileNodeView key={child.path} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#07090e] text-gray-200 overflow-hidden font-sans">
      {/* 1. Workspace Header */}
      <header className="h-14 border-b border-white/5 bg-[#0b0f17]/90 flex items-center justify-between px-6 z-10 shrink-0 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg border border-white/5 bg-[#0d121f]/40 hover:bg-[#0d121f]/80 text-gray-400 hover:text-white transition-all"
            title="Exit Workspace"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-semibold text-white text-sm leading-none">{workspaceName}</h2>
            <span className="text-[10px] text-gray-500 font-mono">ID: {containerId.slice(0, 8)}</span>
          </div>
        </div>

        {/* Header Telemetry Pill */}
        <div className="hidden md:flex items-center gap-4 text-[11px] text-gray-400 font-mono bg-[#0d121f]/50 border border-white/5 px-4 py-1.5 rounded-full shadow-inner">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${stats.cpu > 70 ? 'bg-red-400' : 'bg-blue-400'} animate-pulse`}></span>
            <span>CPU: <strong className="text-white">{stats.cpu.toFixed(1)}%</strong></span>
          </div>
          <div className="w-px h-3.5 bg-white/10"></div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
            <span>RAM: <strong className="text-white">{stats.ram.toFixed(1)} MB</strong> / 512 MB</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Collaborators count */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/5 bg-[#0d121f]/60 text-xs text-gray-400">
            <Users className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-semibold text-white">{collabUsers.length}</span>
            <span>active</span>
          </div>

          <button
            onClick={handleSaveFile}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 transition-all border border-purple-500/20"
          >
            <Save className="w-3.5 h-3.5" />
            Save File
          </button>
        </div>
      </header>

      {/* In-app Auto-Suspend Alert Banner */}
      {warnSuspension && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-6 py-2.5 flex items-center justify-between text-xs text-yellow-400 z-10 animate-pulse shrink-0">
          <span className="font-medium">⚠️ Auto-Suspend Warning: Sandbox is idle. Moving cursor or editing files will reset the 15-minute shutdown timer.</span>
        </div>
      )}

      {/* 2. Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Side Activity Bar (VS Code style width 12) */}
        <nav className="w-12 border-r border-white/5 bg-[#080b11] flex flex-col items-center py-4 gap-6 shrink-0 z-10">
          <button
            onClick={() => {
              if (activeTab === 'explorer') setSidebarOpen(!sidebarOpen);
              else { setActiveTab('explorer'); setSidebarOpen(true); }
            }}
            className={`p-2.5 rounded-xl transition-all ${
              sidebarOpen && activeTab === 'explorer'
                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            title="File Explorer"
          >
            <Files className="w-5 h-5" />
          </button>

          <button
            onClick={() => {
              if (activeTab === 'telemetry') setSidebarOpen(!sidebarOpen);
              else { setActiveTab('telemetry'); setSidebarOpen(true); }
            }}
            className={`p-2.5 rounded-xl transition-all ${
              sidebarOpen && activeTab === 'telemetry'
                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            title="Telemetry Graphs"
          >
            <Activity className="w-5 h-5" />
          </button>

          <button
            onClick={() => setTerminalOpen(!terminalOpen)}
            className={`p-2.5 rounded-xl mt-auto transition-all ${
              terminalOpen ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'text-gray-500 hover:text-gray-300'
            }`}
            title="Toggle Terminal"
          >
            <TerminalIcon className="w-5 h-5" />
          </button>
        </nav>

        {/* Collapsible Sidebar (Width 64) */}
        {sidebarOpen && (
          <aside className="w-64 border-r border-white/5 bg-[#080b11]/70 flex flex-col shrink-0">
            {activeTab === 'explorer' ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-white/5 flex justify-between items-center shrink-0">
                  <span className="text-xs uppercase font-bold text-gray-400 tracking-wider">Explorer</span>
                  <button
                    onClick={fetchFileTree}
                    className="p-1 text-gray-500 hover:text-white rounded hover:bg-white/5 transition-all"
                    title="Refresh Tree"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 p-2 overflow-y-auto space-y-1">
                  {loadingTree && !fileTree ? (
                    <div className="py-8 text-center text-xs text-gray-500 flex justify-center items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Reading files...</span>
                    </div>
                  ) : fileTree && fileTree.child ? (
                    fileTree.child.map((child) => (
                      <FileNodeView key={child.path} node={child} depth={0} />
                    ))
                  ) : (
                    <span className="text-xs text-gray-500 p-2 block">No files in workspace</span>
                  )}
                </div>
              </div>
            ) : (
              // Telemetry Panel
              <div className="flex-1 flex flex-col overflow-hidden p-4">
                <h3 className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-4 border-b border-white/5 pb-2 shrink-0">
                  Resource Telemetry
                </h3>
                
                <div className="flex-1 space-y-6 overflow-y-auto pr-1">
                  {/* CPU Area Graph */}
                  <div className="bg-[#0b0f17]/40 border border-white/5 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">
                      CPU UTILIZATION ({stats.cpu.toFixed(1)}%)
                    </span>
                    <div className="h-28 w-full font-mono text-[9px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={telemetryHistory}>
                          <defs>
                            <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="time" hide />
                          <YAxis domain={[0, 100]} hide />
                          <Tooltip contentStyle={{ background: '#0b0f17', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '9px' }} />
                          <Area type="monotone" dataKey="cpu" stroke="#3b82f6" fillOpacity={1} fill="url(#cpuGrad)" strokeWidth={1.5} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Memory Area Graph */}
                  <div className="bg-[#0b0f17]/40 border border-white/5 rounded-xl p-3">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">
                      MEM UTILIZATION ({stats.ram.toFixed(0)} MB / 512 MB)
                    </span>
                    <div className="h-28 w-full font-mono text-[9px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={telemetryHistory}>
                          <defs>
                            <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="time" hide />
                          <YAxis domain={[0, 512]} hide />
                          <Tooltip contentStyle={{ background: '#0b0f17', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '9px' }} />
                          <Area type="monotone" dataKey="ram" stroke="#a855f7" fillOpacity={1} fill="url(#ramGrad)" strokeWidth={1.5} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Center Editing Area and Lower Terminal Pane */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#07090e]">
          {/* Tab Header bar */}
          <div className="h-9 border-b border-white/5 bg-[#0b0f17]/50 flex items-center px-2 overflow-x-auto shrink-0 scrollbar-none gap-1">
            {openFiles.map((file) => (
              <button
                key={file}
                onClick={() => setActiveFile(file)}
                className={`group px-3 h-7 rounded-md text-xs font-medium flex items-center gap-2 border transition-all ${
                  activeFile === file
                    ? 'bg-[#07090e] border-white/10 text-white shadow-md'
                    : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/[0.01]'
                }`}
              >
                <File className="w-3.5 h-3.5 text-blue-400" />
                <span>{file}</span>
                <span
                  onClick={(e) => handleCloseFile(file, e)}
                  className="p-0.5 rounded-md text-gray-600 hover:text-white hover:bg-white/5 group-hover:opacity-100 transition-all"
                >
                  <X className="w-2.5 h-2.5" />
                </span>
              </button>
            ))}
          </div>

          {/* Monaco Editor Wrapper */}
          <main className="flex-1 bg-[#07090e] relative min-h-0">
            {openFiles.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <File className="w-10 h-10 text-gray-700 mb-2" />
                <h4 className="font-semibold text-white text-sm">No Active Document</h4>
                <p className="text-gray-500 text-xs mt-1">Select a file from the explorer list to edit code.</p>
              </div>
            ) : (
              <Editor
                height="100%"
                defaultLanguage="javascript"
                language={activeFile.endsWith('.json') ? 'json' : activeFile.endsWith('.md') ? 'markdown' : 'javascript'}
                theme="vs-dark"
                value=""
                onMount={handleEditorDidMount}
                options={{
                  fontSize: 13,
                  fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
                  minimap: { enabled: false },
                  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                  lineNumbersMinChars: 3,
                  wordWrap: 'on',
                  backgroundColor: '#07090e',
                  lineDecorationsWidth: 4,
                }}
              />
            )}
          </main>

          {/* Collapsible Lower Terminal Panel */}
          {terminalOpen && (
            <div className="h-56 border-t border-white/5 bg-[#07090e] flex flex-col shrink-0">
              <div className="h-8 border-b border-white/5 bg-[#0b0f17]/40 px-4 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-1.5">
                  <TerminalIcon className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Terminal Session</span>
                </div>
                <button
                  onClick={() => setTerminalOpen(false)}
                  className="p-1 text-gray-500 hover:text-white rounded hover:bg-white/5 transition-all"
                  title="Close Terminal"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 p-2 overflow-hidden bg-[#07090e]" ref={terminalRef}></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
