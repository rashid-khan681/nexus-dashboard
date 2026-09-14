"use client";
import React, { useEffect, useState } from 'react';
import { Activity, Server, ShieldAlert, TerminalSquare, BrainCircuit, Cpu, Network, Clock, ActivitySquare, ShieldCheck, Zap } from 'lucide-react';
import { io } from 'socket.io-client';

export default function Dashboard() {
  const [metricsList, setMetricsList] = useState<any[]>([]);
  const [aiInsight, setAiInsight] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('activity');
  
  const [currentTime, setCurrentTime] = useState("");
  const [realPing, setRealPing] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const socketUrl = typeof window !== 'undefined' 
      ? `http://${window.location.hostname}:5000` 
      : 'http://localhost:5000';
    const socket = io(socketUrl);
    
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('infrastructure_metrics', (data) => setMetricsList(data));
    socket.on('ai_alert', (insight) => setAiInsight(insight));

   const pingInterval = setInterval(() => {
      const start = Date.now();
      socket.emit('ping_request');
      socket.once('pong_response', () => {
        const actualLatency = Date.now() - start;
        // 100% REAL PING - No artificial offsets
        setRealPing(actualLatency);
      });
    }, 2000);

    return () => { 
      clearInterval(pingInterval); 
      socket.disconnect(); 
    };
  }, []);

  const primaryMetrics = metricsList[0];

  return (
    <div className="flex h-screen overflow-hidden p-4 gap-4 bg-[#020202] text-white relative">
      
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none bg-[linear-gradient(rgba(59,130,246,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.1)_1px,transparent_1px)] bg-[size:40px_40px] animate-[pulse_4s_ease-in-out_infinite]"></div>
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,transparent_0%,#020202_80%)] pointer-events-none"></div>

      <aside className="w-20 rounded-2xl bg-[#050508]/60 border border-blue-900/30 flex flex-col items-center py-8 gap-8 z-10 backdrop-blur-xl shadow-[0_0_30px_rgba(0,0,0,0.8)]">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-b from-blue-500 to-blue-900 flex items-center justify-center font-black text-2xl shadow-[0_0_20px_rgba(59,130,246,0.5)] border border-blue-400/50 text-white relative overflow-hidden group hover:scale-105 transition-transform">
          <span className="relative z-10">N</span>
          <div className="absolute inset-0 bg-blue-400/20 group-hover:bg-blue-400/40 animate-[ping_2s_ease-in-out_infinite]"></div>
        </div>
        <div className="flex flex-col gap-8 text-gray-600 mt-4">
          <Activity onClick={() => setActiveTab('activity')} className={`w-6 h-6 cursor-pointer transition-all duration-300 ${activeTab === 'activity' ? 'text-blue-400 drop-shadow-[0_0_10px_#60a5fa] scale-110' : 'hover:text-blue-400/50'}`} />
          <Server onClick={() => setActiveTab('servers')} className={`w-6 h-6 cursor-pointer transition-all duration-300 ${activeTab === 'servers' ? 'text-blue-400 drop-shadow-[0_0_10px_#60a5fa] scale-110' : 'hover:text-blue-400/50'}`} />
          <ShieldCheck onClick={() => setActiveTab('alerts')} className={`w-6 h-6 cursor-pointer transition-all duration-300 ${activeTab === 'alerts' ? 'text-red-400 drop-shadow-[0_0_10px_#ef4444] scale-110' : 'hover:text-blue-400/50'}`} />
          <TerminalSquare onClick={() => setActiveTab('terminal')} className={`w-6 h-6 cursor-pointer transition-all duration-300 ${activeTab === 'terminal' ? 'text-blue-400 drop-shadow-[0_0_10px_#60a5fa] scale-110' : 'hover:text-blue-400/50'}`} />
        </div>
      </aside>

      <main className="flex-1 flex flex-col gap-4 z-10">
        <header className="h-20 rounded-2xl bg-[#050508]/60 border border-blue-900/30 flex items-center justify-between px-8 backdrop-blur-xl shadow-[0_0_30px_rgba(0,0,0,0.5)] hover:border-blue-700/50 transition-colors">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <h1 className="text-3xl font-black tracking-[0.15em] text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-blue-500 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)] hover:drop-shadow-[0_0_25px_rgba(59,130,246,0.8)] transition-all cursor-default">
                NEXUS PRIME
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                <span className="text-[10px] font-mono text-blue-400/80 tracking-[0.4em]">GLOBAL AEGIS SYSTEM • V2.0</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-6 bg-black/40 px-6 py-3 rounded-xl border border-blue-900/40 hover:bg-black/60 transition-colors cursor-default">
            <div className="flex items-center gap-3 border-r border-gray-800 pr-6">
              <Clock className="w-4 h-4 text-blue-400" />
              <span className="font-mono text-sm tracking-wider text-gray-200">{currentTime || "00:00:00"}</span>
              <span className="text-[10px] text-gray-500 font-bold">UTC+5:30</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-gray-400 tracking-widest">SYS_UPLINK</span>
              <div className="flex items-center justify-center relative w-4 h-4">
                 <span className={`absolute inset-0 rounded-full ${isConnected ? 'bg-green-500/40 animate-ping' : 'bg-red-500/40'}`}></span>
                 <span className={`relative w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 shadow-[0_0_12px_#22c55e]' : 'bg-red-500 shadow-[0_0_12px_#ef4444]'}`}></span>
              </div>
            </div>
          </div>
        </header>

        {activeTab === 'activity' && (
          <div className="flex-1 grid grid-cols-3 gap-4">
            
            <div className="col-span-2 rounded-2xl bg-[#050508]/60 border border-blue-900/30 flex flex-col p-8 relative overflow-hidden backdrop-blur-xl group">
               <div className="flex justify-between items-start mb-10">
                 <h2 className="text-[11px] font-black text-blue-400/80 tracking-[0.3em] flex items-center gap-3">
                   <Network className="w-4 h-4 group-hover:animate-spin" /> INFRASTRUCTURE TOPOLOGY
                 </h2>
                 <div className="px-3 py-1 bg-blue-950/30 border border-blue-900/50 rounded flex items-center gap-2 hover:bg-blue-900/30 transition-colors cursor-default">
                   <Zap className="w-3 h-3 text-yellow-400 animate-pulse" />
                   <span className="text-[10px] font-mono text-gray-400">ROUTING: OPTIMAL</span>
                 </div>
               </div>
               
               <div className="flex-1 flex flex-row items-center justify-around relative mt-4">
                  
                  {/* ADVANCED DNA-HELIX DATA STREAM */}
                  <div className="absolute top-1/2 left-[25%] right-[25%] h-24 -translate-y-1/2 z-0 opacity-80 group-hover:opacity-100 transition-opacity">
                     <svg viewBox="0 0 200 60" preserveAspectRatio="none" className="w-full h-full drop-shadow-[0_0_10px_rgba(59,130,246,0.6)]">
                        {/* Core Fiber Line */}
                        <line x1="0" y1="30" x2="200" y2="30" stroke="#1e3a8a" strokeWidth="2" opacity="0.6" />
                        
                        {/* Wavelength 1 (Over - Cyan) */}
                        <path d="M 0 30 C 20 -10, 30 -10, 50 30 C 70 70, 80 70, 100 30 C 120 -10, 130 -10, 150 30 C 170 70, 180 70, 200 30" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeDasharray="15 30">
                           <animate attributeName="stroke-dashoffset" from="90" to="0" dur="2s" repeatCount="indefinite" />
                        </path>

                        {/* Wavelength 2 (Under - Indigo) */}
                        <path d="M 0 30 C 20 70, 30 70, 50 30 C 70 -10, 80 -10, 100 30 C 120 70, 130 70, 150 30 C 170 -10, 180 -10, 200 30" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeDasharray="15 30" opacity="0.8">
                           <animate attributeName="stroke-dashoffset" from="90" to="0" dur="2s" repeatCount="indefinite" />
                        </path>

                        {/* Glowing Data Packets travelling on Core */}
                        <circle cx="0" cy="30" r="3" fill="#ffffff" filter="drop-shadow(0 0 5px #fff)">
                           <animate attributeName="cx" from="0" to="200" dur="1.5s" repeatCount="indefinite" />
                        </circle>
                        <circle cx="0" cy="30" r="3" fill="#60a5fa" filter="drop-shadow(0 0 5px #60a5fa)">
                           <animate attributeName="cx" from="0" to="200" dur="1.5s" begin="0.75s" repeatCount="indefinite" />
                        </circle>
                     </svg>
                  </div>

                  {metricsList.length > 0 ? (
                    metricsList.map((server, index) => (
                      <div key={index} className="flex flex-col items-center gap-4 z-10">
                        <div className={`relative w-52 h-52 rounded-full flex flex-col items-center justify-center transition-all duration-500 bg-black/90 border-[3px] hover:scale-105 cursor-crosshair ${server.cpuUsage > 85 ? 'border-red-500/80 shadow-[0_0_80px_rgba(239,68,68,0.4)]' : 'border-blue-500/40 shadow-[0_0_60px_rgba(59,130,246,0.3)]'}`}>
                          <div className={`absolute inset-0 rounded-full ${server.cpuUsage > 85 ? 'bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.2)_0%,transparent_60%)]' : 'bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.15)_0%,transparent_60%)]'}`}></div>
                          <div className={`absolute inset-[-15px] rounded-full border border-dashed ${server.cpuUsage > 85 ? 'border-red-500/60 animate-[spin_2s_linear_infinite]' : 'border-blue-500/40 animate-[spin_12s_linear_infinite]'}`}></div>
                          <div className={`absolute inset-[5px] rounded-full border-2 border-dotted ${server.cpuUsage > 85 ? 'border-red-500/30 animate-[spin_3s_linear_infinite_reverse]' : 'border-blue-500/20 animate-[spin_8s_linear_infinite_reverse]'}`}></div>
                          
                          <span className="text-[10px] text-gray-500 mb-2 tracking-[0.2em] relative z-10">{index === 0 ? 'PRIMARY_NODE' : 'STANDBY_NODE'}</span>
                          <span className="font-black tracking-widest text-2xl text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 drop-shadow-md relative z-10">{server.region}</span>
                          <div className="mt-4 flex flex-col items-center gap-1 relative z-10">
                            <span className="text-[9px] font-mono text-gray-500">COMPUTE_LOAD</span>
                            <span className={`text-sm font-mono font-black px-4 py-1 rounded border ${server.cpuUsage > 85 ? 'text-red-400 border-red-500/50 bg-red-950/30' : 'text-blue-400 border-blue-500/30 bg-blue-950/30'}`}>[ {server.cpuUsage}% ]</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-blue-500/50 font-mono text-sm z-10 animate-pulse flex flex-col items-center gap-2">
                      <ActivitySquare className="w-8 h-8 animate-spin" />
                      Scanning network topology...
                    </div>
                  )}
               </div>

               {aiInsight && (
                 <div className={`mt-10 p-5 rounded-xl border backdrop-blur-xl flex gap-5 items-start z-10 relative overflow-hidden transition-all duration-500 hover:scale-[1.02] cursor-default ${aiInsight.status === 'CRITICAL_ALERT' ? 'bg-red-950/40 border-red-500/60 shadow-[0_0_40px_rgba(239,68,68,0.2)]' : 'bg-[#060a14]/80 border-blue-500/40 shadow-[0_0_40px_rgba(59,130,246,0.15)]'}`}>
                   <div className="absolute inset-0 w-full h-[2px] bg-white/10 animate-[bounce_3s_infinite]"></div>
                   <div className={`p-4 rounded-xl relative ${aiInsight.status === 'CRITICAL_ALERT' ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-blue-500/20 text-blue-400'}`}>
                     <BrainCircuit className="w-7 h-7 relative z-10" />
                   </div>
                   <div className="flex-1">
                     <div className="flex justify-between items-center border-b border-gray-800/50 pb-2 mb-2">
                       <h3 className={`text-[13px] font-black tracking-[0.2em] ${aiInsight.status === 'CRITICAL_ALERT' ? 'text-red-400' : 'text-blue-400'}`}>
                         NEXUS AI {aiInsight.status === 'CRITICAL_ALERT' ? 'OVERRIDE PROTOCOL' : 'ANALYSIS ENGINE'}
                       </h3>
                       <div className="flex items-center gap-2">
                         <span className={`w-2 h-2 rounded-full ${aiInsight.status === 'CRITICAL_ALERT' ? 'bg-red-500' : 'bg-blue-500'} animate-pulse`}></span>
                         <span className="font-mono text-[10px] text-blue-300 tracking-widest bg-blue-950/50 px-3 py-1 rounded border border-blue-900/50">CONFIDENCE: [ {aiInsight.confidence_score}% ]</span>
                       </div>
                     </div>
                     <p className="text-sm text-gray-300 font-mono leading-relaxed tracking-wide border-l-2 border-blue-500/30 pl-3">
                       &gt; {aiInsight.insight_text}
                     </p>
                   </div>
                 </div>
               )}
            </div>

            <div className="col-span-1 rounded-2xl bg-[#050508]/60 border border-blue-900/30 p-8 flex flex-col gap-8 backdrop-blur-xl hover:border-blue-700/50 transition-colors">
              <h2 className="text-[11px] font-black text-blue-400/80 tracking-[0.3em] flex items-center gap-3">
                <Cpu className="w-4 h-4" /> SYSTEM TELEMETRY
              </h2>
              
              <div className="flex flex-col gap-3 mt-2">
                <div className="flex justify-between font-mono text-[11px] tracking-wider">
                  <span className="text-gray-400">COMPUTE_CORES</span>
                  <span className={primaryMetrics?.cpuUsage > 85 ? 'text-red-400 font-bold drop-shadow-[0_0_8px_#ef4444]' : 'text-blue-400'}>[ {primaryMetrics?.cpuUsage || 0}% ]</span>
                </div>
                <div className="w-full h-3 bg-black rounded overflow-hidden border border-gray-800 flex">
                  <div className={`h-full transition-all duration-300 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.2)_4px,rgba(255,255,255,0.2)_8px)] ${primaryMetrics?.cpuUsage > 85 ? 'bg-red-500 shadow-[0_0_15px_#ef4444]' : 'bg-blue-500 shadow-[0_0_15px_#3b82f6]'}`} style={{ width: `${primaryMetrics?.cpuUsage || 0}%` }}></div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex justify-between font-mono text-[11px] tracking-wider">
                  <span className="text-gray-400">MEMORY_ALLOCATION</span>
                  <span className="text-indigo-400 drop-shadow-[0_0_8px_#818cf8]">[ {primaryMetrics?.ramUsage || 0}% ]</span>
                </div>
                <div className="w-full h-3 bg-black rounded overflow-hidden border border-gray-800 flex">
                  <div className="h-full bg-indigo-500 shadow-[0_0_15px_#6366f1] transition-all duration-300 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.2)_4px,rgba(255,255,255,0.2)_8px)]" style={{ width: `${primaryMetrics?.ramUsage || 0}%` }}></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-2">
                 <div className="bg-black/50 border border-gray-800/80 rounded-lg p-3 flex flex-col gap-1 hover:bg-black/80 transition-colors cursor-crosshair">
                    <span className="text-[9px] font-mono text-gray-500 tracking-widest">REAL_PING</span>
                    <span className={`font-mono text-sm ${realPing > 100 ? 'text-yellow-400' : 'text-green-400'}`}>{realPing} ms</span>
                 </div>
                 <div className="bg-black/50 border border-gray-800/80 rounded-lg p-3 flex flex-col gap-1 hover:bg-black/80 transition-colors cursor-crosshair">
                    <span className="text-[9px] font-mono text-gray-500 tracking-widest">PACKET_LOSS</span>
                    <span className="font-mono text-sm text-green-400">0.00%</span>
                 </div>
              </div>

              <div className="mt-auto relative p-6 rounded-xl bg-gradient-to-b from-blue-950/20 to-black border border-blue-900/40 flex flex-col items-center justify-center gap-3 overflow-hidden hover:border-blue-500/50 transition-colors cursor-default">
                 <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.05)_1px,transparent_1px)] bg-[size:10px_10px]"></div>
                 <span className="text-[11px] font-mono text-blue-400/80 tracking-[0.3em] relative z-10">ACTIVE_SOCKETS</span>
                 <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-blue-500 drop-shadow-[0_0_20px_rgba(59,130,246,0.6)] relative z-10">{primaryMetrics?.activeConnections || 0}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'servers' && (
          <div className="flex-1 rounded-2xl bg-[#050508]/60 border border-blue-900/30 flex flex-col p-8 backdrop-blur-xl">
            <h2 className="text-xs font-black text-blue-400/80 tracking-[0.2em] mb-8 flex items-center gap-2"><Server className="w-4 h-4"/> SERVER FARM CONFIGURATION</h2>
            <div className="grid grid-cols-2 gap-6">
               <div className="p-6 rounded-xl bg-[#050508] border border-blue-500/50 flex justify-between items-center shadow-[0_0_20px_rgba(59,130,246,0.1)] hover:scale-[1.02] transition-transform cursor-default">
                 <div>
                   <p className="text-sm font-bold text-white tracking-wide">ap-south-1 (Primary Node)</p>
                   <p className="text-xs font-mono text-gray-500 mt-2">IP: 192.168.1.104 • AWS_Mumbai</p>
                 </div>
                 <span className="text-xs font-mono text-green-400 bg-green-950/30 px-4 py-1.5 rounded border border-green-500/30 tracking-widest shadow-[0_0_10px_rgba(34,197,94,0.2)]">[ ONLINE ]</span>
               </div>
               <div className="p-6 rounded-xl bg-[#050508] border border-gray-800 flex justify-between items-center hover:scale-[1.02] transition-transform cursor-default">
                 <div>
                   <p className="text-sm font-bold text-gray-400 tracking-wide">ap-south-2 (Standby Node)</p>
                   <p className="text-xs font-mono text-gray-600 mt-2">IP: 10.0.0.42 • AWS_Hyderabad</p>
                 </div>
                 <span className="text-xs font-mono text-gray-500 bg-gray-900 px-4 py-1.5 rounded border border-gray-700 tracking-widest">[ PASSIVE ]</span>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="flex-1 rounded-2xl bg-[#050508]/60 border border-blue-900/30 flex flex-col p-8 backdrop-blur-xl overflow-hidden relative">
            <div className="absolute right-2 top-10 bottom-10 w-1 bg-gray-900 rounded">
                <div className="w-full h-10 bg-blue-500/50 rounded animate-[bounce_4s_infinite]"></div>
            </div>
            <h2 className="text-xs font-black text-blue-400/80 tracking-[0.2em] mb-6 flex items-center gap-2"><ShieldCheck className="w-4 h-4"/> AI SECURITY & EVENT LOGS</h2>
            <div className="flex-1 overflow-y-auto font-mono text-xs space-y-4 pr-6">
              {aiInsight ? (
                <div className={`p-4 rounded border hover:bg-black/50 transition-colors cursor-crosshair ${aiInsight.status === 'CRITICAL_ALERT' ? 'bg-red-950/20 border-red-500/30 text-red-400' : 'bg-blue-950/20 border-blue-500/30 text-blue-300'}`}>
                  <span className="text-gray-500 mr-3">[{new Date().toLocaleTimeString()}]</span> INGRESS &gt; {aiInsight.insight_text}
                </div>
              ) : (
                <div className="text-gray-600 flex items-center gap-2"><ActivitySquare className="w-4 h-4 animate-spin"/> Awaiting live log stream...</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'terminal' && (
          <div className="flex-1 rounded-2xl bg-[#020202]/90 border border-blue-900/30 flex flex-col p-8 backdrop-blur-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-10 bg-[#0a0a0f] border-b border-gray-800 flex items-center px-6 gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-400 cursor-pointer transition-colors"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-400 cursor-pointer transition-colors"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-400 cursor-pointer transition-colors"></div>
              <span className="text-[11px] font-mono text-gray-500 ml-4 tracking-widest">root@nexus-core:~</span>
            </div>
            <div className="mt-8 font-mono text-sm text-green-400/90 tracking-wide leading-loose">
              <p className="text-blue-400">NEXUS OS v2.0.1 (x86_64) - Enterprise Edition</p>
              <p className="mt-4 text-gray-400">Loading kernel modules... <span className="text-green-400">[ OK ]</span></p>
              <p className="text-gray-400">Initializing Docker daemon... <span className="text-green-400">[ OK ]</span></p>
              <p className="mt-4">&gt; System awaiting manual EC2 container deployment prompt...</p>
              <p className="mt-2 text-blue-400 flex items-center">&gt; <span className="w-2 h-4 bg-blue-400 ml-2 animate-pulse"></span></p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
