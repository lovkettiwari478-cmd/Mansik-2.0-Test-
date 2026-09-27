import React, { useEffect, useState } from 'react';
import { tasksApi } from '../lib/api';

export function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGoal, setNewGoal] = useState('');
  const [filter, setFilter] = useState<string>('');
  const [emergency, setEmergency] = useState(false);

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await tasksApi.list(filter ? { status: filter } : {});
      setTasks(data.tasks || []);
      const es = await tasksApi.emergencyStatus().catch(() => ({ emergencyStopped: false }));
      setEmergency(es.emergencyStopped);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const create = async () => {
    if (!newGoal.trim()) return;
    try {
      await tasksApi.create(newGoal);
      setNewGoal('');
      load();
    } catch (e: any) { alert(e.error || 'Failed'); }
  };

  const execute = async (id: string) => {
    try { await tasksApi.execute(id); setTimeout(load, 1000); } catch (e: any) { alert(e.error); }
  };

  const cancel = async (id: string) => {
    try { await tasksApi.cancel(id); load(); } catch (e: any) { alert(e.error); }
  };

  const emergencyStop = async () => {
    if (!confirm('Emergency STOP ALL agents and tasks?')) return;
    await tasksApi.emergencyStop();
    load();
  };

  const clearStop = async () => {
    await tasksApi.clearEmergencyStop();
    load();
  };

  const getStatusColor = (s: string) => {
    switch(s) {
      case 'COMPLETED': return 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20';
      case 'FAILED': return 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20';
      case 'EXECUTING': return 'bg-[#06B6D4]/10 text-[#06B6D4] border-[#06B6D4]/20';
      case 'PLANNED': return 'bg-[#2A2A3D] text-[#9CA3AF] border-[#2A2A3D]';
      default: return 'bg-[#2A2A3D] text-[#9CA3AF]';
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">Goal → Plan → Verified Execution • PLANNED → APPROVED → EXECUTING → VERIFYING → COMPLETED</p>
        </div>
        <div className="flex gap-2">
          {emergency ? (
            <button onClick={clearStop} className="px-4 py-2 rounded-xl bg-[#10B981] text-white text-sm">Clear Emergency Stop</button>
          ) : (
            <button onClick={emergencyStop} className="px-4 py-2 rounded-xl bg-[#EF4444] text-white text-sm">🚨 STOP ALL</button>
          )}
        </div>
      </div>

      {emergency && (
        <div className="p-4 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 text-sm text-[#EF4444]">
          🚨 Emergency Stop ACTIVE - All executing tasks cancelled. Clear to resume.
        </div>
      )}

      <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D] flex gap-3">
        <input value={newGoal} onChange={e => setNewGoal(e.target.value)} placeholder="Enter goal: e.g., Research AI trends and create report" className="flex-1 py-2.5 px-4 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] focus:border-[#7C3AED] focus:outline-none text-sm" onKeyDown={e => e.key === 'Enter' && create()} />
        <button onClick={create} className="px-5 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-medium">Create Task</button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {['', 'PLANNED', 'APPROVED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border ${filter === s ? 'bg-[#7C3AED] text-white border-[#7C3AED]' : 'bg-[#14141E] text-[#9CA3AF] border-[#2A2A3D] hover:text-white'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-[#14141E] rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <div key={task.id} className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D] hover:border-[#2A2A3D]/80 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-sm truncate">{task.title}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getStatusColor(task.status)}`}>{task.status}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1C1C2A] text-[#9CA3AF]">{task.priority}</span>
                  </div>
                  <div className="text-xs text-[#9CA3AF] line-clamp-2">{task.goal}</div>
                  {task.plan && (
                    <div className="mt-2 text-[11px] text-[#6B7280]">
                      {task.plan.steps?.length} steps • {task.plan.requiredTools?.join(', ') || 'no tools'} • Est: {Math.round((task.plan.estimatedDurationMs || 0)/1000)}s
                      {task.plan.risks?.length > 0 && <span className="text-[#F59E0B]"> • Risks: {task.plan.risks.join(', ')}</span>}
                    </div>
                  )}
                  <div className="mt-2 flex gap-2 text-[10px] font-mono text-[#6B7280]">
                    <span>ID: {task.id.slice(0,8)}</span>
                    <span>Retry: {task.retryCount}/{task.maxRetries}</span>
                    <span>{new Date(task.createdAt).toLocaleString()}</span>
                  </div>
                  {task.error && <div className="mt-2 text-xs text-[#EF4444] bg-[#EF4444]/5 p-2 rounded-lg">{task.error}</div>}
                </div>
                <div className="flex flex-col gap-2">
                  {(task.status === 'PLANNED' || task.status === 'APPROVED') && (
                    <button onClick={() => execute(task.id)} className="px-3 py-1.5 rounded-lg bg-[#7C3AED] text-white text-xs">Execute</button>
                  )}
                  {['EXECUTING', 'PLANNED', 'APPROVED', 'RETRYING'].includes(task.status) && (
                    <button onClick={() => cancel(task.id)} className="px-3 py-1.5 rounded-lg bg-[#1C1C2A] text-[#9CA3AF] text-xs">Cancel</button>
                  )}
                  <button onClick={() => navigator.clipboard.writeText(task.id)} className="px-3 py-1 rounded-lg bg-[#0A0A0F] text-[#6B7280] text-[10px]">Copy ID</button>
                </div>
              </div>
              {task.auditTrail?.length > 0 && (
                <details className="mt-3">
                  <summary className="text-[11px] text-[#6B7280] cursor-pointer">Audit trail ({task.auditTrail.length})</summary>
                  <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                    {task.auditTrail.map((a: any, i: number) => (
                      <div key={i} className="text-[10px] font-mono text-[#6B7280] p-1.5 rounded bg-[#0A0A0F]">
                        {a.timestamp} • {a.fromStatus} → {a.toStatus} • {a.actor}: {a.message}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
          {tasks.length === 0 && <div className="p-8 text-center text-[#6B7280] text-sm">No tasks • Create a goal to see PLANNED → APPROVED → EXECUTING → VERIFYING → COMPLETED flow</div>}
        </div>
      )}
    </div>
  );
}
