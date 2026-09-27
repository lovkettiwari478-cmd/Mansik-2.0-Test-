import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../stores/auth';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0A0A0F]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center font-bold text-2xl mx-auto mb-4">M</div>
          <h1 className="text-2xl font-bold">MANISK OS</h1>
          <p className="text-sm text-[#9CA3AF] mt-2">Personal AI Operating System • Secure • Verified • Private</p>
        </div>

        <form onSubmit={handle} className="p-6 rounded-2xl bg-[#14141E] border border-[#2A2A3D] space-y-4">
          <h2 className="font-semibold">Sign in</h2>
          
          {error && <div className="p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 text-sm text-[#EF4444]">{error}</div>}

          <div>
            <label className="text-xs text-[#9CA3AF] mb-1.5 block">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full py-3 px-4 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] focus:border-[#7C3AED] focus:outline-none text-sm" placeholder="you@example.com" />
          </div>

          <div>
            <label className="text-xs text-[#9CA3AF] mb-1.5 block">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full py-3 px-4 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] focus:border-[#7C3AED] focus:outline-none text-sm" placeholder="••••••••" />
          </div>

          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white font-medium text-sm transition-colors">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          <div className="text-center text-xs text-[#9CA3AF]">
            No account? <Link to="/register" className="text-[#A78BFA] hover:text-white">Create one</Link>
          </div>

          <div className="pt-4 border-t border-[#2A2A3D] text-[11px] text-[#6B7280] leading-relaxed">
            <div className="font-medium text-[#9CA3AF] mb-1">Security Features:</div>
            • Encrypted passwords (bcrypt 12 rounds)<br/>
            • Secure sessions (JWT + DB validation)<br/>
            • Rate limiting • Audit logs • Permission firewall<br/>
            • No secrets in frontend • Session revocation
          </div>
        </form>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(email, password, name);
      navigate('/');
    } catch (err: any) {
      setError(err.error || err.details?.[0]?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0A0A0F]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#06B6D4] flex items-center justify-center font-bold text-2xl mx-auto mb-4">M</div>
          <h1 className="text-2xl font-bold">MANISK OS</h1>
          <p className="text-sm text-[#9CA3AF] mt-2">Create your Personal AI OS account</p>
        </div>

        <form onSubmit={handle} className="p-6 rounded-2xl bg-[#14141E] border border-[#2A2A3D] space-y-4">
          <h2 className="font-semibold">Create account</h2>
          
          {error && <div className="p-3 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 text-sm text-[#EF4444]">{error}</div>}

          <div>
            <label className="text-xs text-[#9CA3AF] mb-1.5 block">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} required className="w-full py-3 px-4 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] focus:border-[#7C3AED] focus:outline-none text-sm" placeholder="Your name" />
          </div>

          <div>
            <label className="text-xs text-[#9CA3AF] mb-1.5 block">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full py-3 px-4 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] focus:border-[#7C3AED] focus:outline-none text-sm" placeholder="you@example.com" />
          </div>

          <div>
            <label className="text-xs text-[#9CA3AF] mb-1.5 block">Password (min 8 chars, uppercase, lowercase, number)</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} className="w-full py-3 px-4 rounded-xl bg-[#0A0A0F] border border-[#2A2A3D] focus:border-[#7C3AED] focus:outline-none text-sm" placeholder="••••••••" />
          </div>

          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white font-medium text-sm">
            {loading ? 'Creating...' : 'Create account'}
          </button>

          <div className="text-center text-xs text-[#9CA3AF]">
            Already have account? <Link to="/login" className="text-[#A78BFA]">Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
