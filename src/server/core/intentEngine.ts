import { IntentResult, IntentType } from '../../shared/types.js';

// Production Intent Engine - real NLP logic with reliable conversational layer
export class IntentEngine {
  // Conversational patterns - handled with high confidence before expensive planning
  private static readonly CONVERSATIONAL_PATTERNS: Array<{ type: IntentType; patterns: RegExp[]; confidence: number }> = [
    {
      type: 'ANSWER',
      confidence: 0.95,
      patterns: [
        /^(hello|hi|hey|howdy|greetings|good morning|good afternoon|good evening|good day)[\s!.,]*$/i,
        /^(hello|hi|hey)\s+(there|manisk|assistant)[\s!.,]*$/i,
        /^(hi|hello|hey)\s*👋*$/i,
        /^(good\s+(morning|afternoon|evening|night))[\s!.,]*$/i,
      ]
    },
    {
      type: 'ANSWER',
      confidence: 0.95,
      patterns: [
        /^(bye|goodbye|see you|farewell|bye bye|take care|good night|see ya|catch you later)[\s!.,]*$/i,
        /^(bye|goodbye)[\s!.,]*$/i,
      ]
    },
    {
      type: 'ANSWER',
      confidence: 0.95,
      patterns: [
        /^(thanks|thank you|thx|thanks a lot|thank you so much|appreciated|many thanks)[\s!.,]*$/i,
        /^(thanks|thank you)[\s!.,]*$/i,
      ]
    },
    {
      type: 'ANSWER',
      confidence: 0.92,
      patterns: [
        /^(who are you|what are you|what is your name|who is manisk|what is manisk|tell me about yourself)[\s?.!]*$/i,
        /^(who are you\??)$/i,
      ]
    },
    {
      type: 'ANSWER',
      confidence: 0.90,
      patterns: [
        /^(help|what can you do|capabilities|how can you help|assist me|what do you do)[\s?.!]*$/i,
        /^(help me|need help)[\s?.!]*$/i,
      ]
    },
    {
      type: 'ANSWER',
      confidence: 0.88,
      patterns: [
        /^(how are you|how are you doing|how's it going|how are things)[\s?.!]*$/i,
      ]
    }
  ];

  private static readonly KEYWORDS: Record<IntentType, string[]> = {
    ANSWER: ['what', 'who', 'when', 'where', 'why', 'how', 'explain', 'tell me', 'define'],
    PLAN: ['plan', 'organize', 'schedule', 'create plan', 'roadmap', 'steps', 'break down'],
    TOOL_ACTION: ['send', 'create', 'delete', 'update', 'search', 'find', 'book', 'reserve', 'call', 'email'],
    AUTOMATION: ['automate', 'every', 'daily', 'weekly', 'reminder', 'recurring', 'workflow', 'routine'],
    RESEARCH: ['research', 'investigate', 'compare', 'analyze', 'find out', 'look up', 'sources', 'report'],
    MEMORY_OPERATION: ['remember', 'forget', 'save', 'my name is', 'i like', 'i prefer', 'don\'t remember', 'memorize'],
    TASK_MANAGEMENT: ['task', 'todo', 'deadline', 'priority', 'complete', 'finish', 'pending'],
    COMMUNICATION: ['email', 'message', 'reply', 'draft', 'summarize inbox', 'important'],
    KNOWLEDGE_QUERY: ['document', 'pdf', 'file', 'note', 'knowledge', 'search docs'],
    SYSTEM_COMMAND: ['stop', 'cancel', 'pause', 'resume', 'status', 'health', 'settings', 'export', 'delete data']
  };

  private static readonly DANGEROUS_PATTERNS = [
    /send.*email/i,
    /delete.*all/i,
    /format.*drive/i,
    /rm -rf/i,
    /drop.*table/i,
    /shutdown/i,
  ];

  static analyze(input: string, conversationHistory: string[] = []): IntentResult {
    const lower = input.toLowerCase().trim();
    const trimmed = input.trim();
    const entities: Record<string, any> = {};
    let uncertainty: string[] = [];
    let contradiction: string | null = null;

    // Extract entities
    const emailMatch = input.match(/[\w.-]+@[\w.-]+\.\w+/g);
    if (emailMatch) entities.emails = emailMatch;

    const dateMatch = input.match(/\b(?:tomorrow|today|next week|next month|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/gi);
    if (dateMatch) entities.dates = dateMatch;

    const urlMatch = input.match(/https?:\/\/[^\s]+/g);
    if (urlMatch) entities.urls = urlMatch;

    // === RELIABLE CONVERSATIONAL LAYER (High confidence, no uncertainty) ===
    // Check conversational patterns FIRST before expensive scoring
    for (const conv of this.CONVERSATIONAL_PATTERNS) {
      for (const pattern of conv.patterns) {
        if (pattern.test(trimmed)) {
          // Log conversational detection for observability (server-side only)
          console.log(`[Intent] Conversational detected: ${trimmed} -> ${conv.type} (${conv.confidence})`);
          
          // Determine sub-intent for better response routing (stored in entities, not exposed to user)
          let subIntent = 'general';
          if (/^(hello|hi|hey|good morning|good afternoon|good evening)/i.test(trimmed)) subIntent = 'greeting';
          else if (/^(bye|goodbye|see you|farewell)/i.test(trimmed)) subIntent = 'farewell';
          else if (/^(thanks|thank you|thx)/i.test(trimmed)) subIntent = 'thanks';
          else if (/^(who are you|what are you)/i.test(trimmed)) subIntent = 'identity';
          else if (/^(help|what can you do)/i.test(trimmed)) subIntent = 'help';
          else if (/^(how are you)/i.test(trimmed)) subIntent = 'how_are_you';
          
          entities.conversationalSubIntent = subIntent;
          entities.originalInput = trimmed;
          
          return {
            type: conv.type,
            confidence: conv.confidence,
            entities,
            requiresPermission: false,
            suggestedTools: [],
            uncertainty: undefined, // No uncertainty for reliable conversational intents
            contradiction: null
          };
        }
      }
    }

    // Check for dangerous patterns
    const isDangerous = this.DANGEROUS_PATTERNS.some(p => p.test(input));
    
    // Check for memory operation - high priority
    if (lower.includes('remember') || lower.includes('forget') || lower.includes('my name is') || 
        lower.includes('i am') && lower.length < 100 || lower.startsWith('save')) {
      if (lower.includes('remember') || lower.includes('forget') || lower.includes('memorize') || 
          lower.match(/\bmy (name|preference|favorite|birthday|job)\b/)) {
        return {
          type: 'MEMORY_OPERATION',
          confidence: 0.85,
          entities,
          requiresPermission: lower.includes('forget'),
          suggestedTools: ['memory_save', 'memory_search'],
          uncertainty: [],
          contradiction
        };
      }
    }

    // Check for contradictions in conversation history
    if (conversationHistory.length > 0) {
      const lastUserMessages = conversationHistory.slice(-3).join(' ').toLowerCase();
      if ((lastUserMessages.includes('i like') && lower.includes('i don\'t like')) ||
          (lastUserMessages.includes('remember') && lower.includes('forget'))) {
        contradiction = 'Potential contradiction with previous statement detected';
        // Only add uncertainty for non-conversational, and it will be logged server-side, not exposed to user
        uncertainty.push('User statement may contradict earlier context');
      }
    }

    // Score each intent
    const scores: Record<IntentType, number> = {
      ANSWER: 0,
      PLAN: 0,
      TOOL_ACTION: 0,
      AUTOMATION: 0,
      RESEARCH: 0,
      MEMORY_OPERATION: 0,
      TASK_MANAGEMENT: 0,
      COMMUNICATION: 0,
      KNOWLEDGE_QUERY: 0,
      SYSTEM_COMMAND: 0
    };

    for (const [intent, keywords] of Object.entries(this.KEYWORDS)) {
      let score = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          score += 1;
          if (new RegExp(`\\b${kw}\\b`, 'i').test(lower)) score += 0.5;
        }
      }
      scores[intent as IntentType] = score;
    }

    // Heuristics
    if (lower.startsWith('what') || lower.startsWith('how') || lower.startsWith('why') || lower.includes('?')) {
      scores.ANSWER += 2;
    }
    if (lower.includes('research') || lower.includes('investigate') || lower.includes('compare') || lower.includes('sources')) {
      scores.RESEARCH += 3;
    }
    if (lower.includes('plan') || lower.includes('steps') || lower.includes('break down')) {
      scores.PLAN += 2;
    }
    if (lower.includes('task') || lower.includes('todo') || lower.includes('deadline')) {
      scores.TASK_MANAGEMENT += 2;
    }
    if (lower.includes('email') || lower.includes('message') || lower.includes('reply') || lower.includes('draft')) {
      scores.COMMUNICATION += 2;
    }
    if (lower.includes('document') || lower.includes('pdf') || lower.includes('file') || lower.includes('knowledge')) {
      scores.KNOWLEDGE_QUERY += 2;
    }
    if (lower.includes('automate') || lower.includes('every day') || lower.includes('reminder') || lower.includes('routine')) {
      scores.AUTOMATION += 2;
    }
    if (lower.includes('send') || lower.includes('create') || lower.includes('book') || lower.includes('search')) {
      scores.TOOL_ACTION += 1.5;
    }
    if (lower.includes('stop all') || lower.includes('emergency') || lower.includes('cancel')) {
      scores.SYSTEM_COMMAND += 3;
    }

    // Find highest score
    let maxIntent: IntentType = 'ANSWER';
    let maxScore = 0;
    for (const [intent, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxIntent = intent as IntentType;
      }
    }

    // Confidence calculation - improved to not mark short conversational as low confidence
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    let confidence: number;
    
    if (totalScore === 0) {
      // No keywords matched, but input is not empty - treat as general question with medium confidence
      // Don't mark as low confidence for normal conversation
      if (trimmed.length >= 2 && trimmed.length <= 100) {
        confidence = 0.7; // General conversational, medium confidence, no uncertainty leak
        maxIntent = 'ANSWER';
      } else {
        confidence = 0.5;
        maxIntent = 'ANSWER';
        // Only add uncertainty for very ambiguous cases, and it will be logged server-side only
        if (trimmed.length < 2) {
          uncertainty.push('Very short input');
        }
      }
    } else {
      confidence = Math.min(0.95, maxScore / Math.max(1, totalScore) + 0.3);
      if (confidence < 0.6) {
        // Low confidence - log server-side but don't expose to user unless truly ambiguous
        // For general questions, keep confidence at least 0.6 to avoid user-facing warnings
        if (maxIntent === 'ANSWER' && trimmed.length > 10) {
          confidence = 0.65; // Boost general questions to avoid low-confidence warnings
        } else if (confidence < 0.6) {
          uncertainty.push('Low confidence intent detection - may need clarification');
        }
      }
    }

    if (maxScore === 0 && trimmed.length > 0) {
      maxIntent = 'ANSWER';
    }

    // Determine required permission and tools
    const requiresPermission = isDangerous || ['TOOL_ACTION', 'AUTOMATION', 'SYSTEM_COMMAND'].includes(maxIntent);
    
    let suggestedTools: string[] = [];
    switch (maxIntent) {
      case 'TOOL_ACTION':
        suggestedTools = ['calendar', 'email', 'file_search'];
        break;
      case 'RESEARCH':
        suggestedTools = ['web_search', 'knowledge_search'];
        break;
      case 'TASK_MANAGEMENT':
        suggestedTools = ['task_manager'];
        break;
      case 'MEMORY_OPERATION':
        suggestedTools = ['memory_save', 'memory_search'];
        break;
      case 'COMMUNICATION':
        suggestedTools = ['email', 'message_draft'];
        break;
      case 'KNOWLEDGE_QUERY':
        suggestedTools = ['knowledge_search', 'document_search'];
        break;
      case 'AUTOMATION':
        suggestedTools = ['automation_builder', 'reminder'];
        break;
    }

    return {
      type: maxIntent,
      confidence,
      entities,
      requiresPermission,
      suggestedTools,
      uncertainty: uncertainty.length > 0 ? uncertainty : undefined,
      contradiction
    };
  }

  static detectUncertainty(input: string): string[] {
    const uncertainties: string[] = [];
    const lower = input.toLowerCase();
    
    if (lower.includes('maybe') || lower.includes('perhaps') || lower.includes('might')) {
      uncertainties.push('User expressed uncertainty with hedging language');
    }
    if (lower.includes('?') && lower.split('?').length > 2) {
      uncertainties.push('Multiple questions - intent may be ambiguous');
    }
    if (input.length < 10) {
      uncertainties.push('Very short input - may lack context');
    }
    if (lower.match(/\b(it|this|that|them)\b/) && !lower.match(/\b(it is|this is)\b/)) {
      uncertainties.push('Pronouns without clear antecedent');
    }
    
    return uncertainties;
  }

  // Helper to check if input is simple conversational (for orchestrator to use natural responses)
  static isSimpleConversational(input: string): { isConversational: boolean; subIntent: string } {
    const trimmed = input.trim().toLowerCase();
    
    if (/^(hello|hi|hey|howdy|greetings|good morning|good afternoon|good evening|good day)[\s!.,]*$/i.test(trimmed) ||
        /^(hello|hi|hey)\s+(there|manisk|assistant)[\s!.,]*$/i.test(trimmed)) {
      return { isConversational: true, subIntent: 'greeting' };
    }
    if (/^(bye|goodbye|see you|farewell|bye bye|take care|good night|see ya)[\s!.,]*$/i.test(trimmed)) {
      return { isConversational: true, subIntent: 'farewell' };
    }
    if (/^(thanks|thank you|thx|thanks a lot|thank you so much|appreciated)[\s!.,]*$/i.test(trimmed)) {
      return { isConversational: true, subIntent: 'thanks' };
    }
    if (/^(how are you|how are you doing|how's it going)[\s?.!]*$/i.test(trimmed)) {
      return { isConversational: true, subIntent: 'how_are_you' };
    }
    if (/^(who are you|what are you|what is your name|who is manisk|what is manisk)[\s?.!]*$/i.test(trimmed)) {
      return { isConversational: true, subIntent: 'identity' };
    }
    if (/^(help|what can you do|capabilities)[\s?.!]*$/i.test(trimmed)) {
      return { isConversational: true, subIntent: 'help' };
    }
    
    return { isConversational: false, subIntent: 'general' };
  }
}
