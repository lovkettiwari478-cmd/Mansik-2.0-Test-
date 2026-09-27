import React, { useEffect, useState } from 'react';
import { memoryApi } from '../lib/api';

export function MemoryPage() {
  const [memories, setMemories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [newMemory, setNewMemory] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await memoryApi.list(filter ? { type: filter } : {});
      setMemories(data.memories || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleSearch = async () => {
    if (!search.trim()) { setSearchResults([]); return; }
    try {
      const data = await memoryApi.search(search);
      setSearchResults(data.results || []);
    } catch (e) { console.error(e); }
  };

  const save = async () => {
    if (!newMemory.trim()) return;
    try {
      await memoryApi.create(newMemory, 'approved');
      setNewMemory('');
      load();
    } catch (e: any) { alert(e.error || 'Failed'); }
  };

  const del = async (id: string) => {
    if (!confirm('Delete memory?')) return;
    try { await memoryApi.delete(id); load(); } catch (e: any) { alert(e.error); }
  };

  const forget = async () => {
    const q = prompt('What to forget? Enter query:');
    if (!q) return;
    try {
      const res = await memoryApi.forget(q);
      alert(`Forgot ${res.deletedCount} memories`);
      load();
    } catch (e: any) { alert(e.error); }
  };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Memory</h1>
          <p className="text-sm text-[#9CA3AF] mt-1">Long-term, approved, provenance-tracked • User-scoped isolation • Forget behavior</p>
        </div>
        <button onClick={forget} className="px-4 py-2 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-sm">Forget</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
          <div className="text-sm font-medium mb-3">Save Memory (Approved)</div>
          <textarea value={newMemory} onChange={e => setNewMemory(e.target.value)} placeholder="e.g., My name is Alex, I prefer concise responses, My birthday is Jan 1" className="w-full h-20 p-3 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] focus:border-[#7C3AED] focus:outline-none text-sm resize-none" />
          <button onClick={save} className="mt-3 w-full py-2.5 rounded-xl bg-[#7C3AED] text-white text-sm font-medium">Save to Approved Memory</button>
          <div className="text-[11px] text-[#6B7280] mt-2">Duplicate detection • Semantic embedding • Provenance tracked</div>
        </div>

        <div className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
          <div className="text-sm font-medium mb-3">Semantic Search</div>
          <div className="flex gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search memories..." className="flex-1 py-2.5 px-4 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] focus:border-[#7C3AED] focus:outline-none text-sm" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
            <button onClick={handleSearch} className="px-4 py-2.5 rounded-xl bg-[#1C1C2A] border border-[#2A2A3D] text-sm">Search</button>
          </div>
          <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
            {searchResults.map(r => (
              <div key={r.id} className="p-2 rounded-lg bg-[#0A0A0F] border border-[#2A2A3D]">
                <div className="text-xs">{r.content}</div>
                <div className="text-[10px] text-[#6B7280] mt-1">Score: {r.score.toFixed(3)} • {r.type}</div>
              </div>
            ))}
            {search && searchResults.length === 0 && <div className="text-xs text-[#6B7280]">No results - try different keywords</div>}
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {['', 'approved', 'long_term', 'short_term', 'preference', 'fact'].map(t => (
          <button key={t} onClick={() => setFilter(t)} className={`px-3 py-1.5 rounded-full text-xs border whitespace-nowrap ${filter === t ? 'bg-[#7C3AED] text-white border-[#7C3AED]' : 'bg-[#14141E] text-[#9CA3AF] border-[#2A2A3D]'}`}>{t || 'All'}</button>
        ))}
      </div>

      {loading ? <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 bg-[#14141E] rounded-xl animate-pulse" />)}</div> : (
        <div className="space-y-2">
          {memories.map(m => (
            <div key={m.id} className="p-4 rounded-xl bg-[#14141E] border border-[#2A2A3D]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{m.content}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1C1C2A] border border-[#2A2A3D]">{m.type}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1C1C2A] border border-[#2A2A3D]">{m.source}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1C1C2A] border border-[#2A2A3D]">Approved: {m.is_approved ? '✅' : '❌'}</span>
                    {m.embedding_provider && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1C1C2A] border border-[#2A2A3D]">{m.embedding_provider}</span>}
                  </div>
                  <div className="text-[10px] text-[#6B7280] mt-2 font-mono">ID: {m.id.slice(0,8)} • Provenance: {m.provenance} • {new Date(m.created_at).toLocaleString()}</div>
                </div>
                <button onClick={() => del(m.id)} className="px-3 py-1 rounded-lg bg-[#EF4444]/10 text-[#EF4444] text-xs">Delete</button>
              </div>
            </div>
          ))}
          {memories.length === 0 && <div className="p-8 text-center text-[#6B7280] text-sm">No memories yet • Save approved memories that will be used for context-aware reasoning</div>}
        </div>
      )}
    </div>
  );
}
