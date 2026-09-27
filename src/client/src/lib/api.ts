const API_BASE = '';

function getToken(): string | null {
  return localStorage.getItem('manisk_token');
}

function getCsrfToken(): string | null {
  // Read from cookie
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  if (match) {
    return decodeURIComponent(match[1]);
  }
  // Also check localStorage as fallback
  return localStorage.getItem('csrf_token');
}

function setCsrfToken(token: string) {
  if (token) {
    localStorage.setItem('csrf_token', token);
  }
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const csrfToken = getCsrfToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as any || {})
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers,
    credentials: 'include'
  });
  
  const data = await res.json().catch(() => ({}));
  
  if (!res.ok) {
    throw { status: res.status, ...data };
  }
  
  return data;
}

// Auth
export const authApi = {
  register: async (email: string, password: string, name: string) => {
    const data = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name }) });
    if (data.csrfToken) setCsrfToken(data.csrfToken);
    if (data.token) localStorage.setItem('manisk_token', data.token);
    return data;
  },
  login: async (email: string, password: string) => {
    const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (data.csrfToken) setCsrfToken(data.csrfToken);
    if (data.token) localStorage.setItem('manisk_token', data.token);
    return data;
  },
  logout: async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem('manisk_token');
      localStorage.removeItem('csrf_token');
    }
  },
  me: () => apiFetch('/auth/me'),
  sessions: () => apiFetch('/auth/sessions'),
  revokeSession: (id: string) => apiFetch(`/auth/sessions/${id}`, { method: 'DELETE' }),
  csrf: async () => {
    const data = await apiFetch('/auth/csrf');
    if (data.csrfToken) setCsrfToken(data.csrfToken);
    return data;
  }
};

// Chat
export const chatApi = {
  send: (message: string, conversationId?: string) =>
    apiFetch('/chat', { method: 'POST', body: JSON.stringify({ message, conversationId }) }),
  conversations: () => apiFetch('/chat/conversations'),
  messages: (id: string) => apiFetch(`/chat/conversations/${id}/messages`),
  deleteConversation: (id: string) => apiFetch(`/chat/conversations/${id}`, { method: 'DELETE' })
};

// Memory
export const memoryApi = {
  list: (params?: any) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/memories${q ? '?' + q : ''}`);
  },
  search: (query: string) => apiFetch(`/memories/search?q=${encodeURIComponent(query)}`),
  create: (content: string, type?: string, tags?: string[]) =>
    apiFetch('/memories', { method: 'POST', body: JSON.stringify({ content, type, tags }) }),
  get: (id: string) => apiFetch(`/memories/${id}`),
  update: (id: string, content: string) => apiFetch(`/memories/${id}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  delete: (id: string) => apiFetch(`/memories/${id}`, { method: 'DELETE' }),
  forget: (query: string) => apiFetch('/memories/forget', { method: 'POST', body: JSON.stringify({ query }) }),
  approve: (id: string) => apiFetch(`/memories/${id}/approve`, { method: 'POST' })
};

// Tasks
export const tasksApi = {
  list: (params?: any) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/tasks${q ? '?' + q : ''}`);
  },
  create: (goal: string, options?: any) => apiFetch('/tasks', { method: 'POST', body: JSON.stringify({ goal, ...options }) }),
  get: (id: string) => apiFetch(`/tasks/${id}`),
  execute: (id: string) => apiFetch(`/tasks/${id}/execute`, { method: 'POST' }),
  cancel: (id: string) => apiFetch(`/tasks/${id}/cancel`, { method: 'POST' }),
  emergencyStop: () => apiFetch('/tasks/emergency-stop', { method: 'POST' }),
  clearEmergencyStop: () => apiFetch('/tasks/clear-emergency-stop', { method: 'POST' }),
  emergencyStatus: () => apiFetch('/tasks/status/emergency')
};

// System
export const systemApi = {
  health: () => apiFetch('/system/health'),
  status: () => apiFetch('/system/status'),
  providers: () => apiFetch('/system/providers'),
  auditLogs: (params?: any) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/system/audit-logs${q ? '?' + q : ''}`);
  },
  metrics: () => apiFetch('/system/metrics'),
  predictions: () => apiFetch('/system/predictions'),
  exportData: () => apiFetch('/system/export-data', { method: 'POST' }),
  deleteData: () => apiFetch('/system/delete-data', { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE_ALL_MY_DATA' }) })
};

// Calendar
export const calendarApi = {
  list: (params?: any) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/calendar${q ? '?' + q : ''}`);
  },
  create: (event: any) => apiFetch('/calendar', { method: 'POST', body: JSON.stringify(event) }),
  get: (id: string) => apiFetch(`/calendar/${id}`),
  update: (id: string, data: any) => apiFetch(`/calendar/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/calendar/${id}`, { method: 'DELETE' }),
  dailyBriefing: () => apiFetch('/calendar/briefing/daily')
};

// Knowledge
export const knowledgeApi = {
  list: (params?: any) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch(`/knowledge${q ? '?' + q : ''}`);
  },
  search: (q: string) => apiFetch(`/knowledge/search?q=${encodeURIComponent(q)}`),
  create: (title: string, content: string, type?: string) => apiFetch('/knowledge', { method: 'POST', body: JSON.stringify({ title, content, type }) }),
  get: (id: string) => apiFetch(`/knowledge/${id}`),
  delete: (id: string) => apiFetch(`/knowledge/${id}`, { method: 'DELETE' })
};

// Tools
export const toolsApi = {
  list: (category?: string) => apiFetch(`/tools${category ? '?category=' + category : ''}`),
  get: (id: string) => apiFetch(`/tools/${id}`),
  execute: (id: string, params: any) => apiFetch(`/tools/${id}/execute`, { method: 'POST', body: JSON.stringify(params) }),
  permissions: () => apiFetch('/tools/permissions/list'),
  grantPermission: (resource: string, action: string, options?: any) => apiFetch('/tools/permissions/grant', { method: 'POST', body: JSON.stringify({ resource, action, ...options }) }),
  revokePermission: (id: string) => apiFetch(`/tools/permissions/${id}`, { method: 'DELETE' })
};

// Agents
export const agentsApi = {
  list: () => apiFetch('/agents'),
  get: (id: string) => apiFetch(`/agents/${id}`),
  execute: (id: string, task: string, params?: any) => apiFetch(`/agents/${id}/execute`, { method: 'POST', body: JSON.stringify({ task, params }) }),
  jobs: (status?: string) => apiFetch(`/agents/jobs/list${status ? '?status=' + status : ''}`),
  job: (id: string) => apiFetch(`/agents/jobs/${id}`),
  cancelJob: (id: string) => apiFetch(`/agents/jobs/${id}/cancel`, { method: 'POST' }),
  emergencyStop: () => apiFetch('/agents/emergency-stop', { method: 'POST' })
};

// Integrations
export const integrationsApi = {
  list: () => apiFetch('/integrations'),
  connect: (provider: string, config?: any) => apiFetch(`/integrations/${provider}/connect`, { method: 'POST', body: JSON.stringify({ config }) }),
  disconnect: (provider: string) => apiFetch(`/integrations/${provider}/disconnect`, { method: 'POST' }),
  remove: (provider: string) => apiFetch(`/integrations/${provider}`, { method: 'DELETE' }),
  // Smart home
  devices: () => apiFetch('/integrations/smart-home/devices'),
  addDevice: (device: any) => apiFetch('/integrations/smart-home/devices', { method: 'POST', body: JSON.stringify(device) }),
  controlDevice: (id: string, action: string, params?: any) => apiFetch(`/integrations/smart-home/devices/${id}/control`, { method: 'POST', body: JSON.stringify({ action, params }) }),
  removeDevice: (id: string) => apiFetch(`/integrations/smart-home/devices/${id}`, { method: 'DELETE' }),
  routines: () => apiFetch('/integrations/smart-home/routines'),
  createRoutine: (routine: any) => apiFetch('/integrations/smart-home/routines', { method: 'POST', body: JSON.stringify(routine) }),
  deleteRoutine: (id: string) => apiFetch(`/integrations/smart-home/routines/${id}`, { method: 'DELETE' }),
  activateMode: (mode: string) => apiFetch(`/integrations/smart-home/modes/${mode}`, { method: 'POST' })
};

// Skills
export const skillsApi = {
  list: () => apiFetch('/skills'),
  create: (skill: any) => apiFetch('/skills', { method: 'POST', body: JSON.stringify(skill) }),
  update: (id: string, data: any) => apiFetch(`/skills/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/skills/${id}`, { method: 'DELETE' }),
  toggle: (id: string, enabled: boolean) => apiFetch(`/skills/${id}/toggle`, { method: 'POST', body: JSON.stringify({ enabled }) })
};

// Research
export const researchApi = {
  search: (query: string, maxSources?: number) => apiFetch('/research', { method: 'POST', body: JSON.stringify({ query, maxSources }) })
};

// User
export const userApi = {
  preferences: () => apiFetch('/user/preferences'),
  updatePreferences: (prefs: any) => apiFetch('/user/preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
  notifications: () => apiFetch('/notifications')
};
