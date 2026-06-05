import React, { useState, useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';
import { Users, FileText, ArrowLeft, Loader2, Save } from 'lucide-react';

interface WorkspaceProps {
  containerId: string;
  workspaceName: string;
  username: string;
  onBack: () => void;
}

export default function Workspace({ containerId, workspaceName, username, onBack }: WorkspaceProps) {
  const [activeFile, setActiveFile] = useState<string>('main.js');
  const [loadingFile, setLoadingFile] = useState<boolean>(false);
  const [collabUsers, setCollabUsers] = useState<string[]>([]);
  const [stats, setStats] = useState<{ cpu: number; ram: number }>({ cpu: 0, ram: 0 });
  const [warnSuspension, setWarnSuspension] = useState<boolean>(false);
  
  const editorRef = useRef<any>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);

  // Poll container resources and idle warnings
  useEffect(() => {
    const token = localStorage.getItem('token') || '';
    
    const pollInterval = setInterval(async () => {
      // 1. Fetch container Docker telemetry stats
      try {
        const statsRes = await fetch(`http://localhost:3000/containers/${containerId}/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats({
            cpu: statsData.cpu_percentage,
            ram: statsData.memory_usage_mb
          });
        }
      } catch (err) {
        console.error("Failed to fetch telemetry:", err);
      }

      // 2. Fetch agent idle warnings status
      try {
        const idleRes = await fetch(`http://localhost:3000/ws/container/${containerId}/idle-status?token=${encodeURIComponent(token)}`);
        if (idleRes.ok) {
          const idleData = await idleRes.json();
          setWarnSuspension(idleData.warn_suspension);
        }
      } catch (err) {
        console.error("Failed to fetch idle status:", err);
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [containerId]);

  // Initialize and tear down Yjs document session
  const initYjs = (editor: any) => {
    // Cleanup previous session
    cleanupYjs();

    const token = localStorage.getItem('token') || '';
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const wsUrl = `ws://localhost:3000/ws/container/${containerId}/collaboration?token=${encodeURIComponent(token)}`;
    const roomName = `${containerId}-${activeFile}`;

    const provider = new WebsocketProvider(wsUrl, roomName, ydoc);
    providerRef.current = provider;

    const ytext = ydoc.getText('monaco');

    // Bind Monaco editor to Yjs text type and awareness
    const binding = new MonacoBinding(
      ytext,
      editor.getModel(),
      new Set([editor]),
      provider.awareness
    );
    bindingRef.current = binding;

    // Set local user awareness state
    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16);
    provider.awareness.setLocalStateField('user', {
      name: username,
      color: randomColor,
    });

    // Track peer cursors/users in room
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

  // Save changes explicitly to back-end container filesystem
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
      if (!res.ok) throw new Error('Failed to save file');
      alert('File saved to container workspace.');
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#07090e] text-gray-200">
      {/* Workspace Header */}
      <header className="h-14 border-b border-white/5 bg-[#0b0f17]/90 flex items-center justify-between px-6 z-10 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg border border-white/5 bg-[#0d121f]/40 hover:bg-[#0d121f]/80 text-gray-400 hover:text-white transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-semibold text-white text-sm leading-none">{workspaceName}</h2>
            <span className="text-[10px] text-gray-500 font-mono">Sandbox: {containerId.slice(0, 8)}</span>
          </div>
        </div>

        {/* Telemetry Resource Stats */}
        <div className="hidden md:flex items-center gap-4 text-[11px] text-gray-400 font-mono bg-[#0d121f]/40 border border-white/5 px-4 py-1.5 rounded-full">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
            <span>CPU: <strong className="text-white">{stats.cpu.toFixed(1)}%</strong></span>
          </div>
          <div className="w-px h-3.5 bg-white/10"></div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse"></span>
            <span>RAM: <strong className="text-white">{stats.ram.toFixed(1)} MB</strong> / 512 MB</span>
          </div>
        </div>

        {/* Active Collaborators list */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/5 bg-[#0d121f]/60 text-xs text-gray-400">
            <Users className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-semibold text-white">{collabUsers.length}</span>
            <span>active</span>
          </div>
          
          <button
            onClick={handleSaveFile}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            Save Code
          </button>
        </div>
      </header>

      {/* Auto-Suspend Warnings */}
      {warnSuspension && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-6 py-2 flex items-center justify-between text-xs text-yellow-400 z-10 animate-pulse shrink-0">
          <span className="font-medium">⚠️ Sandbox Warning: Workspace has been inactive. It will auto-suspend shortly to conserve compute balance. Type or move cursor to resume.</span>
        </div>
      )}

      {/* Editor & Panel area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Simple File Selector sidebar (Phase 5 mockup) */}
        <aside className="w-48 border-r border-white/5 bg-[#080b11]/90 flex flex-col shrink-0">
          <div className="p-4 border-b border-white/5">
            <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Explorer</span>
          </div>
          <div className="flex-1 p-2 space-y-1">
            {['main.js', 'package.json', 'README.md'].map((file) => (
              <button
                key={file}
                onClick={() => setActiveFile(file)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2 transition-all ${
                  activeFile === file
                    ? 'bg-purple-500/15 text-purple-400 border border-purple-500/10'
                    : 'text-gray-400 hover:bg-white/[0.02] hover:text-gray-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                {file}
              </button>
            ))}
          </div>
        </aside>

        {/* Editor container */}
        <main className="flex-1 bg-[#0b0c10] flex flex-col relative">
          {loadingFile && (
            <div className="absolute inset-0 bg-[#0b0c10]/80 z-20 flex items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
              <span className="text-gray-400 text-sm">Loading document...</span>
            </div>
          )}
          <div className="flex-1">
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
              }}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
