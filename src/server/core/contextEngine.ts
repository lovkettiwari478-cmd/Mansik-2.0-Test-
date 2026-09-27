import { getDb } from '../db/index.js';
import { localEmbedding, cosineSimilarity } from '../lib/embeddings.js';

export interface ContextResult {
  conversationHistory: Array<{ role: string; content: string; timestamp: string }>;
  relevantMemories: Array<{ id: string; content: string; score: number; type: string }>;
  userPreferences: Record<string, any>;
  recentTasks: Array<{ id: string; title: string; status: string }>;
  upcomingEvents: Array<{ id: string; title: string; start_time: string }>;
  knowledgeSnippets: Array<{ id: string; title: string; content: string; score: number }>;
  summary: string;
}

export class ContextEngine {
  static async buildContext(userId: string, conversationId: string, currentInput: string): Promise<ContextResult> {
    const db = getDb();
    
    // Get conversation history (last 20 messages)
    const messages = db.prepare(`
      SELECT role, content, created_at as timestamp FROM messages 
      WHERE conversation_id = ? AND user_id = ? 
      ORDER BY created_at DESC LIMIT 20
    `).all(conversationId, userId) as any[];
    
    const conversationHistory = messages.reverse();
    
    // Get user preferences
    const user = db.prepare('SELECT preferences FROM users WHERE id = ?').get(userId) as any;
    const userPreferences = user?.preferences ? JSON.parse(user.preferences) : {};
    
    // Get relevant memories using embedding similarity
    const relevantMemories = await this.getRelevantMemories(userId, currentInput);
    
    // Get recent tasks
    const recentTasks = db.prepare(`
      SELECT id, title, status FROM tasks 
      WHERE user_id = ? 
      ORDER BY updated_at DESC LIMIT 5
    `).all(userId) as any[];
    
    // Get upcoming events (next 7 days)
    const upcomingEvents = db.prepare(`
      SELECT id, title, start_time FROM calendar_events 
      WHERE user_id = ? AND start_time >= datetime('now') AND start_time <= datetime('now', '+7 days')
      ORDER BY start_time ASC LIMIT 5
    `).all(userId) as any[];
    
    // Get knowledge snippets
    const knowledgeSnippets = await this.getRelevantKnowledge(userId, currentInput);
    
    // Build summary
    const summary = this.buildSummary(conversationHistory, relevantMemories, recentTasks);
    
    return {
      conversationHistory,
      relevantMemories,
      userPreferences,
      recentTasks,
      upcomingEvents,
      knowledgeSnippets,
      summary
    };
  }
  
  private static async getRelevantMemories(userId: string, query: string): Promise<Array<{ id: string; content: string; score: number; type: string }>> {
    const db = getDb();
    const memories = db.prepare(`
      SELECT id, content, type, embedding FROM memories 
      WHERE user_id = ? AND is_approved = 1
      ORDER BY updated_at DESC LIMIT 100
    `).all(userId) as any[];
    
    if (memories.length === 0) return [];
    
    const queryEmbedding = localEmbedding(query);
    
    const scored = memories.map(m => {
      let score = 0;
      try {
        if (m.embedding) {
          const emb = JSON.parse(m.embedding);
          score = cosineSimilarity(queryEmbedding, emb);
        } else {
          // Fallback to keyword matching
          const queryWords = query.toLowerCase().split(/\s+/);
          const contentWords = m.content.toLowerCase().split(/\s+/);
          const common = queryWords.filter(w => contentWords.includes(w)).length;
          score = common / Math.max(queryWords.length, 1) * 0.5;
        }
      } catch {
        score = 0;
      }
      return { id: m.id, content: m.content, type: m.type, score };
    })
    .filter(s => s.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
    
    return scored;
  }
  
  private static async getRelevantKnowledge(userId: string, query: string): Promise<Array<{ id: string; title: string; content: string; score: number }>> {
    const db = getDb();
    const docs = db.prepare(`
      SELECT id, title, content, embedding FROM documents 
      WHERE user_id = ? 
      ORDER BY updated_at DESC LIMIT 50
    `).all(userId) as any[];
    
    if (docs.length === 0) return [];
    
    const queryEmbedding = localEmbedding(query);
    
    const scored = docs.map(d => {
      let score = 0;
      try {
        if (d.embedding) {
          const emb = JSON.parse(d.embedding);
          score = cosineSimilarity(queryEmbedding, emb);
        } else {
          const queryWords = query.toLowerCase().split(/\s+/);
          const content = (d.content || d.title).toLowerCase();
          const common = queryWords.filter(w => content.includes(w)).length;
          score = common / Math.max(queryWords.length, 1) * 0.5;
        }
      } catch {
        score = 0;
      }
      return { id: d.id, title: d.title, content: (d.content || '').slice(0, 200), score };
    })
    .filter(s => s.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
    
    return scored;
  }
  
  private static buildSummary(history: any[], memories: any[], tasks: any[]): string {
    let summary = '';
    if (history.length > 0) {
      summary += `Recent conversation: ${history.length} messages. `;
    }
    if (memories.length > 0) {
      summary += `Relevant memories: ${memories.map(m => m.content.slice(0, 50)).join('; ')}. `;
    }
    if (tasks.length > 0) {
      summary += `Recent tasks: ${tasks.map(t => `${t.title} (${t.status})`).join(', ')}. `;
    }
    return summary || 'No prior context';
  }
  
  static async getShortTermContext(conversationId: string, userId: string, limit: number = 10): Promise<Array<{ role: string; content: string }>> {
    const db = getDb();
    const messages = db.prepare(`
      SELECT role, content FROM messages 
      WHERE conversation_id = ? AND user_id = ? 
      ORDER BY created_at DESC LIMIT ?
    `).all(conversationId, userId, limit) as any[];
    
    return messages.reverse();
  }
}
