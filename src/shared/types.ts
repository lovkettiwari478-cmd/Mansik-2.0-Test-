// MANISK Shared Types - Production-grade type definitions

export type UserRole = 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  preferences?: UserPreferences;
}

export interface UserPreferences {
  tone?: 'professional' | 'friendly' | 'concise' | 'detailed' | 'casual';
  responseLength?: 'short' | 'medium' | 'long' | 'adaptive';
  focusMode?: boolean;
  quietMode?: boolean;
  urgentMode?: boolean;
  notificationIntensity?: 'low' | 'medium' | 'high';
  communicationStyle?: string;
  timezone?: string;
  language?: string;
}

export type IntentType = 
  | 'ANSWER'
  | 'PLAN'
  | 'TOOL_ACTION'
  | 'AUTOMATION'
  | 'RESEARCH'
  | 'MEMORY_OPERATION'
  | 'TASK_MANAGEMENT'
  | 'COMMUNICATION'
  | 'KNOWLEDGE_QUERY'
  | 'SYSTEM_COMMAND';

export interface IntentResult {
  type: IntentType;
  confidence: number;
  entities: Record<string, any>;
  requiresPermission: boolean;
  suggestedTools?: string[];
  uncertainty?: string[];
  contradiction?: string | null;
}

export type TaskStatus = 
  | 'PLANNED'
  | 'APPROVED'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETRYING'
  | 'RECOVERED'
  | 'CANCELLED'
  | 'TIMEOUT';

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: TaskStatus;
  goal: string;
  plan?: TaskPlan;
  dependencies?: string[];
  parentTaskId?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  deadline?: string;
  createdAt: string;
  updatedAt: string;
  executedAt?: string;
  completedAt?: string;
  retryCount: number;
  maxRetries: number;
  timeoutMs: number;
  idempotencyKey?: string;
  result?: any;
  error?: string;
  verificationResult?: VerificationResult;
  auditTrail: TaskAuditEntry[];
}

export interface TaskPlan {
  steps: PlanStep[];
  estimatedDurationMs?: number;
  requiredPermissions: string[];
  requiredTools: string[];
  risks?: string[];
}

export interface PlanStep {
  id: string;
  order: number;
  action: string;
  tool?: string;
  agent?: string;
  params?: Record<string, any>;
  status: TaskStatus;
  dependsOn?: string[];
  verification?: string;
  result?: any;
  error?: string;
}

export interface TaskAuditEntry {
  timestamp: string;
  fromStatus: TaskStatus | 'CREATED';
  toStatus: TaskStatus;
  actor: 'system' | 'user' | 'agent';
  message: string;
  metadata?: Record<string, any>;
}

export interface VerificationResult {
  verified: boolean;
  confidence: number;
  checks: VerificationCheck[];
  timestamp: string;
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  message: string;
  evidence?: any;
}

export type MemoryType = 'short_term' | 'long_term' | 'approved' | 'preference' | 'fact' | 'routine';

export interface Memory {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;
  embedding?: number[];
  provenance: string;
  source: 'conversation' | 'user_input' | 'inferred' | 'imported';
  confidence: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  tags?: string[];
  isApproved: boolean;
  duplicateOf?: string;
  metadata?: Record<string, any>;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  permissions: string[];
  tools: string[];
  status: 'active' | 'inactive' | 'busy' | 'error';
  modelPreference?: string;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  category: 'calendar' | 'communication' | 'knowledge' | 'computer' | 'research' | 'creative' | 'system' | 'smart_home' | 'other';
  requiresConfig: boolean;
  configKeys?: string[];
  isEnabled: boolean;
  isDangerous: boolean;
  inputSchema: any;
  outputSchema?: any;
}

export interface Permission {
  id: string;
  userId: string;
  agentId?: string;
  toolId?: string;
  resource: string;
  action: string;
  granted: boolean;
  grantedAt?: string;
  expiresAt?: string;
  isTemporary: boolean;
  grantedBy: 'user' | 'system' | 'admin';
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  status: 'success' | 'failure' | 'denied';
  timestamp: string;
  ip?: string;
  userAgent?: string;
  requestId: string;
  details?: Record<string, any>;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export interface BackgroundJob {
  id: string;
  userId?: string;
  type: string;
  payload: Record<string, any>;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'retrying';
  priority: number;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: any;
  error?: string;
  progress?: number;
  progressMessage?: string;
}

export interface CalendarEvent {
  id: string;
  userId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  attendees?: string[];
  status: 'confirmed' | 'tentative' | 'cancelled';
  source: 'local' | 'google' | 'outlook' | 'apple';
  externalId?: string;
  recurrence?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  userId: string;
  title: string;
  type: 'pdf' | 'doc' | 'note' | 'text' | 'image' | 'other';
  content?: string;
  filePath?: string;
  mimeType?: string;
  size?: number;
  embedding?: number[];
  tags?: string[];
  source?: string;
  createdAt: string;
  updatedAt: string;
  duplicateOf?: string;
}

export interface Integration {
  id: string;
  userId: string;
  provider: string;
  status: 'connected' | 'disconnected' | 'error' | 'requires_config';
  config?: Record<string, any>;
  lastSyncAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelProviderStatus {
  provider: 'nemotron' | 'openai' | 'anthropic' | 'google' | 'local' | 'tavily' | 'other';
  isConfigured: boolean;
  isAvailable: boolean;
  latencyMs?: number;
  lastChecked: string;
  error?: string;
  usage?: {
    requests: number;
    tokens: number;
    cost: number;
  };
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  timestamp: string;
  services: {
    database: { status: string; latencyMs?: number };
    aiProviders: ModelProviderStatus[];
    backgroundWorkers: { active: number; queued: number; failed: number };
    storage: { status: string; usagePercent?: number };
  };
  uptime: number;
  version: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  intent?: IntentResult;
  toolCalls?: ToolCall[];
  memoriesUsed?: string[];
  tasksCreated?: string[];
  timestamp: string;
  modelUsed?: string;
  verified?: boolean;
  citations?: Citation[];
}

export interface ToolCall {
  id: string;
  tool: string;
  params: Record<string, any>;
  result?: any;
  status: 'pending' | 'approved' | 'denied' | 'executing' | 'completed' | 'failed';
  requiresPermission: boolean;
  permissionGranted?: boolean;
  timestamp: string;
  verification?: VerificationResult;
}

export interface Citation {
  source: string;
  url?: string;
  title?: string;
  snippet?: string;
  confidence: number;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  summary?: string;
}
