import React, { useEffect, useState } from 'react';
import { calendarApi, knowledgeApi, toolsApi, agentsApi, integrationsApi, skillsApi, researchApi, systemApi, userApi } from '../lib/api';

export function CalendarPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [briefing, setBriefing] = useState<any>(null);

  useEffect(() => { load(); }, []);
  const load = async () => {
    try {
      const data = await calendarApi.list();
      setEvents(data.events || []);
      const b = await calendarApi.dailyBriefing().catch(() => null);
      setBriefing(b);
    } catch {}
  };

  const create = async () => {
    if (!title || !start || !end) return alert('Fill all');
    try {
      const res = await calendarApi.create({ title, startTime: start, endTime: end });
      if (res.warning) alert(res.warning);
      setTitle(''); setStart(''); setEnd('');
      load();
    } catch (e: any) { alert(e.error); }
  };

  const del = async (id: string) => {
    await calendarApi.delete(id);
    load();
  };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Calendar</h1>
      <p className="text-sm text-[#9CA3AF]">Conflict detection • Optimization • Daily briefing • Requires configuration for external sync</p>

      {briefing && (
        <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
          <div className="font-medium text-sm mb-2">Daily Briefing: {briefing.summary}</div>
          <div className="text-xs text-[#9CA3AF]">Events: {briefing.events?.length} • Tasks: {briefing.tasks?.length}</div>
        </div>
      )}

      <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D] grid grid-cols-1 lg:grid-cols-4 gap-3">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Event title" className="py-2.5 px-4 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] text-sm" />
        <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className="py-2.5 px-4 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] text-sm" />
        <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className="py-2.5 px-4 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] text-sm" />
        <button onClick={create} className="py-2.5 rounded-xl bg-[#7C3AED] text-white text-sm">Create Event</button>
      </div>

      <div className="space-y-2">
        {events.map((e: any) => (
          <div key={e.id} className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D] flex justify-between">
            <div>
              <div className="font-medium text-sm">{e.title}</div>
              <div className="text-xs text-[#9CA3AF]">{new Date(e.start_time).toLocaleString()} → {new Date(e.end_time).toLocaleString()}</div>
              <div className="text-[10px] text-[#6B7280] mt-1">{e.location || ''} • {e.source}</div>
            </div>
            <button onClick={() => del(e.id)} className="text-xs text-[#EF4444]">Delete</button>
          </div>
        ))}
        {events.length === 0 && <div className="text-sm text-[#6B7280] text-center p-8">No events • Create one with conflict detection</div>}
      </div>
    </div>
  );
}

export function KnowledgePage() {
  const [docs, setDocs] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);

  useEffect(() => { load(); }, []);
  const load = async () => {
    try { const data = await knowledgeApi.list(); setDocs(data.documents || []); } catch {}
  };

  const create = async () => {
    if (!title || !content) return;
    try { await knowledgeApi.create(title, content, 'note'); setTitle(''); setContent(''); load(); } catch (e: any) { alert(e.error); }
  };

  const doSearch = async () => {
    if (!search) return;
    try { const data = await knowledgeApi.search(search); setResults(data.results || []); } catch {}
  };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Knowledge Base</h1>
      <p className="text-sm text-[#9CA3AF]">PDFs, documents, notes • Semantic search • Source tracking • Duplicate detection</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
          <div className="font-medium text-sm mb-3">Add Document</div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className="w-full py-2.5 px-4 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] text-sm mb-2" />
          <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Content" className="w-full h-24 p-3 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] text-sm" />
          <button onClick={create} className="mt-3 w-full py-2.5 rounded-xl bg-[#7C3AED] text-white text-sm">Save Document</button>
        </div>
        <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
          <div className="font-medium text-sm mb-3">Search</div>
          <div className="flex gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search docs..." className="flex-1 py-2.5 px-4 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] text-sm" />
            <button onClick={doSearch} className="px-4 py-2.5 rounded-xl bg-[#1C1C2A] border border-[#2A2A3D] text-sm">Search</button>
          </div>
          <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
            {results.map((r: any) => <div key={r.id} className="p-2 rounded-lg bg-[#0A0A0F] border border-[#2A2A3D] text-xs"><div className="font-medium">{r.title}</div><div className="text-[#9CA3AF]">Score: {r.score}</div></div>)}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {docs.map((d: any) => (
          <div key={d.id} className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
            <div className="flex justify-between"><div className="font-medium text-sm">{d.title}</div><button onClick={async () => { await knowledgeApi.delete(d.id); load(); }} className="text-xs text-[#EF4444]">Delete</button></div>
            <div className="text-xs text-[#9CA3AF] mt-1 line-clamp-2">{d.content?.slice(0, 200)}</div>
            <div className="text-[10px] text-[#6B7280] mt-2">{d.type} • {d.mime_type || ''} • {new Date(d.created_at).toLocaleString()}</div>
          </div>
        ))}
        {docs.length === 0 && <div className="text-center text-[#6B7280] text-sm p-8">No documents • Add notes, PDFs (upload via API), etc.</div>}
      </div>
    </div>
  );
}

export function ToolsPage() {
  const [tools, setTools] = useState<any[]>([]);
  const [perms, setPerms] = useState<any[]>([]);

  useEffect(() => { load(); }, []);
  const load = async () => {
    try {
      const data = await toolsApi.list();
      setTools(data.tools || []);
      const p = await toolsApi.permissions();
      setPerms(p.permissions || []);
    } catch {}
  };

  const grant = async (resource: string, action: string) => {
    try { await toolsApi.grantPermission(resource, action); load(); } catch (e: any) { alert(e.error); }
  };

  const revoke = async (id: string) => {
    await toolsApi.revokePermission(id);
    load();
  };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Tools & Permissions</h1>
      <p className="text-sm text-[#9CA3AF]">Per-tool permissions • Firewall • Dangerous actions require explicit approval</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {tools.map(t => (
          <div key={t.id} className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-sm flex items-center gap-2">{t.name} {t.isDangerous && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#EF4444]/20 text-[#EF4444]">DANGEROUS</span>}</div>
                <div className="text-xs text-[#9CA3AF] mt-1">{t.description}</div>
                <div className="flex gap-2 mt-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.isConfigured ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#F59E0B]/10 text-[#F59E0B]'}`}>{t.isConfigured ? 'Configured' : 'REQUIRES CONFIG'}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.hasPermission ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#2A2A3D] text-[#9CA3AF]'}`}>{t.hasPermission ? 'Allowed' : 'No Permission'}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1C1C2A] text-[#6B7280]">{t.category}</span>
                </div>
                {!t.isConfigured && t.missingConfig && <div className="text-[10px] text-[#F59E0B] mt-1">Missing: {t.missingConfig.join(', ')}</div>}
              </div>
              <div className="flex flex-col gap-1">
                {!t.hasPermission && <button onClick={() => grant(t.id, 'execute')} className="px-3 py-1 rounded-lg bg-[#7C3AED] text-white text-xs">Grant</button>}
                <button onClick={async () => { try { const res = await toolsApi.execute(t.id, { query: 'test' }); alert(JSON.stringify(res.result).slice(0, 200)); } catch (e: any) { alert(e.error || e.message); } }} className="px-3 py-1 rounded-lg bg-[#1C1C2A] text-xs">Test</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
        <div className="font-medium text-sm mb-3">Active Permissions ({perms.length})</div>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {perms.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-[#0A0A0F] border border-[#2A2A3D] text-xs">
              <span>{p.resource}:{p.action} • {p.granted ? '✅' : '❌'} • {p.is_temporary ? 'Temp' : 'Perm'} • {p.expires_at ? 'Expires: ' + new Date(p.expires_at).toLocaleString() : 'No expiry'}</span>
              <button onClick={() => revoke(p.id)} className="text-[#EF4444]">Revoke</button>
            </div>
          ))}
          {perms.length === 0 && <div className="text-xs text-[#6B7280]">No explicit permissions - safe reads auto-allowed, dangerous require grant</div>}
        </div>
      </div>
    </div>
  );
}

export function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [taskInput, setTaskInput] = useState('');

  useEffect(() => { load(); }, []);
  const load = async () => {
    try {
      const data = await agentsApi.list();
      setAgents(data.agents || []);
      const j = await agentsApi.jobs();
      setJobs(j.jobs || []);
    } catch {}
  };

  const runAgent = async (id: string) => {
    if (!taskInput) return alert('Enter task');
    try { await agentsApi.execute(id, taskInput); setTaskInput(''); load(); } catch (e: any) { alert(e.error); }
  };

  const emergency = async () => {
    if (!confirm('STOP ALL AGENTS?')) return;
    await agentsApi.emergencyStop();
    load();
  };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Agents</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">Multi-agent architecture • Personal assistant, researcher, task executor, memory keeper, computer, creative</p>
        </div>
        <button onClick={emergency} className="px-4 py-2 rounded-xl bg-[#EF4444] text-white text-sm">🚨 STOP ALL AGENTS</button>
      </div>

      <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D] flex gap-3">
        <input value={taskInput} onChange={e => setTaskInput(e.target.value)} placeholder="Task for agent (e.g., research AI trends)" className="flex-1 py-2.5 px-4 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] text-sm" />
        <span className="text-xs text-[#6B7280] py-2.5">Select agent below to execute</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {agents.map((a: any) => (
          <div key={a.id} className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
            <div className="font-medium text-sm">{a.name}</div>
            <div className="text-xs text-[#9CA3AF] mt-1">{a.description}</div>
            <div className="flex flex-wrap gap-1 mt-2">
              {a.capabilities?.map((c: string) => <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-[#1C1C2A] border border-[#2A2A3D]">{c}</span>)}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => runAgent(a.id)} className="px-3 py-1.5 rounded-lg bg-[#7C3AED] text-white text-xs">Run Agent</button>
              <span className={`text-[10px] px-2 py-1 rounded-full ${a.status === 'active' ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#2A2A3D] text-[#9CA3AF]'}`}>{a.status}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
        <div className="font-medium text-sm mb-3">Background Jobs ({jobs.length})</div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {jobs.map((j: any) => (
            <div key={j.id} className="p-3 rounded-lg bg-[#0A0A0F] border border-[#2A2A3D] text-xs">
              <div className="flex justify-between"><span className="font-medium">{j.type}</span><span className={`px-2 py-0.5 rounded-full text-[10px] ${j.status === 'completed' ? 'bg-[#10B981]/10 text-[#10B981]' : j.status === 'failed' ? 'bg-[#EF4444]/10 text-[#EF4444]' : 'bg-[#2A2A3D] text-[#9CA3AF]'}`}>{j.status}</span></div>
              <div className="text-[#9CA3AF] mt-1">{j.progress_message || ''} {j.progress ? `(${Math.round(j.progress)}%)` : ''}</div>
              <div className="text-[10px] text-[#6B7280] mt-1 font-mono">{j.id.slice(0,8)} • Attempts: {j.attempts}/{j.max_attempts}</div>
              {j.status === 'running' && <button onClick={async () => { await agentsApi.cancelJob(j.id); load(); }} className="mt-2 px-2 py-1 rounded bg-[#EF4444]/10 text-[#EF4444] text-[10px]">Cancel</button>}
            </div>
          ))}
          {jobs.length === 0 && <div className="text-xs text-[#6B7280]">No jobs • Jobs survive restarts (persisted in DB)</div>}
        </div>
      </div>
    </div>
  );
}

export function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [routines, setRoutines] = useState<any[]>([]);

  useEffect(() => { load(); }, []);
  const load = async () => {
    try {
      const data = await integrationsApi.list();
      setIntegrations(data.integrations || []);
      const d = await integrationsApi.devices().catch(() => ({ devices: [] }));
      setDevices(d.devices || []);
      const r = await integrationsApi.routines().catch(() => ({ routines: [] }));
      setRoutines(r.routines || []);
    } catch {}
  };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Integrations</h1>
      <p className="text-sm text-[#9CA3AF]">Real APIs when configured • REQUIRES CONFIGURATION if missing • No fake sync</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {integrations.map((i: any) => (
          <div key={i.id} className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
            <div className="flex justify-between">
              <div>
                <div className="font-medium text-sm">{i.name}</div>
                <div className="text-xs text-[#9CA3AF] mt-1">{i.description}</div>
                <div className="text-[10px] text-[#6B7280] mt-1">Category: {i.category} • Requires: {i.requires.join(', ')}</div>
              </div>
              <span className={`text-[10px] px-2 py-1 rounded-full h-fit ${i.status === 'connected' ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#F59E0B]/10 text-[#F59E0B]'}`}>{i.status}</span>
            </div>
            <div className="flex gap-2 mt-3">
              {i.status !== 'connected' ? (
                <button onClick={async () => { 
                  const config = prompt(`Enter config JSON for ${i.name} (or leave empty to try env vars):`);
                  let cfg = {};
                  if (config) {
                    try { cfg = JSON.parse(config); } catch { alert('Invalid JSON'); return; }
                  }
                  try {
                    await integrationsApi.connect(i.id, cfg);
                    load();
                  } catch (e: any) {
                    alert(e.error || e.message || 'Failed - REQUIRES CONFIGURATION');
                    load();
                  }
                }} className="px-3 py-1.5 rounded-lg bg-[#7C3AED] text-white text-xs">Connect</button>
              ) : (
                <button onClick={async () => { await integrationsApi.disconnect(i.id); load(); }} className="px-3 py-1.5 rounded-lg bg-[#1C1C2A] text-[#9CA3AF] text-xs">Disconnect</button>
              )}
              <span className="text-[10px] text-[#6B7280] py-1.5">{i.envConfigured ? 'Env configured' : 'Env missing • REQUIRES CONFIGURATION'}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
        <h2 className="font-medium text-sm mb-3">Smart Home (Architecture - No Hardware Pretended)</h2>
        <p className="text-xs text-[#9CA3AF] mb-3">Clean interfaces for future integrations • Camera/person recognition requires explicit permission • REQUIRES CONFIGURATION</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium mb-2">Devices ({devices.length})</div>
            {devices.map((d: any) => (
              <div key={d.id} className="p-2 rounded-lg bg-[#0A0A0F] border border-[#2A2A3D] text-xs mb-1 flex justify-between">
                <span>{d.name} ({d.type}) • {d.status} • {d.room || 'no room'}</span>
                <button onClick={async () => { const res = await integrationsApi.controlDevice(d.id, 'toggle', {}); alert(res.message); load(); }} className="text-[#7C3AED]">Control</button>
              </div>
            ))}
            {devices.length === 0 && <div className="text-xs text-[#6B7280]">No devices • Add via API</div>}
          </div>
          <div>
            <div className="text-xs font-medium mb-2">Routines ({routines.length})</div>
            {routines.map((r: any) => (
              <div key={r.id} className="p-2 rounded-lg bg-[#0A0A0F] border border-[#2A2A3D] text-xs mb-1">{r.name} • Trigger: {r.trigger} • {r.isEnabled ? 'Enabled' : 'Disabled'}</div>
            ))}
            {routines.length === 0 && <div className="text-xs text-[#6B7280]">No routines • Modes: Welcome Home, Leaving Home, Sleep, Study, Meeting, Movie, Energy Saver</div>}
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          {['Welcome Home', 'Leaving Home', 'Sleep Mode', 'Study Mode', 'Meeting Mode', 'Movie Mode', 'Energy Saver'].map(mode => (
            <button key={mode} onClick={async () => { const res = await integrationsApi.activateMode(mode.toLowerCase().replace(' ', '-')); alert(res.message); }} className="px-2 py-1 rounded-lg bg-[#1C1C2A] text-[10px]">{mode}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AutomationsPage() {
  const [skills, setSkills] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  useEffect(() => { load(); }, []);
  const load = async () => {
    try { const data = await skillsApi.list(); setSkills(data.skills || []); } catch {}
  };

  const create = async () => {
    if (!name || !desc) return;
    try { await skillsApi.create({ name, description: desc, permissions: [], tools: [] }); setName(''); setDesc(''); load(); } catch (e: any) { alert(e.error); }
  };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Automations & Skills</h1>
      <p className="text-sm text-[#9CA3AF]">Custom skills • Workflows • Agent templates • Sandboxing • Permissions • Enable/disable</p>

      <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D] flex gap-3">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Skill name" className="flex-1 py-2.5 px-4 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] text-sm" />
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" className="flex-1 py-2.5 px-4 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] text-sm" />
        <button onClick={create} className="px-4 py-2.5 rounded-xl bg-[#7C3AED] text-white text-sm">Create Skill</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {skills.map((s: any) => (
          <div key={s.id} className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
            <div className="flex justify-between">
              <div>
                <div className="font-medium text-sm flex items-center gap-2">{s.name} {s.isSystem && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#7C3AED]/20 text-[#A78BFA]">SYSTEM</span>}</div>
                <div className="text-xs text-[#9CA3AF] mt-1">{s.description}</div>
                <div className="flex gap-1 mt-2">{s.permissions?.slice(0,3).map((p: string) => <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-[#1C1C2A] border border-[#2A2A3D]">{p}</span>)}</div>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={async () => { await skillsApi.toggle(s.id, !s.isEnabled); load(); }} className={`px-3 py-1 rounded-lg text-xs ${s.isEnabled ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#2A2A3D] text-[#9CA3AF]'}`}>{s.isEnabled ? 'Enabled' : 'Disabled'}</button>
                {!s.isSystem && <button onClick={async () => { if (confirm('Delete?')) { await skillsApi.delete(s.id); load(); } }} className="px-3 py-1 rounded-lg bg-[#EF4444]/10 text-[#EF4444] text-xs">Delete</button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResearchPage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const data = await researchApi.search(query, 5);
      setResult(data.result);
    } catch (e: any) { alert(e.error); } finally { setLoading(false); }
  };

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Research Engine</h1>
      <p className="text-sm text-[#9CA3AF]">Multi-source • Source comparison • Fact checking • Citations • No fabricated sources</p>

      <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D] flex gap-3">
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Research query (e.g., AI trends 2024)" className="flex-1 py-3 px-4 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] text-sm" onKeyDown={e => e.key === 'Enter' && search()} />
        <button onClick={search} disabled={loading} className="px-6 py-3 rounded-xl bg-[#7C3AED] text-white text-sm disabled:opacity-50">{loading ? 'Researching...' : 'Research'}</button>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
            <div className="font-medium text-sm mb-3">Summary for "{result.query}"</div>
            <div className="text-sm text-[#EDE9FE]/80 whitespace-pre-wrap leading-relaxed">{result.summary}</div>
            <div className="text-[10px] text-[#6B7280] mt-3 font-mono">Timestamp: {result.timestamp} • Sources: {result.sources?.length || 0}</div>
          </div>

          <div className="space-y-2">
            <div className="font-medium text-sm">Sources ({result.sources?.length || 0})</div>
            {result.sources?.map((s: any, i: number) => (
              <div key={i} className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
                <div className="font-medium text-sm">{s.title}</div>
                <div className="text-xs text-[#06B6D4] mt-1 truncate">{s.url}</div>
                <div className="text-xs text-[#9CA3AF] mt-2">{s.snippet}</div>
                <div className="text-[10px] text-[#6B7280] mt-2">Confidence: {s.confidence}</div>
              </div>
            ))}
            {result.sources?.length === 0 && <div className="p-4 rounded-xl bg-[#F59E0B]/5 border border-[#F59E0B]/20 text-sm text-[#F59E0B]">{result.summary}</div>}
          </div>

          {result.contradictions?.length > 0 && (
            <div className="p-4 rounded-xl bg-[#EF4444]/5 border border-[#EF4444]/20">
              <div className="font-medium text-sm text-[#EF4444] mb-2">Contradictions Detected</div>
              {result.contradictions.map((c: any, i: number) => <div key={i} className="text-xs text-[#EDE9FE]/80">{c.sourceA} vs {c.sourceB}: {c.description}</div>)}
            </div>
          )}

          <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
            <div className="font-medium text-sm mb-2">Citations</div>
            {result.citations?.map((c: any, i: number) => <div key={i} className="text-xs text-[#9CA3AF]">[{i+1}] {c.source} - {c.url}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

export function SystemPage() {
  const [health, setHealth] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [suspicious, setSuspicious] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [prefs, setPrefs] = useState<any>({});

  useEffect(() => { load(); }, []);
  const load = async () => {
    try {
      const h = await systemApi.status();
      setHealth(h);
      const l = await systemApi.auditLogs({ limit: 20 });
      setLogs(l.logs || []);
      setSuspicious(l.suspicious || []);
      const p = await systemApi.providers();
      setProviders(p.providers || []);
      const up = await userApi.preferences();
      setPrefs(up.preferences || {});
    } catch {}
  };

  const exportData = async () => {
    try { const data = await systemApi.exportData(); alert('Exported: ' + JSON.stringify(data.data).slice(0, 200)); } catch (e: any) { alert(e.error); }
  };

  const savePrefs = async (newPrefs: any) => {
    const updated = { ...prefs, ...newPrefs };
    setPrefs(updated);
    try { await userApi.updatePreferences(updated); } catch {}
  };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">System & Security</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
          <div className="font-medium text-sm mb-3">Health</div>
          <div className="text-xs space-y-1">
            <div>Status: {health?.health?.status}</div>
            <div>Uptime: {Math.floor((health?.health?.uptime || 0)/60)}m</div>
            <div>DB: {health?.health?.services?.database?.status} ({health?.health?.services?.database?.latencyMs}ms)</div>
            <div>Workers: {health?.health?.services?.backgroundWorkers?.active} active</div>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
          <div className="font-medium text-sm mb-3">AI Providers</div>
          {providers.map((p: any) => (
            <div key={p.provider} className="flex justify-between text-xs py-1"><span className="capitalize">{p.provider}</span><span className={p.isConfigured ? 'text-[#10B981]' : 'text-[#F59E0B]'}>{p.isConfigured ? '✅' : '⚠️ REQUIRES CONFIG'}</span></div>
          ))}
        </div>
      </div>

      <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
        <div className="font-medium text-sm mb-3">Adaptive Personality</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <select value={prefs.tone || 'friendly'} onChange={e => savePrefs({ tone: e.target.value })} className="py-2 px-3 rounded-lg bg-[#0A0A0F] border border-[#2A2A3D] text-xs">
            <option value="friendly">Friendly</option><option value="professional">Professional</option><option value="concise">Concise</option><option value="detailed">Detailed</option><option value="casual">Casual</option>
          </select>
          <select value={prefs.responseLength || 'adaptive'} onChange={e => savePrefs({ responseLength: e.target.value })} className="py-2 px-3 rounded-lg bg-[#0A0A0F] border border-[#2A2A3D] text-xs">
            <option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option><option value="adaptive">Adaptive</option>
          </select>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!prefs.focusMode} onChange={e => savePrefs({ focusMode: e.target.checked })} /> Focus Mode</label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!prefs.quietMode} onChange={e => savePrefs({ quietMode: e.target.checked })} /> Quiet Mode</label>
        </div>
      </div>

      {suspicious.length > 0 && (
        <div className="p-4 rounded-xl bg-[#EF4444]/5 border border-[#EF4444]/20">
          <div className="font-medium text-sm text-[#EF4444] mb-2">Suspicious Activity Detected</div>
          {suspicious.map((s: any, i: number) => <div key={i} className="text-xs text-[#EDE9FE]/80">{s.type}: {s.count} ({s.risk})</div>)}
        </div>
      )}

      <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
        <div className="font-medium text-sm mb-3">Audit Logs ({logs.length})</div>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {logs.map((l: any) => (
            <div key={l.id} className="p-2 rounded-lg bg-[#0A0A0F] border border-[#2A2A3D] text-[11px] font-mono flex justify-between">
              <span>{new Date(l.timestamp).toLocaleTimeString()} • {l.action} • {l.resource} • {l.status}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] ${l.risk_level === 'high' ? 'bg-[#EF4444]/20 text-[#EF4444]' : 'bg-[#2A2A3D] text-[#9CA3AF]'}`}>{l.risk_level}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D] flex gap-3">
        <button onClick={exportData} className="px-4 py-2 rounded-xl bg-[#1C1C2A] border border-[#2A2A3D] text-sm">Export Data</button>
        <button onClick={async () => { if (confirm('Delete ALL data? Type DELETE_ALL_MY_DATA confirmation required')) { try { await systemApi.deleteData(); alert('Deleted'); load(); } catch (e: any) { alert(e.error); } } }} className="px-4 py-2 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-sm">Delete All Data</button>
        <div className="text-xs text-[#6B7280] py-2">Privacy controls • Data export • Deletion • Session revocation • Permission firewall</div>
      </div>
    </div>
  );
}

export function SmartHomePage() {
  return <IntegrationsPage />;
}
