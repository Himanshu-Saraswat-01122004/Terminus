import React from 'react';
import { Terminal, Shield, Users, Server } from 'lucide-react';

function App() {
  return (
    <div className="min-h-screen bg-[#07090e] bg-radial-gradient flex flex-col items-center justify-center p-6 text-gray-200">
      {/* Background glowing effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full filter blur-[80px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full filter blur-[80px] pointer-events-none"></div>

      <header className="mb-12 text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/5 text-purple-400 text-sm font-medium mb-4 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
          Re-architecture Phase 1 Complete
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight text-white mb-3 bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">
          Terminas IDE
        </h1>
        <p className="text-gray-400 text-lg max-w-md mx-auto">
          High-performance, secure, collaborative cloud development environments powered by Go & React.
        </p>
      </header>

      <main className="grid md:grid-cols-2 gap-6 max-w-4xl w-full relative z-10">
        <div className="p-6 rounded-2xl border border-white/5 bg-[#0b0f17]/60 backdrop-blur-xl flex gap-4 items-start hover:border-blue-500/20 transition-all duration-300">
          <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-lg mb-1">Go Orchestrator & PostgreSQL</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Fast container lifecycle operations, GORM migration schemas, and robust relational mapping for user project states.
            </p>
          </div>
        </div>

        <div className="p-6 rounded-2xl border border-white/5 bg-[#0b0f17]/60 backdrop-blur-xl flex gap-4 items-start hover:border-purple-500/20 transition-all duration-300">
          <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400">
            <Terminal className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-lg mb-1">Go-Based Container Agent</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Pre-compiled static agent bin inside each workspace running PTY streams and safe path-traversal directory APIs.
            </p>
          </div>
        </div>

        <div className="p-6 rounded-2xl border border-white/5 bg-[#0b0f17]/60 backdrop-blur-xl flex gap-4 items-start hover:border-pink-500/20 transition-all duration-300">
          <div className="p-3 rounded-lg bg-pink-500/10 text-pink-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-lg mb-1">Yjs CRDT Collaboration</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Conflict-free editor document synchronization, custom name tag cursors, and real-time permission access levels.
            </p>
          </div>
        </div>

        <div className="p-6 rounded-2xl border border-white/5 bg-[#0b0f17]/60 backdrop-blur-xl flex gap-4 items-start hover:border-emerald-500/20 transition-all duration-300">
          <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-lg mb-1">Strict Sandbox Limits</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              Secure outbound port filtration paired with tight container execution limits (1.0 CPU, 512MB RAM + 512MB Swap).
            </p>
          </div>
        </div>
      </main>

      <footer className="mt-16 text-gray-500 text-xs">
        Terminas Cloud Platform &copy; 2026. All rights reserved.
      </footer>
    </div>
  );
}

export default App;
