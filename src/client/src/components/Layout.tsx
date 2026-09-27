import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/auth';

const navItems = [
  { path: '/', label: 'Chat', icon: '💬', desc: 'Personal AI' },
  { path: '/dashboard', label: 'Dashboard', icon: '📊', desc: 'Overview' },
  { path: '/tasks', label: 'Tasks', icon: '✅', desc: 'Execution' },
  { path: '/memory', label: 'Memory', icon: '🧠', desc: 'Knowledge' },
  { path: '/knowledge', label: 'Knowledge', icon: '📚', desc: 'Documents' },
  { path: '/calendar', label: 'Calendar', icon: '📅', desc: 'Schedule' },
  { path: '/agents', label: 'Agents', icon: '🤖', desc: 'Autonomous' },
  { path: '/tools', label: 'Tools', icon: '🛠️', desc: 'Integrations' },
  { path: '/automations', label: 'Automations', icon: '⚡', desc: 'Workflows' },
  { path: '/smart-home', label: 'Smart Home', icon: '🏠', desc: 'Devices' },
  { path: '/research', label: 'Research', icon: '🔍', desc: 'Intelligence' },
  { path: '/system', label: 'System', icon: '⚙️', desc: 'Health & Security' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-[#EDE9FE] flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-72 bg-[#14141E] border-r border-[#2A2A3D] 
        transform transition-transform duration-200 ease-in-out lg:transform-none
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col
      `}>
        {/* Logo */}
        <div className="p-6 border-b border-[#2A2A3D]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center font-bold text-lg">M</div>
            <div>
              <h1 className="font-bold text-lg leading-none">MANISK</h1>
              <p className="text-xs text-[#9CA3AF] mt-1">Personal AI OS v2.0</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all
                  ${isActive ? 'bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/20' : 'hover:bg-[#1C1C2A] text-[#9CA3AF] hover:text-[#EDE9FE]'}
                `}
              >
                <span className="text-lg">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{item.label}</div>
                  <div className={`text-[10px] ${isActive ? 'text-white/70' : 'text-[#6B7280]'}`}>{item.desc}</div>
                </div>
                {isActive && <div className="w-2 h-2 rounded-full bg-white/80" />}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-[#2A2A3D]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-[#2A2A3D] flex items-center justify-center text-sm font-medium">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.name}</div>
              <div className="text-xs text-[#9CA3AF] truncate">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-2 px-3 rounded-lg bg-[#1C1C2A] hover:bg-[#2A2A3D] text-sm text-[#9CA3AF] hover:text-[#EDE9FE] transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-[#14141E]/80 backdrop-blur-xl border-b border-[#2A2A3D] px-4 py-3 flex items-center justify-between">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 rounded-lg hover:bg-[#1C1C2A]">
            <div className="w-5 h-5 flex flex-col justify-center gap-1">
              <div className="h-0.5 bg-[#EDE9FE] rounded" />
              <div className="h-0.5 bg-[#EDE9FE] rounded" />
              <div className="h-0.5 bg-[#EDE9FE] rounded" />
            </div>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center font-bold text-sm">M</div>
            <span className="font-bold">MANISK</span>
          </div>
          <div className="w-8" />
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
