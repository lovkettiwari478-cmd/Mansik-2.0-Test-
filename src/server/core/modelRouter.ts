import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

export interface ModelRequest {
  prompt: string;
  systemPrompt?: string;
  context?: string;
  maxTokens?: number;
  temperature?: number;
  userId: string;
  requestId: string;
  intentType?: string;
  conversationalSubIntent?: string;
}

export interface ModelResponse {
  content: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  cost?: number;
}

export interface ProviderStatus {
  provider: 'nemotron' | 'openai' | 'anthropic' | 'google' | 'local';
  isConfigured: boolean;
  isAvailable: boolean;
  latencyMs?: number;
  lastChecked: string;
  error?: string;
}

type ProviderName = 'nemotron' | 'openai' | 'anthropic' | 'google' | 'local';

// Clean provider abstraction: Nemotron first-class, no hard-coded keys, graceful fallback
export class ModelRouter {
  private static providers: Array<{ name: ProviderName; priority: number; check: () => boolean }> = [
    { name: 'nemotron', priority: 1, check: () => !!config.nemotronApiKey },
    { name: 'openai', priority: 2, check: () => !!config.openaiApiKey },
    { name: 'anthropic', priority: 3, check: () => !!config.anthropicApiKey },
    { name: 'google', priority: 4, check: () => !!config.googleApiKey },
    { name: 'local', priority: 10, check: () => true }
  ];

  static getProviderStatus(): ProviderStatus[] {
    return this.providers.map(p => ({
      provider: p.name,
      isConfigured: p.check(),
      isAvailable: p.name === 'local' ? true : p.check(),
      lastChecked: new Date().toISOString(),
      error: !p.check() && p.name !== 'local' ? 'REQUIRES CONFIGURATION' : undefined
    }));
  }

  // Main routing: User → Context → Intent → Router → Nemotron → validation → response
  static async route(request: ModelRequest): Promise<ModelResponse> {
    // Handle simple conversational intents directly with natural responses (no external call needed)
    const conversational = this.handleConversational(request);
    if (conversational) {
      return conversational;
    }

    // Try providers in priority order
    const sorted = [...this.providers].sort((a, b) => a.priority - b.priority);
    
    for (const provider of sorted) {
      if (!provider.check() && provider.name !== 'local') continue;
      
      try {
        let response: ModelResponse | null = null;
        
        switch (provider.name) {
          case 'nemotron':
            response = await this.callNemotron(request);
            break;
          case 'openai':
            response = await this.callOpenAI(request);
            break;
          case 'anthropic':
            response = await this.callAnthropic(request);
            break;
          case 'google':
            response = await this.callGoogle(request);
            break;
          case 'local':
            response = await this.callLocal(request);
            break;
        }
        
        if (response && this.validateResponse(response)) {
          // Log usage server-side only, never expose to user
          this.logUsage(request.userId, response, request.requestId);
          console.log(`[ModelRouter] ${provider.name} succeeded in ${response.latencyMs}ms for request ${request.requestId}`);
          return response;
        }
      } catch (error: any) {
        // Log server-side only, don't expose config or stack to user
        console.warn(`[ModelRouter] Provider ${provider.name} failed:`, error.message);
        // Continue to next provider - graceful fallback without exposing config
        continue;
      }
    }
    
    // If all providers fail, return a safe local response without leaking internal details
    console.error(`[ModelRouter] All providers failed for request ${request.requestId}`);
    return this.callLocal(request);
  }

  // Natural conversational handling - no external provider needed, no leaks
  private static handleConversational(request: ModelRequest): ModelResponse | null {
    const subIntent = request.conversationalSubIntent;
    const lower = request.prompt.toLowerCase().trim();
    
    // Only handle simple conversational if explicitly identified
    if (!subIntent) return null;
    
    let content = '';
    const start = Date.now();
    
    switch (subIntent) {
      case 'greeting':
        content = this.getRandomGreeting();
        break;
      case 'farewell':
        content = this.getRandomFarewell();
        break;
      case 'thanks':
        content = this.getRandomThanks();
        break;
      case 'how_are_you':
        content = "I'm doing great, thanks for asking! 😊 Ready to help you with whatever you need. What can I do for you today?";
        break;
      case 'identity':
        content = "I'm MANISK — your Personal AI Operating System. I help you manage tasks, remember important things, handle research, and automate your workflows. Think of me as your intelligent assistant that's always here to help you get things done.";
        break;
      case 'help':
        content = "I can help you with:\n\n• Managing tasks and reminders\n• Remembering important information\n• Researching topics and finding information\n• Organizing your calendar and schedule\n• Answering questions and brainstorming ideas\n• Automating routine workflows\n\nJust tell me what you'd like to do!";
        break;
      default:
        return null;
    }
    
    // Simple validation - ensure we don't return empty
    if (!content) return null;
    
    return {
      content,
      provider: 'local',
      model: 'manisk-conversational',
      inputTokens: Math.ceil(request.prompt.length / 4),
      outputTokens: Math.ceil(content.length / 4),
      latencyMs: Date.now() - start,
      cost: 0
    };
  }

  private static getRandomGreeting(): string {
    const greetings = [
      "Hey! 👋 How can I help you today?",
      "Hello! What can I do for you?",
      "Hi there! How can I assist you today?",
      "Hey! Good to see you — what do you need help with?",
      "Hello! Ready to help. What would you like to do?"
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  private static getRandomFarewell(): string {
    const farewells = [
      "Goodbye! Have a great day! 👋",
      "See you later! Let me know if you need anything.",
      "Bye! Take care!",
      "Catch you later! I'm here whenever you need help."
    ];
    return farewells[Math.floor(Math.random() * farewells.length)];
  }

  private static getRandomThanks(): string {
    const thanks = [
      "You're welcome! Happy to help. 😊",
      "Anytime! Let me know if you need anything else.",
      "Glad I could help!",
      "You're welcome! What else can I do for you?"
    ];
    return thanks[Math.floor(Math.random() * thanks.length)];
  }

  // Nemotron - first-class provider, OpenAI-compatible via NVIDIA NIM
  private static async callNemotron(request: ModelRequest): Promise<ModelResponse> {
    const start = Date.now();
    
    if (!config.nemotronApiKey) {
      throw new Error('Nemotron not configured');
    }

    const response = await fetch(config.nemotronApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.nemotronApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.nemotronModel,
        messages: [
          ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
          ...(request.context ? [{ role: 'system', content: `Context: ${request.context}` }] : []),
          { role: 'user', content: request.prompt }
        ],
        max_tokens: request.maxTokens || 1000,
        temperature: request.temperature || 0.7,
        stream: false
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      // Don't leak API key or full error to user - log server-side, throw generic
      console.warn(`[Nemotron] API error ${response.status}: ${errText.slice(0, 500)}`);
      throw new Error(`Nemotron provider error: ${response.status}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';
    
    if (!content) {
      throw new Error('Nemotron returned empty response');
    }
    
    return {
      content: content.trim(),
      provider: 'nemotron',
      model: config.nemotronModel,
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      latencyMs: Date.now() - start,
      cost: 0 // Cost calculation can be added based on NVIDIA pricing
    };
  }

  private static async callOpenAI(request: ModelRequest): Promise<ModelResponse> {
    const start = Date.now();
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          ...(request.systemPrompt ? [{ role: 'system', content: request.systemPrompt }] : []),
          ...(request.context ? [{ role: 'system', content: `Context: ${request.context}` }] : []),
          { role: 'user', content: request.prompt }
        ],
        max_tokens: request.maxTokens || 1000,
        temperature: request.temperature || 0.7
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[OpenAI] Error: ${err.slice(0, 300)}`);
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content || '';
    
    if (!content) throw new Error('OpenAI returned empty');
    
    return {
      content: content.trim(),
      provider: 'openai',
      model: 'gpt-4o-mini',
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      latencyMs: Date.now() - start,
      cost: (data.usage?.prompt_tokens * 0.00000015 + data.usage?.completion_tokens * 0.0000006) || 0
    };
  }

  private static async callAnthropic(request: ModelRequest): Promise<ModelResponse> {
    const start = Date.now();
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.anthropicApiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: request.maxTokens || 1000,
        system: request.systemPrompt || '',
        messages: [
          ...(request.context ? [{ role: 'user', content: `Context: ${request.context}` }] : []),
          { role: 'user', content: request.prompt }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[Anthropic] Error: ${err.slice(0, 300)}`);
      throw new Error(`Anthropic error: ${response.status}`);
    }

    const data = await response.json() as any;
    const content = data.content?.[0]?.text || '';
    
    if (!content) throw new Error('Anthropic returned empty');
    
    return {
      content: content.trim(),
      provider: 'anthropic',
      model: 'claude-3-haiku',
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      latencyMs: Date.now() - start
    };
  }

  private static async callGoogle(request: ModelRequest): Promise<ModelResponse> {
    const start = Date.now();
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.googleApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `${request.systemPrompt || ''}\n\n${request.context ? `Context: ${request.context}\n\n` : ''}${request.prompt}` }]
        }],
        generationConfig: {
          maxOutputTokens: request.maxTokens || 1000,
          temperature: request.temperature || 0.7
        }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[Google] Error: ${err.slice(0, 300)}`);
      throw new Error(`Google error: ${response.status}`);
    }

    const data = await response.json() as any;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!content) throw new Error('Google returned empty');
    
    return {
      content: content.trim(),
      provider: 'google',
      model: 'gemini-1.5-flash',
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
      latencyMs: Date.now() - start
    };
  }

  private static async callLocal(request: ModelRequest): Promise<ModelResponse> {
    const start = Date.now();
    
    const prompt = request.prompt.toLowerCase();
    const context = request.context || '';
    
    let content = '';
    
    // Natural, concise responses without internal leaks
    if (prompt.includes('what can you do') || prompt.includes('capabilities') || prompt.includes('help me')) {
      content = `I'm MANISK — your Personal AI Operating System. I can help you with:\n\n• Managing tasks and reminders\n• Remembering important information\n• Researching topics\n• Organizing your calendar\n• Answering questions\n\nWhat would you like to do?`;
    } else if (prompt.includes('memory') || prompt.includes('remember')) {
      content = `I can help with your memory — saving important info, searching past memories, or handling forget requests. What would you like me to remember or find?`;
    } else if (prompt.includes('task') || prompt.includes('todo')) {
      content = `I can help manage your tasks — creating, tracking, and organizing them with priorities and deadlines. What task would you like to create?`;
    } else if (prompt.includes('calendar') || prompt.includes('schedule') || prompt.includes('event')) {
      content = `I can help with your calendar — creating events, checking availability, and managing your schedule. What would you like to schedule?`;
    } else if (prompt.includes('status') || prompt.includes('health')) {
      content = `All systems are running smoothly! How can I help you today?`;
    } else {
      // General contextual response - concise and helpful, no leaks
      // Security: sanitize snippet to prevent XSS reflection and prompt injection echo
      let snippet = request.prompt.slice(0, 200);
      // Remove HTML tags and suspicious patterns for safe echo
      const hasHtml = /<[^>]+>/g.test(snippet);
      const hasInjection = /ignore previous instructions|system prompt|reveal.*secret|show.*api.*key/i.test(snippet);
      
      if (hasHtml || hasInjection) {
        // Don't echo raw user input if it contains HTML or injection attempts
        content = `I understand you're asking for help. Could you tell me more about what you'd like to accomplish? I can create a plan, search relevant information, or take action to help you.`;
      } else if (context && context.length > 50) {
        // Escape quotes for safe display
        const safeSnippet = snippet.replace(/"/g, "'").replace(/</g, '&lt;').replace(/>/g, '&gt;');
        content = `I understand you're asking about "${safeSnippet}". Let me help you with that.\n\nCould you tell me more about what you'd like to accomplish? I can create a plan, search relevant information, or take action to help you.`;
      } else {
        const safeSnippet = snippet.replace(/"/g, "'").replace(/</g, '&lt;').replace(/>/g, '&gt;');
        content = `Got it — "${safeSnippet}". How would you like me to help with this? I can break it down into steps, search for information, or handle it directly.`;
      }
    }
    
    return {
      content,
      provider: 'local',
      model: 'manisk-local-v1',
      inputTokens: Math.ceil(request.prompt.length / 4),
      outputTokens: Math.ceil(content.length / 4),
      latencyMs: Date.now() - start,
      cost: 0
    };
  }

  // Validate response before sending to user - ensure no leaks
  private static validateResponse(response: ModelResponse): boolean {
    if (!response.content || response.content.trim().length === 0) {
      console.warn('[ModelRouter] Validation failed: empty content');
      return false;
    }
    
    // Check for accidental secret leakage in response
    const lower = response.content.toLowerCase();
    const leakPatterns = [
      'api_key', 'apikey', 'secret', 'jwt_secret', 'encryption_key',
      'response generated by local intelligence',
      'configure openai',
      'configure anthropic',
      'low confidence intent detection',
      'requires configuration'
    ];
    
    for (const pattern of leakPatterns) {
      if (lower.includes(pattern)) {
        console.warn(`[ModelRouter] Validation failed: potential leak detected - ${pattern}`);
        // For local provider leaks, we already fixed, but for external providers, sanitize
        // Don't fail validation for external, just log - but ensure our local never leaks
        if (response.provider === 'local') {
          return false;
        }
      }
    }
    
    return true;
  }

  private static logUsage(userId: string, response: ModelResponse, requestId: string) {
    try {
      const db = getDb();
      db.prepare(`
        INSERT INTO model_usage (id, user_id, provider, model, input_tokens, output_tokens, cost, latency_ms, request_id, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        uuidv4(),
        userId,
        response.provider,
        response.model,
        response.inputTokens,
        response.outputTokens,
        response.cost || 0,
        response.latencyMs,
        requestId
      );
    } catch (e) {
      console.warn('[ModelRouter] Failed to log model usage:', e);
    }
  }
}
