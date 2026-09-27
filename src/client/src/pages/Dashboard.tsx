import React, { useEffect, useState } from 'react';
import { systemApi, tasksApi, calendarApi, memoryApi } from '../lib/api';

export function DashboardPage() {
  const [status, setStatus] = useState<any>(null);
  const [briefing, setBriefing] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statusData, briefingData] = await Promise.all([
        systemApi.status().catch(() => null),
        calendarApi.dailyBriefing().catch(() => null)
      ]);
      setStatus(statusData);
      setBriefing(briefingData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-[#1C1C2A] rounded w-1/3" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="h-32 bg-[#1C1C2A] rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  const health = status?.health;
  const predictions = status?.predictions || [];
  const metrics = status?.metrics;

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">Personal AI OS Overview • Real-time intelligence</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          health?.status === 'healthy' ? 'bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20' : 'bg-[#F59E0B]/10 text-[#F59E0B]'
        }`}>
          {health?.status || 'unknown'} • v{health?.version || '2.0.0'}
        </div>
      </div>

      {/* Health cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
          <div className="text-xs text-[#9CA3AF] mb-1">Database</div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${health?.services?.database?.status === 'healthy' ? 'bg-[#10B981]' : 'bg-[#EF4444]'}`} />
            <span className="font-medium text-sm">{health?.services?.database?.status || 'unknown'}</span>
            <span className="text-xs text-[#6B7280]">{health?.services?.database?.latencyMs || 0}ms</span>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
          <div className="text-xs text-[#9CA3AF] mb-1">AI Providers</div>
          <div className="text-sm font-medium">
            {health?.services?.aiProviders?.filter((p: any) => p.isConfigured).length || 0}/{health?.services?.aiProviders?.length || 0} configured
          </div>
          <div className="text-xs text-[#6B7280] mt-1">Fallback: local intelligence active</div>
        </div>
        <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
          <div className="text-xs text-[#9CA3AF] mb-1">Background Workers</div>
          <div className="text-sm font-medium">
            {health?.services?.backgroundWorkers?.active || 0} active • {health?.services?.backgroundWorkers?.queued || 0} queued
          </div>
          <div className="text-xs text-[#6B7280] mt-1">{health?.services?.backgroundWorkers?.failed || 0} failed</div>
        </div>
        <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
          <div className="text-xs text-[#9CA3AF] mb-1">Emergency Stop</div>
          <div className={`text-sm font-medium ${status?.emergencyStopped ? 'text-[#EF4444]' : 'text-[#10B981]'}`}>
            {status?.emergencyStopped ? '🚨 ACTIVE' : '✅ Inactive'}
          </div>
          <div className="text-xs text-[#6B7280] mt-1">Uptime: {Math.floor((health?.uptime || 0) / 3600)}h</div>
        </div>
      </div>

      {/* Briefing */}
      {briefing && (
        <div className="p-5 rounded-xl bg-gradient-to-br from-[#7C3AED]/10 to-[#06B6D4]/10 border border-[#7C3AED]/20">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <span>📋</span> Daily Briefing • {briefing.date}
          </h2>
          <p className="text-sm text-[#EDE9FE]/80 mb-4">{briefing.summary}</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-medium text-[#A78BFA] mb-2">Today's Events ({briefing.events?.length || 0})</div>
              {briefing.events?.length > 0 ? briefing.events.slice(0,3).map((e: any) => (
                <div key={e.id} className="text-xs py-1.5 px-3 rounded-lg bg-[#14141E] border border-[#2A2A3D] mb-1">
                  <div className="font-medium">{e.title}</div>
                  <div className="text-[#9CA3AF]">{new Date(e.start_time).toLocaleTimeString()}</div>
                </div>
              )) : <div className="text-xs text-[#6B7280]">No events today</div>}
            </div>
            <div>
              <div className="text-xs font-medium text-[#A78BFA] mb-2">Pending Tasks ({briefing.tasks?.length || 0})</div>
              {briefing.tasks?.length > 0 ? briefing.tasks.slice(0,3).map((t: any) => (
                <div key={t.id} className="text-xs py-1.5 px-3 rounded-lg bg-[#14141E] border border-[#2A2A3D] mb-1">
                  <div className="font-medium">{t.title}</div>
                  <div className="text-[#9CA3AF]">{t.status} • {t.priority}</div>
                </div>
              )) : <div className="text-xs text-[#6B7280]">No pending tasks</div>}
            </div>
          </div>
        </div>
      )}

      {/* Predictions */}
      {predictions.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold flex items-center gap-2">🔮 Predictive Intelligence</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {predictions.map((p: any, i: number) => (
              <div key={i} className={`p-4 rounded-xl border ${
                p.severity === 'high' ? 'bg-[#EF4444]/5 border-[#EF4444]/20' :
                p.severity === 'medium' ? 'bg-[#F59E0B]/5 border-[#F59E0B]/20' :
                'bg-[#14141E] border-[#2A2A3D]'
              }`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="font-medium text-sm">{p.title}</div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    p.severity === 'high' ? 'bg-[#EF4444]/20 text-[#EF4444]' :
                    p.severity === 'medium' ? 'bg-[#F59E0B]/20 text-[#F59E0B]' :
                    'bg-[#2A2A3D] text-[#9CA3AF]'
                  }`}>{p.severity}</span>
                </div>
                <div className="text-xs text-[#9CA3AF] leading-relaxed">{p.description}</div>
                {p.suggestedAction && (
                  <div className="text-xs text-[#A78BFA] mt-2">→ {p.suggestedAction}</div>
                )}
                <div className="text-[10px] text-[#6B7280] mt-2 font-mono">Confidence: {Math.round(p.confidence * 100)}% • Prediction, not fact</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Architecture overview */}
      <div className="p-5 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
        <h2 className="font-semibold mb-4">🏗️ Production Architecture</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
          <div className="space-y-2">
            <div className="font-medium text-[#A78BFA]">Core Intelligence</div>
            <div className="space-y-1 text-[#9CA3AF]">
              <div>✓ Intent Engine (ANSWER, PLAN, TOOL, AUTOMATION, RESEARCH, MEMORY)</div>
              <div>✓ Context Engine (semantic retrieval)</div>
              <div>✓ Orchestrator + Planner</div>
              <div>✓ Verification + Contradiction Detection</div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="font-medium text-[#A78BFA]">Task Engine</div>
            <div className="space-y-1 text-[#9CA3AF]">
              <div>✓ PLANNED → APPROVED → EXECUTING → VERIFYING → COMPLETED</div>
              <div>✓ FAILED → RETRYING → RECOVERED</div>
              <div>✓ Dependency, Conflict, Timeout, Idempotency</div>
              <div>✓ Emergency STOP ALL</div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="font-medium text-[#A78BFA]">Security</div>
            <div className="space-y-1 text-[#9CA3AF]">
              <div>✓ Permission Firewall (per-tool, per-agent)</div>
              <div>✓ Encrypted secrets, Audit logs</div>
              <div>✓ Session revocation, Suspicious detection</div>
              <div>✓ No secrets in frontend</div>
            </div>
          </div>
        </div>
      </div>

      {/* Model providers */}
      <div className="p-5 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
        <h2 className="font-semibold mb-3">🤖 Model Routing</h2>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          {health?.services?.aiProviders?.map((p: any) => (
            <div key={p.provider} className="p-3 rounded-lg bg-[#0A0A0F] border border-[#2A2A3D]">
              <div className="font-medium text-sm capitalize">{p.provider}</div>
              <div className={`text-xs mt-1 ${p.isConfigured ? 'text-[#10B981]' : 'text-[#F59E0B]'}`}>
                {p.isConfigured ? '✅ Configured' : '⚠️ REQUIRES CONFIGURATION'}
              </div>
              <div className="text-[10px] text-[#6B7280] mt-1 font-mono">{p.error || 'Ready'}</div>
            </div>
          ))}
        </div>
        <div className="text-xs text-[#6B7280] mt-3">
          Fallback: local intelligence provides real functionality when external providers not configured. No fake AI responses.
        </div>
      </div>
    </div>
  );
}
