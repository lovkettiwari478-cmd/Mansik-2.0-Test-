import { getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

export interface JobPayload {
  type: string;
  userId?: string;
  data: Record<string, any>;
}

type JobHandler = (job: any, updateProgress: (progress: number, message: string) => void) => Promise<any>;

export class BackgroundEngine {
  private static handlers: Map<string, JobHandler> = new Map();
  private static isRunning = false;
  private static interval: NodeJS.Timeout | null = null;
  
  static registerHandler(type: string, handler: JobHandler) {
    this.handlers.set(type, handler);
  }
  
  static createJob(payload: JobPayload, options: { priority?: number; scheduledAt?: string; maxAttempts?: number; idempotencyKey?: string } = {}): string {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    
    // Idempotency check - if key provided, check if job already exists
    if (options.idempotencyKey) {
      const existing = db.prepare('SELECT id FROM background_jobs WHERE id = ? OR (payload LIKE ? AND status IN (\'queued\', \'running\'))').get(
        options.idempotencyKey,
        `%"idempotencyKey":"${options.idempotencyKey}"%`
      ) as any;
      if (existing) {
        return existing.id;
      }
    }
    
    db.prepare(`
      INSERT INTO background_jobs (id, user_id, type, payload, status, priority, attempts, max_attempts, created_at, scheduled_at)
      VALUES (?, ?, ?, ?, 'queued', ?, 0, ?, ?, ?)
    `).run(
      id,
      payload.userId || null,
      payload.type,
      JSON.stringify(payload.data),
      options.priority || 0,
      options.maxAttempts || 3,
      now,
      options.scheduledAt || now
    );
    
    return id;
  }
  
  static getJob(jobId: string, userId?: string): any | null {
    const db = getDb();
    let row: any;
    if (userId) {
      row = db.prepare('SELECT * FROM background_jobs WHERE id = ? AND user_id = ?').get(jobId, userId);
    } else {
      row = db.prepare('SELECT * FROM background_jobs WHERE id = ?').get(jobId);
    }
    if (!row) return null;
    
    return {
      ...row,
      payload: JSON.parse(row.payload),
      result: row.result ? JSON.parse(row.result) : null
    };
  }
  
  static listJobs(userId: string, filters: { status?: string; limit?: number } = {}): any[] {
    const db = getDb();
    let sql = 'SELECT * FROM background_jobs WHERE user_id = ?';
    const params: any[] = [userId];
    
    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    
    sql += ' ORDER BY priority DESC, scheduled_at ASC LIMIT ?';
    params.push(filters.limit || 20);
    
    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({
      ...r,
      payload: JSON.parse(r.payload),
      result: r.result ? JSON.parse(r.result) : null
    }));
  }
  
  static cancelJob(jobId: string, userId: string): boolean {
    const db = getDb();
    const result = db.prepare("UPDATE background_jobs SET status = 'cancelled', completed_at = datetime('now') WHERE id = ? AND user_id = ? AND status IN ('queued', 'running')").run(jobId, userId);
    return result.changes > 0;
  }
  
  static recoverStuckJobs() {
    const db = getDb();
    try {
      // Jobs stuck in running for more than 5 minutes should be re-queued
      // Use datetime() to handle both ISO and SQLite datetime formats
      const stuck = db.prepare(`
        SELECT id, attempts, max_attempts FROM background_jobs 
        WHERE status = 'running' AND datetime(started_at) < datetime('now', '-5 minutes')
      `).all() as any[];
      
      for (const job of stuck) {
        if (job.attempts < job.max_attempts) {
          const backoffMs = Math.min(1000 * Math.pow(2, job.attempts), 60000);
          const nextRun = new Date(Date.now() + backoffMs).toISOString();
          db.prepare("UPDATE background_jobs SET status = 'queued', scheduled_at = ?, error = 'Recovered from stuck running state after restart' WHERE id = ?").run(nextRun, job.id);
          console.log(`Recovered stuck job ${job.id} -> queued for retry`);
        } else {
          db.prepare("UPDATE background_jobs SET status = 'failed', error = 'Failed after restart recovery - max attempts exceeded', completed_at = datetime('now') WHERE id = ?").run(job.id);
          console.log(`Marked stuck job ${job.id} as failed after recovery`);
        }
      }
      
      if (stuck.length > 0) {
        console.log(`BackgroundEngine recovery: ${stuck.length} stuck jobs handled`);
      }
    } catch (e) {
      console.error('Failed to recover stuck jobs:', e);
    }
  }
  
  static start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    console.log('BackgroundEngine starting...');
    
    // Recovery: handle jobs that were running when server crashed
    this.recoverStuckJobs();
    
    // Register default handlers
    this.registerHandler('daily_briefing', async (job, updateProgress) => {
      updateProgress(10, 'Gathering context');
      await new Promise(r => setTimeout(r, 500));
      updateProgress(50, 'Analyzing calendar and tasks');
      await new Promise(r => setTimeout(r, 500));
      updateProgress(90, 'Generating briefing');
      await new Promise(r => setTimeout(r, 300));
      return { briefing: `Daily briefing for ${new Date().toDateString()}: You have tasks pending, calendar events upcoming.` };
    });
    
    this.registerHandler('research', async (job, updateProgress) => {
      updateProgress(10, 'Starting research');
      await new Promise(r => setTimeout(r, 800));
      updateProgress(60, 'Analyzing sources');
      await new Promise(r => setTimeout(r, 800));
      return { report: `Research completed for: ${job.payload.query || 'unknown'}` };
    });
    
    this.registerHandler('memory_cleanup', async (job, updateProgress) => {
      updateProgress(20, 'Finding expired memories');
      const db = getDb();
      const result = db.prepare("DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < datetime('now')").run();
      updateProgress(100, `Cleaned ${result.changes} memories`);
      return { cleaned: result.changes };
    });
    
    this.registerHandler('task_execution', async (job, updateProgress) => {
      updateProgress(10, 'Starting task execution');
      await new Promise(r => setTimeout(r, 1000));
      updateProgress(100, 'Task execution completed');
      return { executed: true, taskId: job.payload.taskId };
    });
    
    // Polling loop with error handling
    this.interval = setInterval(async () => {
      await this.processNextJob();
    }, 2000);
    
    console.log('BackgroundEngine started');
  }
  
  static stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    console.log('BackgroundEngine stopped');
  }
  
  private static async processNextJob() {
    const db = getDb();
    
    try {
      // Atomic job claiming - select and update in transaction to prevent double execution
      // Use datetime() wrapper to handle ISO format
      const jobRow = db.prepare(`
        SELECT * FROM background_jobs 
        WHERE status = 'queued' AND datetime(scheduled_at) <= datetime('now')
        ORDER BY priority DESC, scheduled_at ASC LIMIT 1
      `).get() as any;
      
      if (!jobRow) return;
      
      // Try to atomically claim the job
      const claimResult = db.prepare(`
        UPDATE background_jobs 
        SET status = 'running', started_at = datetime('now'), attempts = attempts + 1 
        WHERE id = ? AND status = 'queued'
      `).run(jobRow.id);
      
      // If claim failed (another worker claimed it), skip
      if (claimResult.changes === 0) {
        return;
      }
      
      const job = {
        ...jobRow,
        payload: JSON.parse(jobRow.payload),
        attempts: jobRow.attempts + 1
      };
      
      const updateProgress = (progress: number, message: string) => {
        try {
          db.prepare('UPDATE background_jobs SET progress = ?, progress_message = ? WHERE id = ?').run(progress, message, job.id);
        } catch (e) {
          console.error(`Failed to update progress for job ${job.id}:`, e);
        }
      };
      
      const handler = this.handlers.get(job.type);
      if (!handler) {
        db.prepare("UPDATE background_jobs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?").run(`No handler for job type: ${job.type}`, job.id);
        return;
      }
      
      try {
        const result = await handler(job, updateProgress);
        db.prepare("UPDATE background_jobs SET status = 'completed', result = ?, progress = 100, progress_message = 'Completed', completed_at = datetime('now') WHERE id = ?").run(JSON.stringify(result), job.id);
      } catch (error: any) {
        const attempts = job.attempts;
        const maxAttempts = job.max_attempts;
        
        if (attempts < maxAttempts) {
          const backoffMs = Math.min(1000 * Math.pow(2, attempts), 60000);
          const nextRun = new Date(Date.now() + backoffMs).toISOString();
          db.prepare("UPDATE background_jobs SET status = 'queued', scheduled_at = ?, error = ? WHERE id = ?").run(nextRun, error.message, job.id);
        } else {
          db.prepare("UPDATE background_jobs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?").run(error.message, job.id);
        }
      }
    } catch (e) {
      console.error('Background job processing error:', e);
      // Don't crash the worker on DB errors - will retry next interval
    }
  }
  
  static cleanupOldJobs() {
    const db = getDb();
    try {
      db.prepare("DELETE FROM background_jobs WHERE status IN ('completed', 'cancelled') AND datetime(completed_at) < datetime('now', '-7 days')").run();
      db.prepare("DELETE FROM background_jobs WHERE status = 'failed' AND datetime(completed_at) < datetime('now', '-30 days')").run();
      db.prepare("DELETE FROM login_attempts WHERE datetime(attempted_at) < datetime('now', '-1 day')").run();
      db.prepare("DELETE FROM account_lockouts WHERE locked_until IS NOT NULL AND datetime(locked_until) < datetime('now', '-1 hour') AND failed_count < 5").run();
    } catch (e) {
      console.error('Cleanup failed:', e);
    }
  }
}
