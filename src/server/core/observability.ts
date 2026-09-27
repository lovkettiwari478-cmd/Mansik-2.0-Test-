import { getDb } from '../db/index.js';
import { config } from '../config.js';
import { ModelRouter } from './modelRouter.js';

let startTime = Date.now();

export class Observability {
  static getHealth(): any {
    const db = getDb();
    let dbStatus = 'healthy';
    let dbLatency = 0;
    
    try {
      const start = Date.now();
      db.prepare('SELECT 1').get();
      dbLatency = Date.now() - start;
    } catch (e) {
      dbStatus = 'down';
    }
    
    // Background jobs stats
    let jobStats = { active: 0, queued: 0, failed: 0 };
    try {
      const queued = db.prepare("SELECT COUNT(*) as c FROM background_jobs WHERE status = 'queued'").get() as any;
      const running = db.prepare("SELECT COUNT(*) as c FROM background_jobs WHERE status = 'running'").get() as any;
      const failed = db.prepare("SELECT COUNT(*) as c FROM background_jobs WHERE status = 'failed'").get() as any;
      jobStats = { queued: queued.c, active: running.c, failed: failed.c };
    } catch {}
    
    const providers = ModelRouter.getProviderStatus();
    
    const allHealthy = dbStatus === 'healthy';
    
    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: { status: dbStatus, latencyMs: dbLatency },
        aiProviders: providers,
        backgroundWorkers: jobStats,
        storage: { status: 'healthy', usagePercent: 0 }
      },
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: config.version
    };
  }
  
  static log(level: 'info' | 'warn' | 'error', message: string, meta?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, ...meta };
    
    // Structured logging
    console.log(JSON.stringify(logEntry));
  }
  
  static getMetrics(userId?: string): any {
    const db = getDb();
    
    const metrics: any = {};
    
    try {
      if (userId) {
        metrics.tasks = db.prepare('SELECT status, COUNT(*) as count FROM tasks WHERE user_id = ? GROUP BY status').all(userId);
        metrics.memories = db.prepare('SELECT type, COUNT(*) as count FROM memories WHERE user_id = ? GROUP BY type').all(userId);
        metrics.modelUsage = db.prepare('SELECT provider, SUM(input_tokens + output_tokens) as tokens, SUM(cost) as cost, COUNT(*) as requests FROM model_usage WHERE user_id = ? GROUP BY provider').all(userId);
        metrics.jobs = db.prepare('SELECT status, COUNT(*) as count FROM background_jobs WHERE user_id = ? GROUP BY status').all(userId);
      } else {
        metrics.totalUsers = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
        metrics.totalTasks = (db.prepare('SELECT COUNT(*) as c FROM tasks').get() as any).c;
        metrics.totalMemories = (db.prepare('SELECT COUNT(*) as c FROM memories').get() as any).c;
      }
    } catch (e) {
      console.warn('Failed to get metrics:', e);
    }
    
    return metrics;
  }
}
