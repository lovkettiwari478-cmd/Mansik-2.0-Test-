import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

export interface PermissionCheck {
  resource: string;
  action: string;
  toolId?: string;
  agentId?: string;
}

// Core permission engine
export class PermissionEngine {
  static check(userId: string, check: PermissionCheck): { granted: boolean; permission?: any; reason?: string } {
    const db = getDb();
    
    // Check for explicit deny first (most specific)
    const deny = db.prepare(`
      SELECT * FROM permissions 
      WHERE user_id = ? AND resource = ? AND action = ? AND granted = 0
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY created_at DESC LIMIT 1
    `).get(userId, check.resource, check.action) as any;
    
    if (deny) {
      return { granted: false, permission: deny, reason: 'Explicitly denied' };
    }
    
    // Check for explicit allow
    const allow = db.prepare(`
      SELECT * FROM permissions 
      WHERE user_id = ? AND resource = ? AND action = ? AND granted = 1
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY created_at DESC LIMIT 1
    `).get(userId, check.resource, check.action) as any;
    
    if (allow) {
      return { granted: true, permission: allow };
    }
    
    // Check wildcard permissions
    const wildcard = db.prepare(`
      SELECT * FROM permissions 
      WHERE user_id = ? AND (resource = '*' OR resource = ?) AND (action = '*' OR action = ?)
      AND granted = 1
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY LENGTH(resource) DESC, created_at DESC LIMIT 1
    `).get(userId, check.resource, check.action) as any;
    
    if (wildcard) {
      return { granted: true, permission: wildcard };
    }
    
    // Default deny for dangerous actions, allow for safe read actions
    const dangerousActions = ['send_email', 'delete', 'execute', 'write_file', 'browser_automation', 'smart_home_control', 'payment'];
    const safeReadActions = ['read', 'search', 'view', 'list', 'get'];
    
    if (safeReadActions.includes(check.action)) {
      return { granted: true, reason: 'Safe read action auto-allowed' };
    }
    
    if (dangerousActions.includes(check.action) || check.resource.includes('dangerous')) {
      return { granted: false, reason: 'Dangerous action requires explicit permission' };
    }
    
    // For other actions, require explicit permission
    return { granted: false, reason: 'No explicit permission found' };
  }
  
  static grant(userId: string, resource: string, action: string, options: {
    toolId?: string;
    agentId?: string;
    expiresInMs?: number;
    grantedBy?: string;
  } = {}): string {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const expiresAt = options.expiresInMs ? new Date(Date.now() + options.expiresInMs).toISOString() : null;
    
    db.prepare(`
      INSERT INTO permissions (id, user_id, agent_id, tool_id, resource, action, granted, granted_at, expires_at, is_temporary, granted_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      options.agentId || null,
      options.toolId || null,
      resource,
      action,
      now,
      expiresAt,
      options.expiresInMs ? 1 : 0,
      options.grantedBy || 'user',
      now
    );
    
    return id;
  }
  
  static revoke(userId: string, permissionId: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM permissions WHERE id = ? AND user_id = ?').run(permissionId, userId);
    return result.changes > 0;
  }
  
  static list(userId: string): any[] {
    const db = getDb();
    return db.prepare('SELECT * FROM permissions WHERE user_id = ? ORDER BY created_at DESC').all(userId) as any[];
  }
  
  static cleanupExpired() {
    const db = getDb();
    db.prepare("DELETE FROM permissions WHERE expires_at IS NOT NULL AND expires_at < datetime('now') AND is_temporary = 1").run();
  }
}

export function requirePermission(resource: string, action: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', code: 'NO_AUTH' });
    }
    
    const check = PermissionEngine.check(req.user.id, { resource, action });
    
    if (!check.granted) {
      // Log denied attempt
      const db = getDb();
      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, resource, status, timestamp, request_id, details, risk_level)
        VALUES (?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
      `).run(
        uuidv4(),
        req.user.id,
        action,
        resource,
        'denied',
        (req as any).requestId || uuidv4(),
        JSON.stringify({ reason: check.reason }),
        'medium'
      );
      
      return res.status(403).json({
        error: 'Permission denied',
        code: 'PERMISSION_DENIED',
        resource,
        action,
        reason: check.reason,
        requiresApproval: true
      });
    }
    
    next();
  };
}
