import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

export class AuditLogger {
  static log(params: {
    userId: string;
    action: string;
    resource: string;
    resourceId?: string;
    status: 'success' | 'failure' | 'denied';
    requestId: string;
    ip?: string;
    userAgent?: string;
    details?: Record<string, any>;
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  }) {
    try {
      const db = getDb();
      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, resource, resource_id, status, timestamp, ip, user_agent, request_id, details, risk_level)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        params.userId,
        params.action,
        params.resource,
        params.resourceId || null,
        params.status,
        params.ip || null,
        params.userAgent || null,
        params.requestId,
        params.details ? JSON.stringify(params.details) : null,
        params.riskLevel || 'low'
      );
    } catch (e) {
      console.error('Failed to write audit log:', e);
    }
  }
  
  static getLogs(userId: string, options: { limit?: number; offset?: number; action?: string; status?: string } = {}): any[] {
    const db = getDb();
    let sql = 'SELECT * FROM audit_logs WHERE user_id = ?';
    const params: any[] = [userId];
    
    if (options.action) {
      sql += ' AND action = ?';
      params.push(options.action);
    }
    if (options.status) {
      sql += ' AND status = ?';
      params.push(options.status);
    }
    
    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(options.limit || 50, options.offset || 0);
    
    return db.prepare(sql).all(...params) as any[];
  }
  
  static detectSuspiciousActivity(userId: string): Array<{ type: string; count: number; risk: string }> {
    const db = getDb();
    const suspicious: Array<{ type: string; count: number; risk: string }> = [];
    
    // Check for many denied attempts in last hour
    const deniedCount = db.prepare(`
      SELECT COUNT(*) as count FROM audit_logs 
      WHERE user_id = ? AND status = 'denied' AND timestamp > datetime('now', '-1 hour')
    `).get(userId) as any;
    
    if (deniedCount.count > 5) {
      suspicious.push({ type: 'multiple_denied_permissions', count: deniedCount.count, risk: 'high' });
    }
    
    // Check for rapid task creation
    const rapidTasks = db.prepare(`
      SELECT COUNT(*) as count FROM audit_logs 
      WHERE user_id = ? AND action = 'task_create' AND timestamp > datetime('now', '-5 minutes')
    `).get(userId) as any;
    
    if (rapidTasks.count > 10) {
      suspicious.push({ type: 'rapid_task_creation', count: rapidTasks.count, risk: 'medium' });
    }
    
    // Check for failed logins
    const failedLogins = db.prepare(`
      SELECT COUNT(*) as count FROM audit_logs 
      WHERE user_id = ? AND action = 'login' AND status = 'failure' AND timestamp > datetime('now', '-15 minutes')
    `).get(userId) as any;
    
    if (failedLogins.count > 3) {
      suspicious.push({ type: 'multiple_failed_logins', count: failedLogins.count, risk: 'high' });
    }
    
    return suspicious;
  }
}
