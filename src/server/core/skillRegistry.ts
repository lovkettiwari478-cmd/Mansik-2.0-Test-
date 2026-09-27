import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

export interface Skill {
  id: string;
  userId?: string;
  name: string;
  description: string;
  version: string;
  permissions: string[];
  tools: string[];
  isEnabled: boolean;
  isSystem: boolean;
  config?: Record<string, any>;
}

export class SkillRegistry {
  static list(userId: string): Skill[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM skills WHERE (user_id = ? OR is_system = 1) ORDER BY is_system DESC, name ASC').all(userId) as any[];
    
    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      description: r.description,
      version: r.version,
      permissions: JSON.parse(r.permissions || '[]'),
      tools: JSON.parse(r.tools || '[]'),
      isEnabled: !!r.is_enabled,
      isSystem: !!r.is_system,
      config: r.config ? JSON.parse(r.config) : undefined
    }));
  }
  
  static get(skillId: string, userId: string): Skill | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM skills WHERE id = ? AND (user_id = ? OR is_system = 1)').get(skillId, userId) as any;
    if (!row) return null;
    
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      version: row.version,
      permissions: JSON.parse(row.permissions || '[]'),
      tools: JSON.parse(row.tools || '[]'),
      isEnabled: !!row.is_enabled,
      isSystem: !!row.is_system,
      config: row.config ? JSON.parse(row.config) : undefined
    };
  }
  
  static create(userId: string, skill: { name: string; description: string; permissions: string[]; tools: string[]; config?: any }): Skill {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO skills (id, user_id, name, description, version, permissions, tools, is_enabled, is_system, config, created_at, updated_at)
      VALUES (?, ?, ?, ?, '1.0.0', ?, ?, 1, 0, ?, ?, ?)
    `).run(
      id,
      userId,
      skill.name,
      skill.description,
      JSON.stringify(skill.permissions),
      JSON.stringify(skill.tools),
      skill.config ? JSON.stringify(skill.config) : null,
      now,
      now
    );
    
    return this.get(id, userId)!;
  }
  
  static update(userId: string, skillId: string, updates: Partial<Skill>): Skill | null {
    const db = getDb();
    const existing = this.get(skillId, userId);
    if (!existing || existing.isSystem) return null;
    
    const fields: string[] = [];
    const values: any[] = [];
    
    if (updates.name) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.description) { fields.push('description = ?'); values.push(updates.description); }
    if (updates.permissions) { fields.push('permissions = ?'); values.push(JSON.stringify(updates.permissions)); }
    if (updates.tools) { fields.push('tools = ?'); values.push(JSON.stringify(updates.tools)); }
    if (updates.isEnabled !== undefined) { fields.push('is_enabled = ?'); values.push(updates.isEnabled ? 1 : 0); }
    if (updates.config) { fields.push('config = ?'); values.push(JSON.stringify(updates.config)); }
    
    if (fields.length === 0) return existing;
    
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(skillId, userId);
    
    db.prepare(`UPDATE skills SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
    
    return this.get(skillId, userId);
  }
  
  static delete(userId: string, skillId: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM skills WHERE id = ? AND user_id = ? AND is_system = 0').run(skillId, userId);
    return result.changes > 0;
  }
  
  static toggle(userId: string, skillId: string, enabled: boolean): boolean {
    const db = getDb();
    const result = db.prepare("UPDATE skills SET is_enabled = ?, updated_at = datetime('now') WHERE id = ? AND (user_id = ? OR is_system = 1)").run(enabled ? 1 : 0, skillId, userId);
    return result.changes > 0;
  }
  
  static seedSystemSkills() {
    const db = getDb();
    const systemSkills = [
      { id: 'skill_calendar', name: 'Calendar Manager', description: 'Manages calendar events, conflict detection, scheduling', permissions: ['calendar:read', 'calendar:write'], tools: ['calendar'] },
      { id: 'skill_email', name: 'Email Assistant', description: 'Email summarization, drafting, important detection (REQUIRES CONFIGURATION)', permissions: ['communication:read', 'communication:send_email'], tools: ['email'] },
      { id: 'skill_research', name: 'Research Agent', description: 'Web research, multi-source, fact checking', permissions: ['research:web_search'], tools: ['web_search', 'knowledge_search'] },
      { id: 'skill_memory', name: 'Memory Keeper', description: 'Long-term memory, preferences, knowledge graph', permissions: ['memory:read', 'memory:write'], tools: ['memory_save', 'memory_search'] },
      { id: 'skill_computer', name: 'Computer Agent', description: 'File search, organization, coding assistance', permissions: ['computer:read', 'computer:write'], tools: ['file_search', 'code_assistant'] },
      { id: 'skill_creative', name: 'Creative Studio', description: 'Image generation, editing, analysis (REQUIRES CONFIGURATION)', permissions: ['creative:generate'], tools: ['image_generation'] },
      { id: 'skill_smart_home', name: 'Smart Home', description: 'Device control, routines, modes (REQUIRES HARDWARE)', permissions: ['smart_home:control'], tools: ['smart_home'] },
      { id: 'skill_task', name: 'Task Executor', description: 'Autonomous task planning and execution', permissions: ['task:read', 'task:write', 'task:execute'], tools: ['task_manager'] },
    ];
    
    for (const skill of systemSkills) {
      const existing = db.prepare('SELECT id FROM skills WHERE id = ?').get(skill.id) as any;
      if (!existing) {
        db.prepare(`
          INSERT INTO skills (id, user_id, name, description, version, permissions, tools, is_enabled, is_system, created_at, updated_at)
          VALUES (?, NULL, ?, ?, '1.0.0', ?, ?, 1, 1, datetime('now'), datetime('now'))
        `).run(skill.id, skill.name, skill.description, JSON.stringify(skill.permissions), JSON.stringify(skill.tools));
      }
    }
  }
}
