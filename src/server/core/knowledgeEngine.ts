import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import { generateEmbedding } from '../lib/embeddings.js';

export class KnowledgeEngine {
  static async saveDocument(userId: string, doc: {
    title: string;
    type: 'pdf' | 'doc' | 'note' | 'text' | 'image' | 'other';
    content?: string;
    filePath?: string;
    mimeType?: string;
    size?: number;
    tags?: string[];
    source?: string;
  }): Promise<{ id: string; isDuplicate: boolean }> {
    const db = getDb();
    
    // Check for duplicate by title and content hash
    if (doc.content) {
      const existing = db.prepare('SELECT id, title FROM documents WHERE user_id = ? AND title = ?').get(userId, doc.title) as any;
      if (existing) {
        // Check content similarity
        const existingContent = db.prepare('SELECT content FROM documents WHERE id = ?').get(existing.id) as any;
        if (existingContent?.content && doc.content && existingContent.content.slice(0, 100) === doc.content.slice(0, 100)) {
          return { id: existing.id, isDuplicate: true };
        }
      }
    }
    
    const id = uuidv4();
    const now = new Date().toISOString();
    let embedding: string | null = null;
    
    if (doc.content) {
      try {
        const { embedding: emb } = await generateEmbedding(doc.content.slice(0, 4000));
        embedding = JSON.stringify(emb);
      } catch {}
    }
    
    db.prepare(`
      INSERT INTO documents (id, user_id, title, type, content, file_path, mime_type, size, embedding, tags, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      doc.title,
      doc.type,
      doc.content || null,
      doc.filePath || null,
      doc.mimeType || null,
      doc.size || null,
      embedding,
      doc.tags ? JSON.stringify(doc.tags) : null,
      doc.source || null,
      now,
      now
    );
    
    return { id, isDuplicate: false };
  }
  
  static search(userId: string, query: string, limit: number = 10): any[] {
    const db = getDb();
    const docs = db.prepare('SELECT * FROM documents WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100').all(userId) as any[];
    
    if (docs.length === 0) return [];
    
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    
    const scored = docs.map(d => {
      const titleLower = d.title.toLowerCase();
      const contentLower = (d.content || '').toLowerCase();
      
      let score = 0;
      for (const word of queryWords) {
        if (titleLower.includes(word)) score += 2;
        if (contentLower.includes(word)) score += 1;
      }
      
      // Tag matching
      if (d.tags) {
        try {
          const tags = JSON.parse(d.tags);
          for (const tag of tags) {
            if (queryLower.includes(tag.toLowerCase())) score += 1.5;
          }
        } catch {}
      }
      
      return { ...d, score };
    })
    .filter(d => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
    
    return scored;
  }
  
  static getById(userId: string, docId: string): any | null {
    const db = getDb();
    return db.prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?').get(docId, userId) as any || null;
  }
  
  static list(userId: string, options: { type?: string; limit?: number; offset?: number } = {}): any[] {
    const db = getDb();
    let sql = 'SELECT * FROM documents WHERE user_id = ?';
    const params: any[] = [userId];
    
    if (options.type) {
      sql += ' AND type = ?';
      params.push(options.type);
    }
    
    sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    params.push(options.limit || 20, options.offset || 0);
    
    return db.prepare(sql).all(...params) as any[];
  }
  
  static delete(userId: string, docId: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?').run(docId, userId);
    return result.changes > 0;
  }
  
  static linkDocuments(userId: string, docId1: string, docId2: string, relation: string): boolean {
    // In a full implementation, we'd have a links table
    // For now, we store linking info in metadata via tags or a simple approach
    const db = getDb();
    const doc1 = this.getById(userId, docId1);
    const doc2 = this.getById(userId, docId2);
    
    if (!doc1 || !doc2) return false;
    
    // Add link info to both documents' tags
    try {
      const tags1 = doc1.tags ? JSON.parse(doc1.tags) : [];
      const tags2 = doc2.tags ? JSON.parse(doc2.tags) : [];
      
      if (!tags1.includes(`linked:${docId2}`)) tags1.push(`linked:${docId2}:${relation}`);
      if (!tags2.includes(`linked:${docId1}`)) tags2.push(`linked:${docId1}:${relation}`);
      
      db.prepare("UPDATE documents SET tags = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(tags1), docId1);
      db.prepare("UPDATE documents SET tags = ?, updated_at = datetime('now') WHERE id = ?").run(JSON.stringify(tags2), docId2);
      
      return true;
    } catch {
      return false;
    }
  }
}
