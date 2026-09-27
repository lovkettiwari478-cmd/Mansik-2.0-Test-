import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import { generateEmbedding, localEmbedding, cosineSimilarity, findSimilar } from '../lib/embeddings.js';

export class MemoryEngine {
  static async save(userId: string, content: string, options: {
    type?: 'short_term' | 'long_term' | 'approved' | 'preference' | 'fact' | 'routine';
    source?: 'conversation' | 'user_input' | 'inferred' | 'imported';
    provenance?: string;
    tags?: string[];
    isApproved?: boolean;
    confidence?: number;
    expiresAt?: string;
  } = {}): Promise<{ id: string; isDuplicate: boolean; duplicateOf?: string }> {
    const db = getDb();
    
    // Check for duplicates
    const existing = db.prepare('SELECT id, content, embedding FROM memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(userId) as any[];
    
    const { embedding, provider } = await generateEmbedding(content);
    
    // Duplicate detection
    for (const mem of existing) {
      try {
        if (mem.embedding) {
          const existingEmb = JSON.parse(mem.embedding);
          const sim = cosineSimilarity(embedding, existingEmb);
          if (sim > 0.92) {
            return { id: mem.id, isDuplicate: true, duplicateOf: mem.id };
          }
        }
        // Fallback text similarity
        if (mem.content.toLowerCase() === content.toLowerCase()) {
          return { id: mem.id, isDuplicate: true, duplicateOf: mem.id };
        }
      } catch {}
    }
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO memories (id, user_id, type, content, embedding, embedding_provider, provenance, source, confidence, tags, is_approved, metadata, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      options.type || 'long_term',
      content,
      JSON.stringify(embedding),
      provider,
      options.provenance || 'user conversation',
      options.source || 'user_input',
      options.confidence || 1.0,
      options.tags ? JSON.stringify(options.tags) : null,
      options.isApproved ? 1 : 0,
      null,
      now,
      now,
      options.expiresAt || null
    );
    
    return { id, isDuplicate: false };
  }
  
  static async search(userId: string, query: string, options: { type?: string; limit?: number; threshold?: number; approvedOnly?: boolean } = {}): Promise<Array<{ id: string; content: string; type: string; score: number; provenance: string; createdAt: string }>> {
    const db = getDb();
    
    let sql = 'SELECT id, content, type, embedding, provenance, created_at FROM memories WHERE user_id = ?';
    const params: any[] = [userId];
    
    if (options.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }
    
    if (options.approvedOnly) {
      sql += ' AND is_approved = 1';
    }
    
    sql += ' ORDER BY updated_at DESC LIMIT 200';
    
    const memories = db.prepare(sql).all(...params) as any[];
    
    if (memories.length === 0) return [];
    
    const { embedding: queryEmbedding } = await generateEmbedding(query);
    
    const scored = memories.map(m => {
      let score = 0;
      try {
        if (m.embedding) {
          const emb = JSON.parse(m.embedding);
          score = cosineSimilarity(queryEmbedding, emb);
        } else {
          // Keyword fallback
          const queryWords = query.toLowerCase().split(/\s+/);
          const contentLower = m.content.toLowerCase();
          const matches = queryWords.filter(w => contentLower.includes(w)).length;
          score = matches / Math.max(queryWords.length, 1) * 0.5;
        }
      } catch {
        score = 0;
      }
      return {
        id: m.id,
        content: m.content,
        type: m.type,
        score,
        provenance: m.provenance,
        createdAt: m.created_at
      };
    })
    .filter(s => s.score >= (options.threshold || 0.15))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit || 10);
    
    return scored;
  }
  
  static list(userId: string, options: { type?: string; limit?: number; offset?: number } = {}): any[] {
    const db = getDb();
    let sql = 'SELECT * FROM memories WHERE user_id = ?';
    const params: any[] = [userId];
    
    if (options.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }
    
    sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(options.limit || 50, options.offset || 0);
    
    return db.prepare(sql).all(...params) as any[];
  }
  
  static getById(userId: string, memoryId: string): any | null {
    const db = getDb();
    const mem = db.prepare('SELECT * FROM memories WHERE id = ? AND user_id = ?').get(memoryId, userId) as any;
    return mem || null;
  }
  
  static async update(userId: string, memoryId: string, content: string, provenance?: string): Promise<boolean> {
    const db = getDb();
    const existing = this.getById(userId, memoryId);
    if (!existing) return false;
    
    const { embedding, provider } = await generateEmbedding(content);
    const now = new Date().toISOString();
    
    const result = db.prepare(`
      UPDATE memories SET content = ?, embedding = ?, embedding_provider = ?, provenance = ?, updated_at = ? 
      WHERE id = ? AND user_id = ?
    `).run(content, JSON.stringify(embedding), provider, provenance || existing.provenance + ' (corrected)', now, memoryId, userId);
    
    return result.changes > 0;
  }
  
  static delete(userId: string, memoryId: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?').run(memoryId, userId);
    return result.changes > 0;
  }
  
  static forget(userId: string, query: string): { deletedCount: number; deletedIds: string[] } {
    const db = getDb();
    // Find memories matching query
    const all = db.prepare('SELECT id, content FROM memories WHERE user_id = ?').all(userId) as any[];
    const queryLower = query.toLowerCase();
    
    const toDelete = all.filter(m => 
      m.content.toLowerCase().includes(queryLower) || 
      queryLower.includes(m.content.toLowerCase().slice(0, 20))
    );
    
    const deletedIds: string[] = [];
    for (const mem of toDelete) {
      db.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?').run(mem.id, userId);
      deletedIds.push(mem.id);
    }
    
    // Also handle "forget everything" or "forget this" with context - if query is vague, delete last 5 short-term
    if (deletedIds.length === 0 && (queryLower.includes('forget this') || queryLower.includes('forget that'))) {
      const recent = db.prepare('SELECT id FROM memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').all(userId) as any[];
      for (const r of recent) {
        db.prepare('DELETE FROM memories WHERE id = ?').run(r.id);
        deletedIds.push(r.id);
      }
    }
    
    return { deletedCount: deletedIds.length, deletedIds };
  }
  
  static approve(userId: string, memoryId: string): boolean {
    const db = getDb();
    const result = db.prepare("UPDATE memories SET is_approved = 1, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(memoryId, userId);
    return result.changes > 0;
  }
  
  static cleanupExpired() {
    const db = getDb();
    db.prepare("DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < datetime('now')").run();
  }
}
