import { ToolDefinition } from '../../shared/types.js';

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    id: 'calendar',
    name: 'Calendar Manager',
    description: 'Create, read, update calendar events, check conflicts',
    permissions: ['calendar:read', 'calendar:write'],
    category: 'calendar',
    requiresConfig: false,
    isEnabled: true,
    isDangerous: false,
    inputSchema: { type: 'object', properties: { action: { type: 'string' }, title: { type: 'string' }, startTime: { type: 'string' }, endTime: { type: 'string' } } }
  },
  {
    id: 'memory_save',
    name: 'Memory Save',
    description: 'Save information to long-term memory',
    permissions: ['memory:write'],
    category: 'other',
    requiresConfig: false,
    isEnabled: true,
    isDangerous: false,
    inputSchema: { type: 'object', properties: { content: { type: 'string' } } }
  },
  {
    id: 'memory_search',
    name: 'Memory Search',
    description: 'Search user memories semantically',
    permissions: ['memory:read'],
    category: 'other',
    requiresConfig: false,
    isEnabled: true,
    isDangerous: false,
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
  },
  {
    id: 'task_manager',
    name: 'Task Manager',
    description: 'Create and manage tasks with verification',
    permissions: ['task:write', 'task:read'],
    category: 'other',
    requiresConfig: false,
    isEnabled: true,
    isDangerous: false,
    inputSchema: { type: 'object', properties: { goal: { type: 'string' } } }
  },
  {
    id: 'web_search',
    name: 'Web Search',
    description: 'Search the web with source verification (Tavily/DuckDuckGo)',
    permissions: ['research:web_search'],
    category: 'research',
    requiresConfig: true,
    configKeys: ['TAVILY_API_KEY'],
    isEnabled: true,
    isDangerous: false,
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
  },
  {
    id: 'knowledge_search',
    name: 'Knowledge Search',
    description: 'Search personal knowledge base',
    permissions: ['knowledge:read'],
    category: 'knowledge',
    requiresConfig: false,
    isEnabled: true,
    isDangerous: false,
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
  },
  {
    id: 'email',
    name: 'Email',
    description: 'Email operations - requires SMTP configuration',
    permissions: ['communication:read', 'communication:send_email'],
    category: 'communication',
    requiresConfig: true,
    configKeys: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
    isEnabled: true,
    isDangerous: true,
    inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } } }
  },
  {
    id: 'file_search',
    name: 'File Search',
    description: 'Search and organize files',
    permissions: ['computer:read'],
    category: 'computer',
    requiresConfig: false,
    isEnabled: true,
    isDangerous: false,
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
  },
  {
    id: 'code_assistant',
    name: 'Code Assistant',
    description: 'Coding assistance, project analysis',
    permissions: ['computer:read', 'computer:write'],
    category: 'computer',
    requiresConfig: false,
    isEnabled: true,
    isDangerous: false,
    inputSchema: { type: 'object', properties: { task: { type: 'string' } } }
  },
  {
    id: 'image_generation',
    name: 'Image Generation',
    description: 'Generate and edit images - requires OpenAI or other provider',
    permissions: ['creative:generate'],
    category: 'creative',
    requiresConfig: true,
    configKeys: ['OPENAI_API_KEY'],
    isEnabled: true,
    isDangerous: false,
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } }
  },
  {
    id: 'smart_home',
    name: 'Smart Home Control',
    description: 'Control smart home devices - requires hardware integration',
    permissions: ['smart_home:control'],
    category: 'smart_home',
    requiresConfig: true,
    configKeys: ['SMART_HOME_PROVIDER'],
    isEnabled: true,
    isDangerous: true,
    inputSchema: { type: 'object', properties: { deviceId: { type: 'string' }, action: { type: 'string' } } }
  },
  {
    id: 'automation_builder',
    name: 'Automation Builder',
    description: 'Create automations and workflows',
    permissions: ['automation:write'],
    category: 'other',
    requiresConfig: false,
    isEnabled: true,
    isDangerous: false,
    inputSchema: { type: 'object', properties: { trigger: { type: 'string' }, actions: { type: 'array' } } }
  }
];

export function getTool(toolId: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find(t => t.id === toolId);
}

export function listTools(category?: string): ToolDefinition[] {
  if (category) {
    return TOOL_REGISTRY.filter(t => t.category === category);
  }
  return TOOL_REGISTRY;
}

export function checkToolConfig(toolId: string, env: Record<string, string>): { isConfigured: boolean; missingKeys: string[] } {
  const tool = getTool(toolId);
  if (!tool) return { isConfigured: false, missingKeys: [] };
  
  if (!tool.requiresConfig) {
    return { isConfigured: true, missingKeys: [] };
  }
  
  const missing = (tool.configKeys || []).filter(k => !env[k]);
  return { isConfigured: missing.length === 0, missingKeys: missing };
}
